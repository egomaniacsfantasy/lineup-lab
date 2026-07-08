/**
 * Provider-agnostic API surface for the client.
 * The client only ever talks to these routes — never to provider APIs.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { sleeperProvider } from '../providers/sleeperProvider.js';
import { createEspnProvider, espnConnect } from '../providers/espnProvider.js';
import { saveEspnCreds } from '../providers/espnCredStore.js';
import { cached, callLog, callsInLastMinute, invalidate } from '../cache.js';
import { isGameWindow } from '../gameWindows.js';
import { getLeaguePricing, priceTrade } from '../engine/engine.js';
import { readHistory, readTitleHistory, recordPricing } from '../engine/lineStore.js';
import { SEASON_ANCHORS, computeSeasonState } from '../config/season.js';
import { getActiveProjections } from '../projections/store.js';
import { getAdjustedProjections } from '../projections/adjusted.js';
import { getNflSchedule } from '../services/nflSchedule.js';
import { getRequestUserId } from '../services/supabaseAdmin.js';
import { runScoutingHarvest } from '../services/scoutingHarvest/index.js';
import {
  getScoutingEdits,
  getScoutingReads,
  mergeReadAndEdit,
  upsertScoutingEdit,
} from '../services/scoutingStore.js';
import { computeRosterNeeds, computeSuperlatives } from '../services/scoutingSignals.js';

const DAY = 24 * 60 * 60_000;
const autoHarvested = new Set();

/**
 * A user's "Build Your Own Rankings" overlay rides on a base64 JSON header so
 * the polled GET /lines stays a GET. Deltas-only (just the players the user
 * touched), so it stays small. Shape: { [playerId]: { base?, weekly? } }.
 */
function parseOverlayHeader(req) {
  const raw = req.get('x-olympus-overlay');
  if (!raw) return null;
  try {
    const obj = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return obj && typeof obj === 'object' && Object.keys(obj).length ? obj : null;
  } catch {
    return null;
  }
}

function overlayHash(overlay) {
  if (!overlay) return 'base';
  return crypto.createHash('sha1').update(JSON.stringify(overlay)).digest('hex').slice(0, 12);
}

/**
 * Pick the provider for this request. ESPN needs a per-request instance bound
 * to the season and (for private leagues) the user's own cookies, passed as
 * headers so they never land in a URL or a log.
 */
function getProvider(req) {
  if (req.query.provider === 'espn') {
    return createEspnProvider({
      season: req.query.season ?? String(new Date().getUTCFullYear()),
      espnS2: req.get('x-espn-s2') || null,
      swid: req.get('x-espn-swid') || null,
    });
  }
  return sleeperProvider;
}

export const apiRouter = Router();

function providerName(req) {
  return req.query.provider === 'espn' || req.body?.provider === 'espn' ? 'espn' : 'sleeper';
}

function scoutingError(res, error) {
  if (error.message === 'scouting_store_unconfigured') {
    res.status(503).json({
      error: 'scouting_store_unconfigured',
      message: 'Scouting storage is not configured on this server.',
    });
    return true;
  }
  return false;
}

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, gameWindow: isGameWindow() });
});

apiRouter.get('/metrics', (_req, res) => {
  res.json({
    upstreamCalls: callLog.total,
    byEndpoint: callLog.byEndpoint,
    callsInLastMinute: callsInLastMinute(),
    gameWindow: isGameWindow(),
  });
});

