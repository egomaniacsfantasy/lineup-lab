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

let _cache = { at: 0, week: null, finalTeams: new Set(), refreshing: false };

async function fetchFinalTeams() {
  const res = await fetch(SCOREBOARD);
  if (!res.ok) throw new Error(`scoreboard ${res.status}`);
  const data = await res.json();
  const finalTeams = new Set();
  const week = data?.week?.number ?? null;
  for (const ev of data?.events ?? []) {
    // Regular season only (2). Preseason (1) / postseason (3) never lock players
    // into a fantasy regular-season week.
    if ((ev?.season?.type ?? data?.season?.type) !== 2) continue;
    const comp = ev?.competitions?.[0];
    if (comp?.status?.type?.state !== 'post') continue; // 'pre' | 'in' | 'post'
    for (const c of comp?.competitors ?? []) {
      const abbr = normalizeTeam(c?.team?.abbreviation);
      if (abbr) finalTeams.add(abbr);
    }
  }
  return { week, finalTeams };
}

function refreshInBackground() {
  if (_cache.refreshing) return;
  _cache.refreshing = true;
  fetchFinalTeams()
    .then(({ week, finalTeams }) => {
      _cache = { at: Date.now(), week, finalTeams, refreshing: false };
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

/** Force a fresh read (for the admin reprice trigger). Falls back to the cached
 *  set on error so a flaky scoreboard never breaks a reprice. */
export async function awaitFinalNflTeams() {
  try {
    const { week, finalTeams } = await fetchFinalTeams();
    _cache = { at: Date.now(), week, finalTeams, refreshing: false };
  } catch (err) {
    console.error('[nflGameStatus] await refresh failed:', err?.message ?? err);
  }
  return _cache.finalTeams;
}

/** Stable signature of the current final-team set, for cache-busting pricing. */
export function finalTeamsSignature() {
  return [..._cache.finalTeams].sort().join(',');
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
