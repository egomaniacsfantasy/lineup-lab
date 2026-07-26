/**
 * The single source of truth for pricing/simulation: LIVE agreement-weighted,
 * per-player, per-week projections, keyed by provider (Sleeper/ESPN) id.
 *
 *   model weekly numbers (combined workbooks, loadFromRepo)
 *   + live consensus (Supabase olympus_agreement)
 *   -> per-week adjusted mean + floor/ceiling (agreementTilt)
 *   -> mapped onto provider ids (reusing the last import's confirmed crosswalk)
 *
 * The pricing engine consumes these instead of the stale admin snapshot, so the
 * matchup/league/futures/trade numbers all match the Projections page and update
 * the moment the model or the votes change. NOTHING here touches the workbooks.
 */

import { loadProjections } from './loadFromRepo.js';
import { getActiveProjections } from './store.js';
import { normalizeName } from './importer.js';
import { getSupabaseAdmin } from '../services/supabaseAdmin.js';
import { tiltFromConsensus, adjustFP, scaleBound } from './agreementTilt.js';

const Z80 = 1.2815515594; // 80% interval half-width in sigmas (matches our weekly CI)

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Average agreement score per player: { position: { name: avg } }. */
async function loadConsensus() {
  const admin = getSupabaseAdmin();
  if (!admin) return {};
  // Never let a slow/hung DB call stall league pricing — time out to no-consensus.
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ data: null, error: { message: 'consensus timeout' } }), 4000),
  );
  const { data, error } = await Promise.race([
    admin.from('olympus_agreement').select('position, player, score'),
    timeout,
  ]);
  if (error) {
    console.error('[adjusted] consensus read failed:', error.message ?? error);
    return {};
  }
  const acc = {};
  for (const row of data ?? []) {
    const s = Number(row.score);
    if (!Number.isFinite(s)) continue;
    (acc[row.position] ??= {});
    (acc[row.position][row.player] ??= { sum: 0, n: 0 });
    acc[row.position][row.player].sum += s;
    acc[row.position][row.player].n += 1;
  }
  const out = {};
  for (const pos of Object.keys(acc)) {
    out[pos] = {};
    for (const pl of Object.keys(acc[pos])) {
      const { sum, n } = acc[pos][pl];
      out[pos][pl] = sum / n;
    }
  }
  return out;
}

// Shared across the three scoring formats so a warm cycle hits Supabase once.
let _consensusMemo = { at: 0, data: null };
async function loadConsensusCached() {
  if (_consensusMemo.data && Date.now() - _consensusMemo.at < 30_000) return _consensusMemo.data;
  const data = await loadConsensus();
  _consensusMemo = { at: Date.now(), data };
  return data;
}

/**
 * Reuse the last import's identity join: normalized name + position -> provider
 * id (and DEF team code -> id). Returns null if no import has ever run (the
 * engine then falls back to the raw snapshot).
 */
function buildProviderIndex() {
  const active = getActiveProjections();
  if (!active || !Array.isArray(active.projections) || active.projections.length === 0) {
    return null;
  }
  const byNamePos = new Map();
  const byTeamDef = new Map();
  for (const p of active.projections) {
    if (p.position === 'DEF' && p.team) byTeamDef.set(String(p.team).toUpperCase(), p.playerId);
    if (p.name) byNamePos.set(`${normalizeName(p.name)}|${p.position}`, p.playerId);
  }
  return { byNamePos, byTeamDef, version: active.version ?? 'unknown' };
}

/**
 * Build the adjusted, provider-keyed projection records the engine expects:
 * { playerId, name, position, team, mean, stdev, weekly:{week:pts},
 *   weeklyCI:{week:{floor,ceiling}}, floor, ceiling, seasonTotal, depthRank }.
 */
// Live consensus tilt is ON. The Supabase fetch is kept entirely OFF the pricing
// request path (see getAdjustedProjections): consensus only ever loads in the
// background, so a slow/hung DB call can never stall league pricing.
const CONSENSUS_ENABLED = true;

// One cache per scoring format: '' = PPR, '_half' = half-PPR, '_nonppr' = standard.
export const SCORING_SUFFIXES = ['', '_half', '_nonppr'];
const _caches = new Map(); // suf -> { at, data, refreshing }
function _cacheFor(suf) {
  let e = _caches.get(suf);
  if (!e) { e = { at: 0, data: null, refreshing: false }; _caches.set(suf, e); }
  return e;
}