apiRouter.get('/state', async (req, res, next) => {
  try {
    const state = await getProvider(req).getSeasonState();
    res.json({
      ...state,
      anchors: SEASON_ANCHORS,
      seasonState: computeSeasonState(state),
      // pre-kickoff Sleeper reports week 0 — the app lives in Week 1
      displayWeek: Math.max(1, state.displayWeek ?? state.week ?? 1),
      serverTime: Date.now(),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/nfl/schedule', async (req, res) => {
  const schedule = await getNflSchedule({
    season: req.query.season,
    week: req.query.week,
  });

  if (!schedule.available) {
    res.status(503).json({ available: false });
    return;
  }

  res.json(schedule);
});

/** Active projection model served as a ranking board ("Odds Gods model"). */
apiRouter.get('/rankings', (req, res) => {
  const active = getActiveProjections();

  if (!active) {
    res.json({ available: false, rankings: [] });
    return;
  }

  // Dedupe by playerId — a player can land in the sheet twice (depth-chart
  // quirks); the rankings board must show each exactly once or React key
  // collisions glitch the list.
  const byId = new Map();
  for (const p of active.projections) {
    if (!byId.has(p.playerId)) byId.set(p.playerId, p);
  }

  const limit = Math.min(Number(req.query.limit ?? 100), 800);
  const rankings = [...byId.values()]
    .sort((a, b) => b.mean - a.mean)
    .slice(0, limit)
    .map((p, index) => ({
      rank: index + 1,
      playerId: p.playerId,
      name: p.name,
      position: p.position,
      team: p.team,
      mean: p.mean,
      stdev: p.stdev ?? null,
      floor: p.floor ?? null,
      ceiling: p.ceiling ?? null,
      seasonTotal: p.seasonTotal ?? null,
      weekly: p.weekly ?? {},
      tier: p.tier,
      derived: p.derived,
    }));

  res.json({ available: true, source: 'Odds Gods model', version: active.version, rankings });
});

/**
 * Connect step 1: username → user + their leagues.
 * Tries the current season; if the user has none yet (offseason), falls
 * back to the previous season so the app still has something real to show.
 */
apiRouter.get('/connect/:username', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const user = await provider.getUser(req.params.username.trim());

    if (!user) {
      res.status(404).json({
        error: 'unknown_username',
        message:
          "We couldn't find that Sleeper username. Check the spelling — it's the name you log in with, not your team name.",
      });
      return;
    }

    const state = await provider.getSeasonState();
    let season = state.season;
    let leagues = await provider.getLeagues(user.id, season);

    if (leagues.length === 0 && state.previousSeason) {
      season = state.previousSeason;
      leagues = await provider.getLeagues(user.id, season);
    }

    if (leagues.length === 0) {
      res.status(404).json({
        error: 'no_leagues',
        message: `${user.displayName} has no Sleeper leagues for ${state.season} or ${state.previousSeason}. Join or create a league in Sleeper first.`,
      });
      return;
    }

    res.json({ user, season, leagues });
  } catch (error) {
    next(error);
  }
});

/**
 * ESPN connect: there's no username lookup, so the user supplies their league
 * id (from the league URL). We return the league + its teams so they can pick
 * which one is theirs. A private league answers 401/403 — we say so plainly so
 * the UI can ask for the espn_s2 + SWID cookies and retry.
 */
apiRouter.get('/espn/connect/:leagueId', async (req, res, next) => {
  try {
    const leagueId = req.params.leagueId.trim();
    const espnS2 = req.get('x-espn-s2') || null;
    const swid = req.get('x-espn-swid') || null;
    const result = await espnConnect({
      season: req.query.season ?? String(new Date().getUTCFullYear()),
      leagueId,
      espnS2,
      swid,
    });

    if (!result) {
      res.status(404).json({
        error: 'league_not_found',
        message:
          "We couldn't find that ESPN league. Double-check the league ID from your league URL and the season.",
      });
      return;
    }

    // Linked with fresh cookies → persist them so every later request (any
    // device, no extension) authenticates from the server store.
    if (espnS2 && swid) saveEspnCreds(leagueId, { espnS2, swid });

    res.json(result);
  } catch (error) {
    if (error.isPrivate) {
      res.status(403).json({
        error: 'espn_private',
        message:
          'This ESPN league is private. Paste your espn_s2 and SWID cookies to connect — they stay on your device and are read-only.',
      });
      return;
    }
    if (String(error.message).startsWith('espn_')) {
      res.status(404).json({
        error: 'league_not_found',
        message:
          "We couldn't reach that ESPN league. Check the league ID and season, then try again.",
      });
      return;
    }
    next(error);
  }
});

async function loadLeagueContext(provider, leagueId, userId) {
  const league = await provider.getLeague(leagueId);
  if (!league) return null;

  const [rosters, users, state] = await Promise.all([
    provider.getRosters(leagueId),
    provider.getUsers(leagueId),
    provider.getSeasonState(),
  ]);

  const usersByOwner = new Map(users.map((u) => [u.ownerId, u]));
  const teams = rosters.map((r) => {
    const owner = r.ownerId ? usersByOwner.get(r.ownerId) : null;
    return {
      ...r,
      ownerName: owner?.ownerName ?? 'Unmanaged team',
      teamName: owner?.teamName ?? `Roster ${r.rosterId}`,
      avatarUrl: owner?.avatarUrl ?? null,
      isUser:
        userId !== null &&
        userId !== undefined &&
        (r.ownerId === userId || (r.coOwners ?? []).includes(userId)),
    };
  });

  const isCurrentSeason = league.season === state.season;
  const week = Math.max(
    1,
    Math.min(
      isCurrentSeason ? (state.displayWeek || state.week || 1) : (league.lastScoredWeek ?? 1),
      18,
    ),
  );

  const matchups = await provider.getMatchups(leagueId, week);
  const rosteredIds = [...new Set(teams.flatMap((t) => t.players))];
  const players = await provider.getPlayerCatalog(rosteredIds);

  // real draft (when complete): picks feed the computed Draft Wrapped
  let draftPicks = null;
  try {
    const drafts = await provider.getDrafts(leagueId);
    const done = drafts.find((d) => d.status === 'complete');
    if (done) {
      draftPicks = await provider.getDraftPicks(done.draftId);
    }
  } catch {
    draftPicks = null;
  }

  return {
    league,
    teams,
    week,
    matchups,
    players,
    state,
    draftPicks,
    seasonState: computeSeasonState(state, league),
    anchors: SEASON_ANCHORS,
  };
}

/** Everything one league needs to render: league, teams, week matchups, players. */
apiRouter.get('/league/:leagueId/bootstrap', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const ctx = await loadLeagueContext(
      provider,
      req.params.leagueId,
      req.query.userId ?? null,
    );

    if (!ctx) {
      res.status(404).json({
        error: 'league_not_found',
        message: 'That league does not exist or is no longer available on Sleeper.',
      });
      return;
    }

    res.json({ ...ctx, players: ctx.players, lastUpdated: Date.now() });

    const key = `${provider.providerId}:${req.params.leagueId}`;
    if (!autoHarvested.has(key)) {
      autoHarvested.add(key);
      runScoutingHarvest({
        provider: provider.providerId,
        leagueId: req.params.leagueId,
        season: req.query.season,
        espnS2: req.get('x-espn-s2') || null,
        swid: req.get('x-espn-swid') || null,
      }).catch((error) => {
        if (error.message !== 'scouting_store_unconfigured') {
          console.error('[scouting] background harvest failed', error);
        }
      });
    }
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/scouting/harvest', async (req, res, next) => {
  try {
    const ownerUserId = await getRequestUserId(req);
    if (!ownerUserId) {
      res.status(401).json({ error: 'unauthorized', message: 'Sign in before harvesting scouting reports.' });
      return;
    }

    const leagueId = req.body?.leagueId ?? req.query.leagueId;
    if (!leagueId) {
      res.status(400).json({ error: 'missing_league_id' });
      return;
    }

    const result = await runScoutingHarvest({
      provider: providerName(req),
      leagueId,
      season: req.body?.season ?? req.query.season,
      espnS2: req.get('x-espn-s2') || null,
      swid: req.get('x-espn-swid') || null,
    });

    res.json({
      ok: true,
      provider: result.provider,
      leagueId: result.leagueId,
      eventCount: result.eventCount,
      readCount: result.readCount,
      report: result.report,
      reads: result.reads,
      scheduler: { available: false, note: 'No existing scheduled-job convention is present; use this route for refreshes.' },
    });
  } catch (error) {
    if (!scoutingError(res, error)) next(error);
  }
});

