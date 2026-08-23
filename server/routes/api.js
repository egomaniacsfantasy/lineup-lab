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
import {
  getLeaguePricing, priceTrade, analyzeTrade, suggestCounter, suggestTrades,
  computeSeasonBaseline, buildLiveProjectionInputs, priceLiveOverlay, LIVE_SIMS,
} from '../engine/engine.js';
import { readHistory, readTitleHistory, recordPricing } from '../engine/lineStore.js';
import { registerLeague, readRegistry } from '../engine/leagueRegistry.js';
import {
  isLiveOn, liveStatus, getOverlay, setOverlay, getBaseline, mergeLiveOverlay,
  setLiveMode, registerCycle,
} from '../live/liveEngine.js';
import { SEASON_ANCHORS, computeSeasonState, resolveFantasyWeek, isPreseason, resolvePricingWeek } from '../config/season.js';
import { buildDraftRecap } from '../services/draftRecap.js';
import { getActiveProjections } from '../projections/store.js';
import { getAdjustedProjections, getModelProjections } from '../projections/adjusted.js';
import {
  getFinalNflTeams,
  awaitFinalNflTeams,
  awaitNflGameState,
  getNflGameState,
  finalTeamsSignature,
  buildLiveLocks,
  normalizeTeam,
} from '../live/nflGameStatus.js';
import {
  readPlayoffSettings,
  writePlayoffSettings,
  playoffSettingsSignature,
} from '../engine/playoffSettingsStore.js';
import { getNflSchedule } from '../services/nflSchedule.js';
import { getRequestUserId } from '../services/supabaseAdmin.js';
import { runScoutingHarvest } from '../services/scoutingHarvest/index.js';
import {
  buildTradeRationaleFactors,
  maybeNarrateTradeRationale,
  renderStructuredTradeRationale,
} from '../services/tradeRationale.js';
import {
  getScoutingEdits,
  getScoutingReads,
  mergeReadAndEdit,
  upsertScoutingEdit,
} from '../services/scoutingStore.js';
import { computeRosterNeeds, computeSuperlatives } from '../services/scoutingSignals.js';

const DAY = 24 * 60 * 60_000;
const autoHarvested = new Set();
const DEFAULT_ESPN_LOGIN_WORKER_URL = 'https://odds-gods-espn-login-worker.onrender.com';
const ESPN_LOGIN_ENABLED = process.env.ESPN_LOGIN_ENABLED !== 'false';
const ESPN_LOGIN_WORKER_URL = process.env.ESPN_LOGIN_WORKER_URL || DEFAULT_ESPN_LOGIN_WORKER_URL;
const TRADE_RATIONALE_NARRATION_ENABLED = process.env.TRADE_RATIONALE_NARRATION_ENABLED === 'true';
const TRADE_RATIONALE_PROVIDER = process.env.TRADE_RATIONALE_PROVIDER || 'structured';
const TRADE_RATIONALE_MODEL = process.env.TRADE_RATIONALE_MODEL || '';
const TRADE_RATIONALE_API_KEY = process.env.TRADE_RATIONALE_API_KEY || process.env.OPENAI_API_KEY || '';

function espnLoginWorkerEndpoint() {
  if (!ESPN_LOGIN_WORKER_URL) return '';
  const trimmed = ESPN_LOGIN_WORKER_URL.replace(/\/+$/, '');
  return trimmed.endsWith('/login') ? trimmed : `${trimmed}/login`;
}

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

/** League scoring family -> the adjusted-projections suffix for that format. */
function scoringSuffix(scoringFamily) {
  if (scoringFamily === 'half-ppr') return '_half';
  if (scoringFamily === 'standard') return '_nonppr';
  return ''; // ppr
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
  res.json({
    ok: true,
    gameWindow: isGameWindow(),
    // Deployed commit (Render sets RENDER_GIT_COMMIT) so we can confirm what's live.
    commit: process.env.RENDER_GIT_COMMIT ?? 'local',
  });
});

apiRouter.get('/metrics', (_req, res) => {
  res.json({
    upstreamCalls: callLog.total,
    byEndpoint: callLog.byEndpoint,
    callsInLastMinute: callsInLastMinute(),
    gameWindow: isGameWindow(),
  });
});

