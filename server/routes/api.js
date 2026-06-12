/**
 * Provider-agnostic API surface for the client.
 * The client only ever talks to these routes — never to provider APIs.
 */
import { Router } from 'express';
import { sleeperProvider } from '../providers/sleeperProvider.js';
import { cached, callLog, callsInLastMinute, invalidate } from '../cache.js';
import { isGameWindow } from '../gameWindows.js';

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
    res.json(await getProvider(req).getSeasonState());
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

/** Everything one league needs to render: league, teams, week matchups, players. */
apiRouter.get('/league/:leagueId/bootstrap', async (req, res, next) => {
  try {
    const provider = getProvider(req);
    const { leagueId } = req.params;
    const userId = req.query.userId ?? null;

    const league = await provider.getLeague(leagueId);

    if (!league) {
      res.status(404).json({
        error: 'league_not_found',
        message: 'That league does not exist or is no longer available on Sleeper.',
      });
      return;
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
        ownerName: owner?.ownerName ?? 'Unmanaged team',
        teamName: owner?.teamName ?? `Roster ${r.rosterId}`,
        avatarUrl: owner?.avatarUrl ?? null,
        isUser:
          userId !== null &&
          (r.ownerId === userId || (r.coOwners ?? []).includes(userId)),
      };
    });

    // Pick the week to render: live week for the active season, last scored
    // week for archived seasons, clamp to ≥ 1 in the offseason.
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

    res.json({
      league,
      teams,
      week,
      matchups,
      players,
      state,
      lastUpdated: Date.now(),
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

/** Force-refresh a league (drops caches); used by the manual refresh affordance. */
apiRouter.post('/league/:leagueId/refresh', (req, res) => {
  invalidate(`sleeper:rosters:${req.params.leagueId}`);
  invalidate(`sleeper:matchups:${req.params.leagueId}`);
  invalidate(`agg:schedule:${req.params.leagueId}`);
  res.json({ ok: true });
});
