/**
 * Live NFL game status from ESPN's public scoreboard, used to LOCK finished
 * players' scores during a game week (see engine applyLiveLocks + buildLiveLocks).
 *
 * Design notes:
 *  - Only REGULAR-SEASON games that are FINAL count (season type 2, status 'post').
 *    Preseason ('pre'/type 1) and in-progress games are ignored, so this is inert
 *    outside a live regular-season Sunday and can't lock a player at a fake 0.
 *  - Fetched in the background and cached, so the pricing path NEVER blocks on it:
 *    getFinalNflTeams() returns the last known set immediately (empty on cold
 *    start = no locks = normal pricing). Use awaitFinalNflTeams() for the admin
 *    "reprice now" trigger where a fresh read is worth the wait.
 */

const SCOREBOARD =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const TTL_MS = 90_000;

// The player catalog uses Sleeper's team codes for BOTH providers (the ESPN
// provider maps its proTeamIds to Sleeper codes). The ESPN SCOREBOARD uses ESPN
// codes. Comparing the two 32-team sets, the only real mismatch is Washington
// (catalog WAS vs scoreboard WSH); JAC/LA are defensive (ESPN has used them).
// normalizeTeam is applied to BOTH sides, collapsing variants to one canonical.
const TEAM_ALIASES = {
  WSH: 'WAS',
  JAC: 'JAX',
  LA: 'LAR',
};

export function normalizeTeam(abbr) {
  if (!abbr) return null;
  const up = String(abbr).toUpperCase();
  return TEAM_ALIASES[up] ?? up;
}

const PERIOD_SEC = 900; // 15-minute quarter
const GAME_SEC = 4 * PERIOD_SEC; // 60 minutes of regulation

/**
 * Fraction of a game's clock remaining for LIVE projections (f in livePlayerScore):
 *   pre  -> 1 (not kicked off, full pregame projection stands)
 *   post -> 0 (final, player locks to actual)
 *   in   -> minutes left / 60, from period + clock. OT (period >= 5) counts only the
 *           OT clock, so it tends toward ~0 (regulation projection is spent).
 * Clamped to [0, 1]. This is per GAME; every player on that NFL team shares it.
 */
export function fractionRemaining(status) {
  const state = status?.type?.state;
  if (state === 'pre') return 1;
  if (state === 'post') return 0;
  const period = Number(status?.period) || 1;
  const clockSec = Number(status?.clock);
  const sec = Number.isFinite(clockSec) ? clockSec : 0;
  const remaining = period >= 5 ? sec : (4 - period) * PERIOD_SEC + sec;
  return Math.max(0, Math.min(1, remaining / GAME_SEC));
}

let _cache = { at: 0, week: null, finalTeams: new Set(), teamState: new Map(), refreshing: false };

async function fetchGameState() {
  // Hard cap on the scoreboard read. Without it a stalled ESPN response (common at
  // the 1pm Sunday kickoff spike) never resolves, hanging the whole live cycle and
  // silently freezing live mode. AbortController turns a stall into a rejection the
  // callers already handle by keeping the last cached state.
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(SCOREBOARD, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`scoreboard ${res.status}`);
    const data = await res.json();
    const finalTeams = new Set();
    // team abbrev -> { state: 'pre'|'in'|'post', f } for the LIVE projection layer.
    const teamState = new Map();
    const week = data?.week?.number ?? null;
    for (const ev of data?.events ?? []) {
      // Regular season only (2). Preseason (1) / postseason (3) never drive a fantasy
      // regular-season week.
      if ((ev?.season?.type ?? data?.season?.type) !== 2) continue;
      const comp = ev?.competitions?.[0];
      const status = comp?.status;
      const state = status?.type?.state; // 'pre' | 'in' | 'post'
      if (!state) continue;
      const f = fractionRemaining(status);
      for (const c of comp?.competitors ?? []) {
        const abbr = normalizeTeam(c?.team?.abbreviation);
        if (!abbr) continue;
        /* period and displayClock ride along for DISPLAY only: the per-player game
           tag the lineup rows show ("Q3 4:12", "Half", "Final"). f and state are
           unchanged, so nothing that prices reads anything new. */
        teamState.set(abbr, {
          state,
          f,
          period: Number(status?.period) || null,
          displayClock: status?.displayClock ?? null,
          detail: status?.type?.shortDetail ?? null,
        });
        if (state === 'post') finalTeams.add(abbr);
      }
    }
    return { week, finalTeams, teamState };
  } finally {
    clearTimeout(to);
  }
}

