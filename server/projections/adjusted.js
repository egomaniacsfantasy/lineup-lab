/**
 * The single source of truth for pricing/simulation: the MODEL's per-player,
 * per-week projections, keyed by provider (Sleeper/ESPN) id.
 *
 *   model weekly numbers (combined workbooks, loadFromRepo)
 *   -> per-week mean + floor/ceiling, exactly as the model produced them
 *   -> mapped onto provider ids (reusing the last import's confirmed crosswalk)
 *
 * The pricing engine consumes these instead of the stale admin snapshot, so the
 * matchup/league/futures/trade numbers all match the Projections page and update
 * the moment the model changes. NOTHING here touches the workbooks.
 *
 * There is NO consensus/agreement input (removed 2026-10-01, user): nothing a person
 * types can move a projection, a price or a simulation. Every number served is the
 * workbook number.
 */

import { loadProjections } from './loadFromRepo.js';
import { getActiveProjections } from './store.js';
import { normalizeName } from './importer.js';
import { sleeperProvider } from '../providers/sleeperProvider.js';

const Z80 = 1.2815515594; // 80% interval half-width in sigmas (matches our weekly CI)

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Name+position -> Sleeper id (and DEF team code -> id). Built PRIMARILY from the
 * full Sleeper player catalog so EVERY pushed combine player resolves — not just
 * whoever the last manual import happened to cover (that was silently dropping the
 * long tail: deep TE3s, extra RBs/WRs, etc.). The active import's confirmed matches
 * are layered on top so any hand-curated match still wins.
 */
async function buildProviderIndex() {
  const byNamePos = new Map();
  const byTeamDef = new Map();

  // Primary: the full Sleeper catalog (every ACTIVE NFL player). Skip retired /
  // free agents (no team) so a current player never resolves to an old namesake.
  try {
    const catalog = await sleeperProvider.getPlayerCatalog();
    for (const id of Object.keys(catalog || {})) {
      const c = catalog[id];
      if (!c || !c.name) continue;
      if (c.position === 'DEF') {
        if (c.team) byTeamDef.set(String(c.team).toUpperCase(), id);
        continue;
      }
      if (!c.team) continue;
      const norm = normalizeName(c.name);
      const positions = new Set([c.position, ...(c.fantasyPositions || [])].filter(Boolean));
      for (const pos of positions) {
        const key = `${norm}|${pos}`;
        if (!byNamePos.has(key)) byNamePos.set(key, id); // first active wins
      }
    }
  } catch {
    // Catalog unavailable -> the import-only fallback below preserves old behavior.
  }

  // Overrides: the active import's confirmed matches always win over the catalog.
  const active = getActiveProjections();
  if (active && Array.isArray(active.projections)) {
    for (const p of active.projections) {
      if (p.position === 'DEF' && p.team) byTeamDef.set(String(p.team).toUpperCase(), p.playerId);
      if (p.name && p.playerId) byNamePos.set(`${normalizeName(p.name)}|${p.position}`, p.playerId);
    }
  }

  return { byNamePos, byTeamDef, version: active?.version ?? 'catalog' };
}

/**
 * Build the adjusted, provider-keyed projection records the engine expects:
 * { playerId, name, position, team, mean, stdev, weekly:{week:pts},
 *   weeklyCI:{week:{floor,ceiling}}, floor, ceiling, seasonTotal, depthRank }.
 */
// One cache per scoring format: '' = PPR, '_half' = half-PPR, '_nonppr' = standard.
export const SCORING_SUFFIXES = ['', '_half', '_nonppr'];
const _caches = new Map(); // suf -> { at, data, refreshing }
function _cacheFor(suf) {
  let e = _caches.get(suf);
  if (!e) { e = { at: 0, data: null, refreshing: false }; _caches.set(suf, e); }
  return e;
}

/** Kick off a background recompute for one scoring format. */
function _refreshInBackground(suf) {
  const e = _cacheFor(suf);
  if (e.refreshing) return;
  e.refreshing = true;
  _computeAdjusted(suf)
    .then((d) => {
      e.at = Date.now();
      e.data = d;
      e.refreshing = false;
      console.log(`[adjusted:${suf || 'ppr'}] refreshed: ${d.matched}/${d.total} matched`);
    })
    .catch((err) => { e.refreshing = false; console.error(`[adjusted:${suf || 'ppr'}] bg refresh failed`, err); });
}

/**
 * The pricing path calls this:
 *  - warm cache -> return it instantly (refresh in background if stale)
 *  - cold cache -> build once (no network); concurrent cold callers share the build.
 * `suf` selects the scoring format ('' PPR | '_half' | '_nonppr').
 */
export async function getAdjustedProjections(suf = '') {
  const e = _cacheFor(suf);
  if (e.data) {
    if (Date.now() - e.at >= 60_000) _refreshInBackground(suf);
    return e.data;
  }
  // Cold cache: concurrent cold callers share the one in-flight build.
  if (!e.coldBuild) {
    e.coldBuild = _computeAdjusted(suf)
      .then((d) => { e.data = d; e.at = Date.now(); e.coldBuild = null; return d; })
      .catch((err) => {
        e.coldBuild = null;
        console.error(`[adjusted:${suf || 'ppr'}] cold build failed; retrying once`, err);
        return _computeAdjusted(suf);
      });
  }
  return e.coldBuild;
}

/**
 * The model's projections for one scoring format —
 * i.e. exactly the combined-file numbers. The board reads this so its displayed
 * projected points / floor / ceiling / weekly match the source sheet.
 * Cached briefly; no network.
 */