apiRouter.get('/scouting/league/:leagueId', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const ownerUserId = await getRequestUserId(req);
    const ctx = await loadLeagueContext(provider, req.params.leagueId, req.query.userId ?? null);
    if (!ctx) {
      res.status(404).json({ error: 'league_not_found' });
      return;
    }

    const [reads, edits] = await Promise.all([
      getScoutingReads({ provider: provider.providerId, leagueId: req.params.leagueId }),
      getScoutingEdits({ ownerUserId, leagueId: req.params.leagueId }),
    ]);
    const readsByManager = new Map(reads.map((read) => [read.manager_key, read]));
    const editsByManager = new Map(edits.map((edit) => [edit.manager_key, edit]));
    const identity = new Map(
      ctx.teams.map((team) => [team.ownerId ?? `vacant:${team.rosterId}`, team]),
    );

    res.json([...identity.keys()].map((managerKey) => {
      const team = identity.get(managerKey) ?? {};
      const ownedManagerKey = String(managerKey).startsWith('vacant:') ? null : managerKey;
      const effective = mergeReadAndEdit(
        ownedManagerKey ? readsByManager.get(ownedManagerKey) : null,
        ownedManagerKey ? editsByManager.get(ownedManagerKey) : null,
        ownedManagerKey ? computeRosterNeeds(ownedManagerKey, ctx) : null,
      );
      return {
        ...effective,
        manager_key: ownedManagerKey ?? managerKey,
        provider: provider.providerId,
        league_id: req.params.leagueId,
        manager: {
          manager_key: managerKey,
          name: team.ownerName ?? 'Manager',
          team_name: team.teamName ?? 'Team',
          roster_id: team.rosterId ?? null,
          avatar_url: team.avatarUrl ?? null,
          record: team.record
            ? `${team.record.wins}-${team.record.losses}${team.record.ties ? `-${team.record.ties}` : ''}`
            : '0-0',
        },
      };
    }));
  } catch (error) {
    if (!scoutingError(res, error)) next(error);
  }
});