function refreshInBackground() {
  if (_cache.refreshing) return;
  _cache.refreshing = true;
  fetchGameState()
    .then(({ week, finalTeams, teamState }) => {
      _cache = { at: Date.now(), week, finalTeams, teamState, refreshing: false };
    })
    .catch((err) => {
      _cache.refreshing = false;
      console.error('[nflGameStatus] refresh failed:', err?.message ?? err);
    });
}

/** Set of team abbreviations whose current REGULAR-SEASON game is FINAL. Never
 *  blocks — returns the last known set and refreshes in the background. */
export function getFinalNflTeams() {
  if (Date.now() - _cache.at >= TTL_MS) refreshInBackground();
  return _cache.finalTeams;
}

/** Per-team live game state (state + fraction remaining) for the live projection
 *  layer. Non-blocking, same background cache as getFinalNflTeams. */
export function getNflGameState() {
  if (Date.now() - _cache.at >= TTL_MS) refreshInBackground();
  return _cache.teamState;
}

/** Current NFL regular-season week number (from the scoreboard), or null in the
 *  off-season / before the scoreboard has been read. Non-blocking; used by the
 *  rankings board to sum only a player's REMAINING weeks. */
export function getCurrentNflWeek() {
  if (Date.now() - _cache.at >= TTL_MS) refreshInBackground();
  return _cache.week;
}

/** Force a fresh read (for the admin reprice / live-cycle trigger). Falls back to
 *  the cached state on error so a flaky scoreboard never breaks a cycle. */
export async function awaitFinalNflTeams() {
  try {
    const { week, finalTeams, teamState } = await fetchGameState();
    _cache = { at: Date.now(), week, finalTeams, teamState, refreshing: false };
  } catch (err) {
    console.error('[nflGameStatus] await refresh failed:', err?.message ?? err);
  }
  return _cache.finalTeams;
}

/** Fresh read returning the full per-team state (for the live cycle). */
export async function awaitNflGameState() {
  await awaitFinalNflTeams();
  return _cache.teamState;
}

/**
 * Per-team game state for the browser: whether each NFL team's game this week is
 * not started, in progress or final, plus the quarter and clock to print. Plain
 * JSON, non-blocking, served from the same 90s cache the live cycle reads, so a
 * page polling it adds no scoreboard traffic of its own.
 *
 * `at` is 0 until the scoreboard has been read once. The client treats that as
 * "unknown" and falls back to kickoff times rather than calling everything pre.
 */
export function getNflGameStateSnapshot() {
  if (Date.now() - _cache.at >= TTL_MS) refreshInBackground();
  const teams = {};
  for (const [team, value] of _cache.teamState) {
    teams[team] = {
      state: value.state,
      period: value.period ?? null,
      clock: value.displayClock ?? null,
      detail: value.detail ?? null,
    };
  }
  return { at: _cache.at, week: _cache.week, teams };
}

/** Stable signature of the current final-team set, for cache-busting pricing. */
export function finalTeamsSignature() {
  return [..._cache.finalTeams].sort().join(',');
}

/** True if any regular-season game is currently in progress (state 'in'). */
export function anyGameLive() {
  for (const s of _cache.teamState.values()) if (s.state === 'in') return true;
  return false;
}

/**
 * From the current week's matchups (each carries playersPoints) and the catalog
 * (player -> NFL team), lock every player whose team's game is final to their
 * current points. Returns {} when no games are final, so pricing is untouched.
 */
export function buildLiveLocks(matchups, catalog, finalTeams) {
  const locks = {};
  if (!finalTeams || finalTeams.size === 0) return locks;
  for (const m of matchups ?? []) {
    const pts = m?.playersPoints ?? {};
    for (const playerId of Object.keys(pts)) {
      const team = normalizeTeam(catalog?.[playerId]?.team);
      if (team && finalTeams.has(team)) locks[playerId] = pts[playerId];
    }
  }
  return locks;
}
