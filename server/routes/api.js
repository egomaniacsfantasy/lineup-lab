/**
 * Provider-agnostic API surface for the client.
 * The client only ever talks to these routes — never to provider APIs.
 */
import { Router } from 'express';
import { sleeperProvider } from '../providers/sleeperProvider.js';
import { cached, callLog, callsInLastMinute, invalidate } from '../cache.js';
import { isGameWindow } from '../gameWindows.js';
import { getLeaguePricing, priceTrade } from '../engine/engine.js';
import { readHistory, readTitleHistory, recordPricing } from '../engine/lineStore.js';
import { SEASON_ANCHORS, computeSeasonState } from '../config/season.js';
import { getActiveProjections } from '../projections/store.js';

const DAY = 24 * 60 * 60_000;

// Provider registry — ESPN/Yahoo slot in here later.
const providers = { sleeper: sleeperProvider };

function getProvider(req) {
  return providers[req.query.provider ?? 'sleeper'] ?? sleeperProvider;
}

export const apiRouter = Router();

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

/** Active projection model served as a ranking board ("Olympus model"). */
apiRouter.get('/rankings', (req, res) => {
  const active = getActiveProjections();

  if (!active) {
    res.json({ available: false, rankings: [] });
    return;
  }

  const limit = Math.min(Number(req.query.limit ?? 100), 300);
  const rankings = [...active.projections]
    .sort((a, b) => b.mean - a.mean)
    .slice(0, limit)
    .map((p, index) => ({
      rank: index + 1,
      playerId: p.playerId,
      name: p.name,
      position: p.position,
      team: p.team,
      mean: p.mean,
      tier: p.tier,
      derived: p.derived,
    }));

  res.json({ available: true, source: 'Olympus model', version: active.version, rankings });
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
    const ctx = await loadLeagueContext(
      getProvider(req),
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
  } catch (error) {
    next(error);
  }
});

/** Engine-priced lines for a league (requires an active projection import). */
apiRouter.get('/league/:leagueId/lines', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const userId = req.query.userId ?? null;

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

      return { ...ctx, catalog: ctx.players, scheduleWeeks };
    }, `${leagueId}:${userId}`);

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

/** Price a proposed trade for both sides (Trade Command Center). */
apiRouter.post('/league/:leagueId/trade', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const { userId, partnerRosterId, give = [], get = [], traits = {} } = req.body ?? {};

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

    const ctx = { ...ctxBase, catalog: ctxBase.players, scheduleWeeks };
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