apiRouter.put('/scouting/edits/:leagueId/:managerKey', async (req, res, next) => {
  try {
    const ownerUserId = await getRequestUserId(req);
    if (!ownerUserId) {
      res.status(401).json({ error: 'unauthorized', message: 'Sign in before editing scouting reports.' });
      return;
    }

    const saved = await upsertScoutingEdit({
      ownerUserId,
      leagueId: req.params.leagueId,
      managerKey: req.params.managerKey,
      overrides: req.body?.overrides ?? {},
      untouchables: req.body?.untouchables ?? [],
      favoriteTeam: req.body?.favorite_team ?? req.body?.favoriteTeam ?? null,
      negotiationStyle: req.body?.negotiation_style ?? req.body?.negotiationStyle ?? null,
      notes: req.body?.notes ?? null,
    });

    res.json({ ok: true, edit: saved });
  } catch (error) {
    if (!scoutingError(res, error)) next(error);
  }
});

apiRouter.get('/scouting/league/:leagueId/superlatives', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const ctx = await loadLeagueContext(provider, req.params.leagueId, req.query.userId ?? null);
    if (!ctx) {
      res.status(404).json({ error: 'league_not_found' });
      return;
    }
    const managerKeys = new Set(ctx.teams.map((team) => team.ownerId).filter(Boolean));
    const reads = await getScoutingReads({ provider: provider.providerId, leagueId: req.params.leagueId });
    res.json({ superlatives: computeSuperlatives(reads.filter((read) => managerKeys.has(read.manager_key))) });
  } catch (error) {
    if (!scoutingError(res, error)) next(error);
  }
});