apiRouter.post('/telemetry/event', (req, res) => {
  const { area, event, payload = {}, at } = req.body ?? {};
  const cleanPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/password|espnS2|espn_s2|swid|token|cookie|paste/i.test(key)) continue;
    cleanPayload[key] = value;
  }
  console.log('[telemetry]', {
    area: String(area ?? 'unknown').slice(0, 80),
    event: String(event ?? 'unknown').slice(0, 120),
    at: Number(at) || Date.now(),
    payload: cleanPayload,
  });
  res.json({ ok: true });
});

apiRouter.get('/state', async (req, res, next) => {
  try {
    const state = await getProvider(req).getSeasonState();
    res.json({
      ...state,
      anchors: SEASON_ANCHORS,
      seasonState: computeSeasonState(state),
      /* The NFL's week is not the fantasy week. In August Sleeper answers
         preseason week 2, and using that to index a league's schedule prices a
         week that has not happened. */
      displayWeek: resolveFantasyWeek(state),
      isPreseason: isPreseason(state),
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
apiRouter.get('/rankings', async (req, res, next) => {
  try {
    // Prefer the SAME set pricing/trades use: agreement-weighted (90/10) and
    // scoring-specific (PPR / half / standard, from ?scoring=). Falls back to the
    // raw snapshot only if the adjusted set is unavailable.
    const suf = scoringSuffix(String(req.query.scoring ?? ''));
    // The board asks for ?model=1 so it shows the pure combined-file numbers
    // (no agreement tilt). Pricing/trades still use the agreement-weighted set.
    const modelOnly = String(req.query.model ?? '') === '1';
    let active = null;
    let source = 'Odds Gods model';
    try {
      const adjusted = modelOnly ? await getModelProjections(suf) : await getAdjustedProjections(suf);
      if (adjusted && adjusted.matched > 0) {
        active = adjusted;
        source = modelOnly ? 'Odds Gods model' : 'Odds Gods model (agreement-weighted)';
      }
    } catch (err) {
      console.error('[rankings] adjusted projections failed; using snapshot', err);
    }
    if (!active) active = getActiveProjections();

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

    // Never let a browser serve a stale board (e.g. a raw-projection response
    // cached before the agreement-weighted set was live).
    res.set('Cache-Control', 'no-store');
    res.json({ available: true, source, version: active.version, rankings });
  } catch (error) {
    next(error);
  }
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
          "We couldn't find that Sleeper username. Check the spelling. Use the name you log in with, not your team name.",
      });
      return;
    }

    const state = await provider.getSeasonState();
    const season = state.season;

    // Merge the current AND previous season, deduped, instead of only falling
    // back to the previous season when the current is empty. In the off-season
    // Sleeper's "current" season can lag the season a freshly-created/-joined
    // league is filed under, so a league you just joined could sit in the other
    // season while you already have leagues in this one — and never show. Each
    // league carries its own season, so the picker connects to the right one.
    const seasons = [season, state.previousSeason].filter(Boolean);
    const byId = new Map();
    for (const s of seasons) {
      for (const lg of await provider.getLeagues(user.id, s)) {
        if (!byId.has(lg.id)) byId.set(lg.id, lg);
      }
    }
    const leagues = [...byId.values()];

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
 * the UI can escalate to the ESPN-site connector and retry.
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
    // device) authenticates from the server store.
    if (espnS2 && swid) saveEspnCreds(leagueId, { espnS2, swid });

    res.json(result);
  } catch (error) {
    if (error.isPrivate) {
      res.status(403).json({
        error: 'espn_private',
        message:
          "This ESPN league is private. Connect from ESPN's site to sync it.",
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

apiRouter.post('/espn/login/start', async (req, res, next) => {
  if (!ESPN_LOGIN_ENABLED) {
    res.status(503).json({
      error: 'espn_login_disabled',
      status: 'fallback',
      reason: 'disabled',
      message: "Log in with ESPN is off for this deploy. Use the ESPN-site connector below.",
    });
    return;
  }

  const { leagueId, season, email, password, otp, challengeId } = req.body ?? {};
  const isOtpContinuation = Boolean(challengeId && otp);
  if (!leagueId || !season || (!isOtpContinuation && (!email || !password))) {
    res.status(400).json({
      error: 'espn_login_missing_fields',
      status: 'fallback',
      reason: 'missing_fields',
      message: isOtpContinuation
        ? 'Enter the ESPN code to continue.'
        : 'Enter your ESPN email and password, then try again.',
    });
    return;
  }

  const workerUrl = espnLoginWorkerEndpoint();
  if (!workerUrl) {
    res.status(501).json({
      error: 'espn_login_worker_unavailable',
      status: 'fallback',
      reason: 'worker_unavailable',
      message: 'Log in with ESPN is not mounted on this server yet. Use the ESPN-site connector below.',
    });
    return;
  }

  try {
    const workerResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagueId, season, email, password, otp, challengeId }),
    });
    const body = await workerResponse.json().catch(() => ({}));

    if (!workerResponse.ok) {
      res.status(workerResponse.status).json({
        error: body.error ?? 'espn_login_failed',
        status: body.status ?? 'fallback',
        reason: body.reason ?? 'worker_error',
        message: body.message ?? 'ESPN would not complete that login. Use the ESPN-site connector below.',
      });
      return;
    }

    if (body.status === 'connected' && body.espnS2 && body.swid) {
      saveEspnCreds(leagueId, { espnS2: body.espnS2, swid: body.swid });
      const result = await espnConnect({
        season,
        leagueId,
        espnS2: body.espnS2,
        swid: body.swid,
      });
      res.json({ status: 'connected', ...result });
      return;
    }

    res.json(body);
  } catch (error) {
    next(error);
  }
});

async function loadLeagueContext(provider, leagueId, userId, weekOverride = null) {
  const league = await provider.getLeague(leagueId);
  if (!league) return null;

  // Layer any user-set playoff-structure override onto the detected config.
  const poOverride = readPlayoffSettings(leagueId);
  if (poOverride) {
    if (poOverride.divisionWinnerPriority != null) league.divisionWinnerPriority = poOverride.divisionWinnerPriority;
    if (poOverride.playoffReseed != null) league.playoffReseed = poOverride.playoffReseed;
  }

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
      /* `?? 'Unmanaged team'` collapsed two different facts into one label. A
         team can have an owner whose name we cannot honestly print (ESPN hands
         back a machine handle for accounts that never set a display name), and
         that team is managed — it just has nobody to name. Only a team with no
         owner record at all is unmanaged. */
      ownerName: owner ? owner.ownerName ?? null : 'Unmanaged team',
      teamName: owner?.teamName ?? `Roster ${r.rosterId}`,
      avatarUrl: owner?.avatarUrl ?? null,
      isUser:
        userId !== null &&
        userId !== undefined &&
        (r.ownerId === userId || (r.coOwners ?? []).includes(userId)),
    };
  });

  // Use the week the caller already resolved (so the pricing cache key and this
  // context can never disagree about which week to sim); otherwise resolve it here.
  const week = weekOverride ?? resolvePricingWeek(league, state);

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

// A provider built WITHOUT a request, for the scheduled repricer. ESPN uses the
// creds saved on connect (espnProvider falls back to the cred store when the
// header creds are null); Sleeper needs none.
export function buildHeadlessProvider(providerKind, season) {
  if (providerKind === 'espn') {
    return createEspnProvider({
      season: season ?? String(new Date().getUTCFullYear()),
      espnS2: null,
      swid: null,
    });
  }
  return sleeperProvider;
}

// Build + price a league's lines (shared by the /lines route and the 6h
// scheduler). getLeaguePricing caches 60s, so the scheduler always recomputes.
// Assemble the full pricing context (league + rosters + schedule + adjusted
// projections + any final-game locks). Shared by the cached static price and the
// live overlay so the two never build a different context.
async function assembleLeagueCtx(provider, leagueId, userId, overlay, finalTeams, weekOverride = null) {
  const ctx = await loadLeagueContext(provider, leagueId, userId, weekOverride);
  if (!ctx) throw new Error('league_not_found');

  const lastWeek = Math.min((ctx.league.playoffWeekStart ?? 15) + 2, 18);
  const scheduleWeeks = await cached(`agg:schedule:${leagueId}`, 24 * 60 * 60_000, async () => {
    const all = [];
    for (let week = 1; week <= lastWeek; week += 1) {
      all.push({ week, matchups: await provider.getMatchups(leagueId, week) });
    }
    return all;
  });

  let liveProjections;
  try {
    const adjusted = await getAdjustedProjections(scoringSuffix(ctx.league?.scoringFamily));
    if (adjusted && adjusted.matched > 0) liveProjections = adjusted;
  } catch (err) {
    console.error('[pricing] adjusted projections failed; using snapshot', err);
  }
  const liveLocks = buildLiveLocks(ctx.matchups, ctx.players, finalTeams);
  return { ...ctx, catalog: ctx.players, scheduleWeeks, overlay, projections: liveProjections, liveLocks };
}

export async function computeLeaguePricing(provider, leagueId, userId, overlay = null) {
  // Cheap, non-blocking read of which NFL teams' games are final (empty outside a
  // live regular-season game window). Folded into the cache key so a newly-final
  // game busts the price and re-locks those players.
  const finalTeams = getFinalNflTeams();
  const liveSig = finalTeamsSignature();
  // Resolve the fantasy week UP FRONT (both reads are provider-cached, so this is
  // cheap) and fold it into the cache key AND the built context. Without the week
  // in the key, a preseason week-1 price and a rollover-lag lastScoredWeek price
  // could share one cache slot and be served interchangeably — the title-odds flip
  // (~12% <-> ~6%, from a remaining week being dropped from the sim).
  let week = null;
  try {
    const [league, state] = await Promise.all([
      provider.getLeague(leagueId),
      provider.getSeasonState(),
    ]);
    if (league && state) week = resolvePricingWeek(league, state);
  } catch {
    // Fall back to letting the context resolve the week itself (key omits it).
  }
  return getLeaguePricing(
    () => assembleLeagueCtx(provider, leagueId, userId, overlay, finalTeams, week),
    `${leagueId}:${userId}:${overlayHash(overlay)}:${liveSig}:${playoffSettingsSignature(leagueId)}:w${week ?? '-'}`,
  );
}

/**
 * Compute ONE league's live overlay for the current game state: each team's live
 * distribution from the game clock + points so far, closed-form matchup win%, and
 * simulateSeasonLive futures off a cached baseline. Returns null off-season.
 */
export async function computeLeagueLiveOverlay(provider, leagueId, userId, gameState) {
  const finalTeams = getFinalNflTeams();
  const ctx = await assembleLeagueCtx(provider, leagueId, userId, null, finalTeams);
  const inputs = buildLiveProjectionInputs(ctx);
  if (!inputs) return null; // no projections (off-season)

  // Baseline signature: recomputes when projections, week, any lineup, or playoff
  // settings change. Stable while a game plays, so it's reused every 30s cycle.
  const rosterSig = ctx.teams.map((t) => `${t.rosterId}:${(t.starters ?? []).join('-')}`).join('|');
  const sig = `${inputs.version}:${ctx.week}:${rosterSig}:${playoffSettingsSignature(leagueId)}`;
  const baseline = getBaseline(leagueId, sig, () =>
    computeSeasonBaseline({
      league: ctx.league, teams: ctx.teams, scheduleWeeks: ctx.scheduleWeeks, week: ctx.week,
      projectionMap: inputs.projectionMap, catalog: ctx.catalog, slotLabels: inputs.slotLabels,
      seed: inputs.seed, sims: LIVE_SIMS,
    }),
  );

  // Per-player points so far (from the week's matchups) and fraction of game left
  // (from the player's NFL team's live game state; default 1 = not started).
  const pointsByPlayer = {};
  for (const m of ctx.matchups ?? []) Object.assign(pointsByPlayer, m.playersPoints ?? {});
  const fFor = (id) => {
    const team = normalizeTeam(ctx.catalog?.[id]?.team);
    const st = team ? gameState.get(team) : null;
    return st ? st.f : 1;
  };
  const live = { pointsForPlayer: (id) => pointsByPlayer[id] ?? 0, fForPlayer: fFor };
  return priceLiveOverlay(ctx, inputs, live, baseline);
}

/**
 * One live cycle (driven by the 30s loop while live mode is on): one shared
 * scoreboard read, then recompute + store an overlay for every registered league.
 */
async function runLiveCycle() {
  await awaitNflGameState(); // one shared scrape for the whole batch
  const gameState = getNflGameState();
  const registry = readRegistry();
  for (const leagueId of Object.keys(registry)) {
    const { userId, provider, season } = registry[leagueId] ?? {};
    try {
      const providerObj = buildHeadlessProvider(provider, season);
      const overlay = await computeLeagueLiveOverlay(providerObj, leagueId, userId ?? null, gameState);
      if (overlay) setOverlay(leagueId, overlay);
    } catch (err) {
      console.error(`[live] ${leagueId} overlay failed:`, err?.message ?? err);
    }
  }
}
registerCycle(runLiveCycle);

/**
 * Admin-only: force a LIVE reprice of every registered league. Reads the NFL
 * scoreboard fresh, locks any player whose game is final into the current week,
 * then re-sims (matchup + playoff + title) and records a line-history point.
 * Meant to be pressed after each game wave concludes. Staggered so a big batch
 * doesn't spike CPU.
 */
apiRouter.post('/admin/reprice', async (req, res, next) => {
  try {
    const expected = (process.env.ADMIN_PASSWORD ?? 'olympus-admin').trim();
    if ((req.get('x-admin-password') ?? '').trim() !== expected) {
      res.status(401).json({ error: 'unauthorized', message: 'Wrong admin password.' });
      return;
    }
    // Dynamic import avoids a static api.js <-> scheduler.js circular dependency.
    const { repriceAllLeagues } = await import('../scheduler.js');
    // stamp:false -> live numbers update everywhere, but the futures title/playoff
    // charts stay on the 6h line-history cadence (they only chart matters).
    const summary = await repriceAllLeagues({ live: true, staggerMs: 250, stamp: false });
    res.json({ ok: true, ...summary, finalTeams: [...getFinalNflTeams()] });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin-only: turn LIVE mode on/off. ON starts a 30s loop that scrapes the NFL
 * scoreboard once and refreshes every league's live matchup win% + futures; OFF
 * stops the loop and clears overlays so the app reverts to the static price. Flip
 * it ON before a game window, OFF after.
 */
apiRouter.post('/admin/live', (req, res) => {
  const expected = (process.env.ADMIN_PASSWORD ?? 'olympus-admin').trim();
  if ((req.get('x-admin-password') ?? '').trim() !== expected) {
    res.status(401).json({ error: 'unauthorized', message: 'Wrong admin password.' });
    return;
  }
  const on = req.body?.on === true || req.body?.on === 'true';
  res.json(setLiveMode(on));
});

/** Public: is live mode on right now (so the client knows to poll ~30s). */
apiRouter.get('/live/status', (_req, res) => {
  res.json(liveStatus());
});

/**
 * Playoff-structure settings for a league: what we detected + the effective values
 * (detected + any user override). Lets the UI show and edit the settings the sim
 * uses for seeding, so a user can correct them when we can't detect them.
 */
apiRouter.get('/league/:leagueId/playoff-settings', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const league = await provider.getLeague(req.params.leagueId);
    if (!league) {
      res.status(404).json({
        error: 'league_not_found',
        message:
          "We couldn't find that league on this account. Reconnect it and try again.",
      });
      return;
    }
    const override = readPlayoffSettings(req.params.leagueId);
    const divisions = league.divisions ?? null;
    const hasDivisions = (divisions ?? 0) >= 2;
    // Effective values (override wins; else detected; else engine default).
    const divisionWinnerPriority = hasDivisions
      ? (override?.divisionWinnerPriority ?? true) // default ON with divisions
      : null;
    const playoffReseed = override?.playoffReseed ?? league.playoffReseed ?? false;
    res.json({
      divisions,
      hasDivisions,
      divisionWinnerPriority,
      playoffReseed,
      detected: { playoffReseed: league.playoffReseed ?? null },
      override: override ?? null,
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/league/:leagueId/playoff-settings', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const patch = {};
    if ('divisionWinnerPriority' in body) patch.divisionWinnerPriority = body.divisionWinnerPriority;
    if ('playoffReseed' in body) patch.playoffReseed = body.playoffReseed;
    const saved = writePlayoffSettings(req.params.leagueId, patch);
    res.json({ ok: true, override: saved });
  } catch (err) {
    next(err);
  }
});

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
      res.status(400).json({
        error: 'missing_league_id',
        message: 'That request arrived without a league. Reload and try again.',
      });
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
      res.status(404).json({
        error: 'league_not_found',
        message:
          "We couldn't find that league on this account. Reconnect it and try again.",
      });
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
      res.status(404).json({
        error: 'league_not_found',
        message:
          "We couldn't find that league on this account. Reconnect it and try again.",
      });
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

    const pricing = await computeLeaguePricing(provider, leagueId, userId, overlay);

    if (pricing.available) {
      recordPricing(leagueId, pricing);
      // Remember this league so the 6h scheduler keeps its charts fed.
      registerLeague(leagueId, {
        userId,
        provider: req.query.provider === 'espn' ? 'espn' : 'sleeper',
        season: req.query.season ?? null,
      });
    }

    // Live mode: overlay live matchup win% + live futures onto the RESPONSE only
    // (line history above stays on the static/6h price). No-op when live is off or
    // this league has no overlay yet.
    const served =
      pricing.available && isLiveOn()
        ? mergeLiveOverlay(pricing, getOverlay(leagueId))
        : pricing;

    res.json(
      served.available
        ? { ...served, titleHistory: readTitleHistory(leagueId) }
        : served,
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

    let liveProjections;
    try {
      const adjusted = await getAdjustedProjections(scoringSuffix(ctxBase.league?.scoringFamily));
      if (adjusted && adjusted.matched > 0) liveProjections = adjusted;
    } catch (err) {
      console.error('[pricing] adjusted projections failed for trade; using snapshot', err);
    }

    const ctx = { ...ctxBase, catalog: ctxBase.players, scheduleWeeks, overlay, projections: liveProjections };
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

/** Trade analyzer: re-simulate the season with post-trade rosters, both sides. */
apiRouter.post('/league/:leagueId/trade-analyze', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const { userId, partnerRosterId, give = [], get = [], userDrops = null } = req.body ?? {};
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

    let liveProjections;
    try {
      const adjusted = await getAdjustedProjections(scoringSuffix(ctxBase.league?.scoringFamily));
      if (adjusted && adjusted.matched > 0) liveProjections = adjusted;
    } catch (err) {
      console.error('[trade-analyze] adjusted projections failed; using snapshot', err);
    }

    const ctx = { ...ctxBase, catalog: ctxBase.players, scheduleWeeks, overlay, projections: liveProjections };
    res.json(analyzeTrade(ctx, { partnerRosterId: Number(partnerRosterId), give, get, userDrops }));
  } catch (error) {
    next(error);
  }
});

/** Sim-based fair counter: the throw-in that best balances the two sides' Δ championship %. */
apiRouter.post('/league/:leagueId/trade-counter', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const { userId, partnerRosterId, give = [], get = [], userDrops = null, target = 0 } = req.body ?? {};
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

    let liveProjections;
    try {
      const adjusted = await getAdjustedProjections(scoringSuffix(ctxBase.league?.scoringFamily));
      if (adjusted && adjusted.matched > 0) liveProjections = adjusted;
    } catch (err) {
      console.error('[trade-counter] adjusted projections failed; using snapshot', err);
    }

    const ctx = { ...ctxBase, catalog: ctxBase.players, scheduleWeeks, overlay, projections: liveProjections };
    res.json(suggestCounter(ctx, { partnerRosterId: Number(partnerRosterId), give, get, userDrops, target }));
  } catch (error) {
    next(error);
  }
});

/** "Managers you match with": sim-scored trade suggestions (Δ championship % for
 *  both sides). The client applies acceptance + ranks by yourΔc × P(accept). */
apiRouter.post('/league/:leagueId/trade-suggestions', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const { userId } = req.body ?? {};
    const partnerRosterId = req.body?.partnerRosterId != null ? Number(req.body.partnerRosterId) : null;
    const position = ['QB', 'RB', 'WR', 'TE'].includes(req.body?.position) ? req.body.position : null;
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

    let liveProjections;
    try {
      const adjusted = await getAdjustedProjections(scoringSuffix(ctxBase.league?.scoringFamily));
      if (adjusted && adjusted.matched > 0) liveProjections = adjusted;
    } catch (err) {
      console.error('[trade-suggestions] adjusted projections failed; using snapshot', err);
    }

    const ctx = { ...ctxBase, catalog: ctxBase.players, scheduleWeeks, overlay, projections: liveProjections };
    // The sim is expensive but input-stable; cache per league+user+overlay for 2 min.
    const version = liveProjections?.version ?? 'snapshot';
    // Include the deploy commit so a new deploy never serves finder numbers that
    // disagree with the (live) analyzer running the newer code.
    const build = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev';
    // Your saved "read" per manager (friendliness/relationship) drives the accept %,
    // exactly like the Build-a-Trade analyzer. The client sends the reads it has;
    // absent, the scan falls back to neutral (5/5) = an un-scouted read.
    const readsByRoster = req.body?.readsByRoster ?? {};
    const readsSig = Object.entries(readsByRoster).sort()
      .map(([k, v]) => `${k}.${v?.friendliness ?? ''}.${v?.relationship ?? ''}`).join('_');
    const key = `agg:trade-suggestions:${leagueId}:${userId}:${partnerRosterId ?? 'all'}:${position ?? 'any'}:${version}:${overlay ? 'ov' : 'base'}:${build}:${readsSig}`;
    const result = await cached(key, 5 * 60_000, async () => suggestTrades(ctx, { maxSim: 20, partnerRosterId, position, readsByRoster }));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/** On-demand grounded trade rationale. Facts first, optional narration second. */
apiRouter.post('/league/:leagueId/trade-rationale', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const { userId, partnerRosterId, give = [], get = [], traits = {}, userDrops = null } = req.body ?? {};
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

    let liveProjections;
    try {
      const adjusted = await getAdjustedProjections(scoringSuffix(ctxBase.league?.scoringFamily));
      if (adjusted && adjusted.matched > 0) liveProjections = adjusted;
    } catch (err) {
      console.error('[trade-rationale] adjusted projections failed; using snapshot', err);
    }

    const ctx = { ...ctxBase, catalog: ctxBase.players, scheduleWeeks, overlay, projections: liveProjections };
    const userRosterId = ctx.teams.find((t) => t.isUser)?.rosterId ?? null;
    const price = priceTrade(ctx, {
      userRosterId,
      partnerRosterId: Number(partnerRosterId),
      give,
      get,
      traits,
    });
    const analysis = analyzeTrade(ctx, { partnerRosterId: Number(partnerRosterId), give, get, userDrops });
    const active = Array.isArray(liveProjections)
      ? { version: 'ctx-projections', projections: liveProjections }
      : liveProjections ?? getActiveProjections();
    const factors = buildTradeRationaleFactors({
      leagueId,
      projectionVersion: price.projectionVersion ?? active?.version ?? null,
      league: ctx.league,
      teams: ctx.teams,
      catalog: ctx.catalog,
      projections: active?.projections ?? [],
      price,
      analysis,
      partnerRosterId: Number(partnerRosterId),
      give,
      get,
    });
    const structured = renderStructuredTradeRationale(factors);
    const narrated = await maybeNarrateTradeRationale(factors, {
      enabled: TRADE_RATIONALE_NARRATION_ENABLED,
      provider: TRADE_RATIONALE_PROVIDER,
      model: TRADE_RATIONALE_MODEL,
      apiKey: TRADE_RATIONALE_API_KEY,
    });

    res.json({
      available: factors.available,
      source: narrated ? 'narrated' : 'structured',
      factors,
      structured,
      narration: narrated?.text ?? null,
      cached: narrated?.cached ?? false,
    });
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
      res.status(404).json({
        error: 'league_not_found',
        message:
          "We couldn't find that league on this account. Reconnect it and try again.",
      });
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
/* Draft Wrapped. Kept off the bootstrap on purpose: it needs the projection
   file and a full board sort, and a draft does not change once it is over, so
   making every league load pay for it would be a tax on a thing you look at
   once. */
apiRouter.get('/league/:leagueId/draft-recap', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const userId = req.query.userId ?? null;
    const ctx = await loadLeagueContext(provider, leagueId, userId);
    if (!ctx) {
      res.status(404).json({ available: false, reason: 'league_not_found' });
      return;
    }
    const active = getActiveProjections();
    if (!active) {
      res.json({ available: false, reason: 'no_projections' });
      return;
    }
    const userRosterId = ctx.teams.find((t) => t.isUser)?.rosterId ?? null;
    const recap = buildDraftRecap({
      picks: ctx.draftPicks ?? [],
      teams: ctx.teams,
      catalog: ctx.players,
      projections: active.projections,
      userRosterId,
    });
    if (!recap.available) {
      res.json(recap);
      return;
    }
    /* Team names live on the context, not in the recap's arithmetic. */
    const nameByRoster = new Map(ctx.teams.map((t) => [t.rosterId, t]));
    const withNames = (row) =>
      row && {
        ...row,
        teamName: nameByRoster.get(row.rosterId)?.teamName ?? `Roster ${row.rosterId}`,
      };
    res.json({
      ...recap,
      leagueName: ctx.league?.name ?? null,
      season: ctx.league?.season ?? null,
      teams: recap.teams.map(withNames),
      you: withNames(recap.you),
      steal: withNames(recap.steal),
    });
  } catch (error) {
    next(error);
  }
});

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