const _modelCaches = new Map(); // suf -> { at, data }
export async function getModelProjections(suf = '') {
  const e = _modelCaches.get(suf);
  if (e && e.data && Date.now() - e.at < 60_000) return e.data;
  const data = await _computeAdjusted(suf);
  _modelCaches.set(suf, { at: Date.now(), data });
  return data;
}

/** Warm all three scoring formats at boot (background). */
export async function warmAdjustedProjections() {
  for (const suf of SCORING_SUFFIXES) _refreshInBackground(suf);
}

/**
 * Force a recompute of every scoring format (e.g. right after the workbooks are
 * re-imported), instead of waiting for the next ~60s lazy background refresh.
 */
export function invalidateAdjusted() {
  _modelCaches.clear(); // pure-model board cache also refreshes on re-import
  for (const suf of SCORING_SUFFIXES) {
    _cacheFor(suf).at = 0; // mark stale so any reader also refreshes
    _refreshInBackground(suf);
  }
}

// Only RB/WR/TE differ by scoring format (receptions). QB/K/DEF are invariant, so
// they always read the base columns regardless of the requested suffix.
const RECEIVING = new Set(['RB', 'WR', 'TE']);
function fpCol(pos, suf) {
  if (pos === 'K') return 'total_projected_fp';
  return RECEIVING.has(pos) ? `fantasy_pts${suf}` : 'fantasy_pts';
}
function floorCol(pos, suf) {
  return RECEIVING.has(pos) ? `fantasy_pts_floor${suf}` : 'fantasy_pts_floor';
}
function ceilCol(pos, suf) {
  return RECEIVING.has(pos) ? `fantasy_pts_ceiling${suf}` : 'fantasy_pts_ceiling';
}

async function _computeAdjusted(suf = '') {
  const dataset = loadProjections();
  const idx = await buildProviderIndex();

  const projections = [];
  let matched = 0;
  for (const p of dataset.players) {
    const pos = p.position;

    // Season point + bounds for the requested scoring format.
    const seasonPtRaw = RECEIVING.has(pos) ? (num(p.season[`fantasy_pts${suf}`]) ?? p.point) : p.point;
    const seasonFloorRaw = RECEIVING.has(pos) ? (num(p.season[`fantasy_pts_floor${suf}`]) ?? p.floor) : p.floor;
    const seasonCeilRaw = RECEIVING.has(pos) ? (num(p.season[`fantasy_pts_ceiling${suf}`]) ?? p.ceiling) : p.ceiling;
    const seasonPoint = num(seasonPtRaw);
    const seasonFloor = num(seasonFloorRaw);
    const seasonCeil = num(seasonCeilRaw);

    // Per-week adjusted mean + CI, in the league's scoring format.
    const wCol = fpCol(pos, suf);
    const wFloorCol = floorCol(pos, suf);
    const wCeilCol = ceilCol(pos, suf);
    const weekly = {};
    const weeklyCI = {};
    const perGameSig = [];
    const weekVals = [];
    for (const w of p.weekly) {
      const wk = Number(w.week);
      if (!Number.isFinite(wk)) continue;
      const wStored = num(w[wCol]);
      if (wStored == null) continue;
      const wAdj = wStored;
      const wFloor = num(w[wFloorCol]);
      const wCeil = num(w[wCeilCol]);
      const key = String(wk);
      weekly[key] = Number(wAdj.toFixed(2));
      weeklyCI[key] = { floor: wFloor, ceiling: wCeil };
      weekVals.push(wAdj);
      if (wFloor != null && wCeil != null && wCeil > wFloor) perGameSig.push((wCeil - wFloor) / (2 * Z80));
    }

    const mean = weekVals.length
      ? weekVals.reduce((a, b) => a + b, 0) / weekVals.length
      : (seasonPoint ?? 0);
    const stdev = perGameSig.length
      ? perGameSig.reduce((a, b) => a + b, 0) / perGameSig.length
      : Math.abs(mean) * 0.45;

    // Resolve provider id (identity inherited from last import).
    let playerId = null;
    if (idx) {
      playerId = pos === 'DEF' && p.team
        ? idx.byTeamDef.get(String(p.team).toUpperCase()) ?? null
        : idx.byNamePos.get(`${normalizeName(p.name)}|${pos}`) ?? null;
    }
    // Not resolvable to a Sleeper id (rare now that we match the full catalog --
    // e.g. a non-Sleeper practice-squad name). Keep them on the board with a stable
    // synthetic id so NO combine player is dropped; they simply won't link to a
    // Sleeper roster (they can't be rostered there anyway).
    if (!playerId) playerId = `repo::${pos}::${normalizeName(p.name)}`;
    matched += 1;

    projections.push({
      playerId,
      name: p.name,
      position: pos,
      team: p.team ?? null,
      week: null,
      mean: Number((mean ?? 0).toFixed(2)),
      stdev: Number((stdev ?? 0).toFixed(2)),
      weekly,
      weeklyCI,
      seasonTotal: seasonPoint,
      floor: seasonFloor,
      ceiling: seasonCeil,
      depthRank: p.depthRank ?? null,
      source: 'live-adjusted',
      // Field parity with the snapshot's records so no downstream consumer
      // trips on a missing key.
      scoringBasis: suf === '_half' ? 'half-ppr' : suf === '_nonppr' ? 'standard' : 'ppr',
      derived: false,
      defaultedVariance: false,
      stats: null,
      tier: null,
      rank: null,
    });
  }

  const basis = suf === '_half' ? 'half-ppr' : suf === '_nonppr' ? 'standard' : 'ppr';
  const result = {
    version: `${idx?.version ?? 'noimport'}:adj:${basis}:0`,
    meta: { scoringBasis: basis, source: 'live-adjusted' },
    projections,
    matched,
    total: dataset.players.length,
  };
  return result;
}