/** Engine-priced lines for a league (requires an active projection import). */
apiRouter.get('/league/:leagueId/lines', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const userId = req.query.userId ?? null;
    const overlay = parseOverlayHeader(req);

    const pricing = await getLeaguePricing(async () => {
      const ctx = await loadLeagueContext(provider, leagueId, userId);
      if (!ctx) throw new Error('league_not_found');

      const lastWeek = Math.min((ctx.league.playoffWeekStart ?? 15) + 2, 18);
      const scheduleWeeks = await cached(`agg:schedule:${leagueId}`, 24 * 60 * 60_000, async () => {
        const all = [];
        for (let week = 1; week <= lastWeek; week += 1) {
          all.push({ week, matchups: await provider.getMatchups(leagueId, week) });
        }
        return all;
      });

      // Live agreement-weighted projections (falls back to the snapshot inside
      // the engine if nothing matched, e.g. before the first import).
      const adjusted = await getAdjustedProjections();
      return {
        ...ctx,
        catalog: ctx.players,
        scheduleWeeks,
        overlay,
        projections: adjusted.matched > 0 ? adjusted : undefined,
      };
    }, `${leagueId}:${userId}:${overlayHash(overlay)}`);

    if (pricing.available) {
      recordPricing(leagueId, pricing);
    }

    res.json(
      pricing.available
        ? { ...pricing, titleHistory: readTitleHistory(leagueId) }
        : pricing,
    );
  } catch (error) {
    next(error);
  }
});

/** Price a proposed trade for both sides (Market). */
apiRouter.post('/league/:leagueId/trade', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const { userId, partnerRosterId, give = [], get = [], traits = {} } = req.body ?? {};
    const overlay = parseOverlayHeader(req) ?? req.body?.overlay ?? null;

    const ctxBase = await loadLeagueContext(provider, leagueId, userId);
    if (!ctxBase) throw new Error('league_not_found');

    const lastWeek = Math.min((ctxBase.league.playoffWeekStart ?? 15) + 2, 18);
    const scheduleWeeks = await cached(`agg:schedule:${leagueId}`, 24 * 60 * 60_000, async () => {
      const all = [];
      for (let week = 1; week <= lastWeek; week += 1) {
        all.push({ week, matchups: await provider.getMatchups(leagueId, week) });
      }
      return all;
    });

    const adjusted = await getAdjustedProjections();
    const ctx = {
      ...ctxBase,
      catalog: ctxBase.players,
      scheduleWeeks,
      overlay,
      projections: adjusted.matched > 0 ? adjusted : undefined,
    };
    const userRosterId = ctx.teams.find((t) => t.isUser)?.rosterId ?? null;

    res.json(
      priceTrade(ctx, {
        userRosterId,
        partnerRosterId: Number(partnerRosterId),
        give,
        get,
        traits,
      }),
    );
  } catch (error) {
    next(error);
  }
});

/** Full-season schedule for the schedule grid; aggregated server-side, daily cache. */
apiRouter.get('/league/:leagueId/schedule', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const league = await provider.getLeague(leagueId);

    if (!league) {
      res.status(404).json({ error: 'league_not_found' });
      return;
    }

    const lastWeek = Math.min(
      (league.playoffWeekStart ?? 15) + 2,
      18,
    );

    const weeks = await cached(`agg:schedule:${leagueId}`, DAY, async () => {
      const all = [];
      for (let week = 1; week <= lastWeek; week += 1) {
        all.push({ week, matchups: await provider.getMatchups(leagueId, week) });
      }
      return all;
    });

    res.json({ leagueId, weeks, lastUpdated: Date.now() });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/league/:leagueId/matchups/:week', async (req, res, next) => {
  try {
    const matchups = await getProvider(req).getMatchups(
      req.params.leagueId,
      Number(req.params.week),
    );
    res.json({ matchups, lastUpdated: Date.now() });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/league/:leagueId/transactions/:week', async (req, res, next) => {
  try {
    res.json(
      await getProvider(req).getTransactions(req.params.leagueId, Number(req.params.week)),
    );
  } catch (error) {
    next(error);
  }
});

/** Line-movement history (inputsHash diffs) for the digest + notifications. */
apiRouter.get('/league/:leagueId/line-history', (req, res) => {
  res.json({ history: readHistory(req.params.leagueId) });
});

/** Force-refresh a league (drops caches); used by the manual refresh affordance. */
apiRouter.post('/league/:leagueId/refresh', (req, res) => {
  invalidate(`sleeper:rosters:${req.params.leagueId}`);
  invalidate(`sleeper:matchups:${req.params.leagueId}`);
  invalidate(`agg:schedule:${req.params.leagueId}`);
  invalidate(`pricing:${req.params.leagueId}`);
  res.json({ ok: true });
});