/** Kick off a background compute (WITH consensus) for one scoring format. */
function _refreshInBackground(suf) {
  const e = _cacheFor(suf);
  if (e.refreshing) return;
  e.refreshing = true;
  _computeAdjusted(CONSENSUS_ENABLED, suf)
    .then((d) => {
      e.at = Date.now();
      e.data = d;
      e.refreshing = false;
      console.log(`[adjusted:${suf || 'ppr'}] refreshed: ${d.matched}/${d.total} matched, ${d.consensusCount} consensus`);
    })
    .catch((err) => { e.refreshing = false; console.error(`[adjusted:${suf || 'ppr'}] bg refresh failed`, err); });
}

/**
 * The pricing path calls this and it NEVER awaits Supabase:
 *  - warm cache -> return it instantly (refresh in background if stale)
 *  - cold cache -> return a model-only build instantly (no network) AND trigger
 *    the background consensus refresh; once that lands, later calls include it.
 * `suf` selects the scoring format ('' PPR | '_half' | '_nonppr').
 */
export async function getAdjustedProjections(suf = '') {
  const e = _cacheFor(suf);
  if (e.data) {
    if (Date.now() - e.at >= 60_000) _refreshInBackground(suf);
    return e.data;
  }
  _refreshInBackground(suf);
  return _computeAdjusted(false, suf); // model-only, no consensus, no network — instant
}

/**
 * Model-only projections (NO agreement/consensus tilt) for one scoring format —
 * i.e. exactly the combined-file numbers. The board reads this so its displayed
 * projected points / floor / ceiling / weekly match the source sheet; the
 * agreement tilt stays reserved for pricing/trades. Cached briefly; no network.
 */
const _modelCaches = new Map(); // suf -> { at, data }
export async function getModelProjections(suf = '') {
  const e = _modelCaches.get(suf);
  if (e && e.data && Date.now() - e.at < 60_000) return e.data;
  const data = await _computeAdjusted(false, suf); // consensus off -> delta 0 -> pure model
  _modelCaches.set(suf, { at: Date.now(), data });
  return data;
}

/** Warm all three scoring formats at boot (background). */
export async function warmAdjustedProjections() {
  for (const suf of SCORING_SUFFIXES) _refreshInBackground(suf);
}

/**
 * Force a fresh consensus read + recompute of every scoring format. Call this
 * right after an agreement value is edited so the change is reflected in the
 * board / pricing within seconds, not on the next ~60s lazy background refresh.
 */
export function invalidateAdjusted() {
  _consensusMemo = { at: 0, data: null }; // drop the 30s consensus memo -> re-read Supabase
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

async function _computeAdjusted(withConsensus, suf = '') {
  const dataset = loadProjections();
  const consensus = withConsensus ? await loadConsensusCached() : {};
  const idx = buildProviderIndex();

  const projections = [];
  let matched = 0;
  for (const p of dataset.players) {
    const pos = p.position;
    const avg = consensus[pos]?.[p.name];
    const delta = tiltFromConsensus(avg);

    // Season point + bounds for the requested scoring format.
    const seasonPtRaw = RECEIVING.has(pos) ? (num(p.season[`fantasy_pts${suf}`]) ?? p.point) : p.point;
    const seasonFloorRaw = RECEIVING.has(pos) ? (num(p.season[`fantasy_pts_floor${suf}`]) ?? p.floor) : p.floor;
    const seasonCeilRaw = RECEIVING.has(pos) ? (num(p.season[`fantasy_pts_ceiling${suf}`]) ?? p.ceiling) : p.ceiling;
    const seasonPoint = adjustFP(pos, seasonPtRaw, p.season, 'season', delta, suf);
    const seasonFloor = scaleBound(seasonFloorRaw, seasonPtRaw, seasonPoint);
    const seasonCeil = scaleBound(seasonCeilRaw, seasonPtRaw, seasonPoint);

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
      const wAdj = adjustFP(pos, wStored, w, 'weekly', delta, suf);
      const wFloor = scaleBound(num(w[wFloorCol]), wStored, wAdj);
      const wCeil = scaleBound(num(w[wCeilCol]), wStored, wAdj);
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
    if (!playerId) continue; // not on this provider's catalog -> not priceable
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
  const consensusCount = Object.values(consensus).reduce((a, m) => a + Object.keys(m).length, 0);
  const result = {
    version: `${idx?.version ?? 'noimport'}:adj:${basis}:${consensusCount}`,
    meta: { scoringBasis: basis, source: 'live-adjusted' },
    projections,
    matched,
    total: dataset.players.length,
    consensusCount,
  };
  return result;
}
