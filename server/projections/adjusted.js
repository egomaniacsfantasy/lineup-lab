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
let _cache = { at: 0, data: null, refreshing: false };

/**
 * Stale-while-revalidate: once warm, ALWAYS return the cached value instantly
 * and refresh in the background. This keeps the Supabase consensus fetch off the
 * league-pricing critical path (the cause of the earlier "pricing your league"
 * stall). Only the very first call (cold) awaits, and that's bounded by the 4s
 * consensus timeout; warmAdjustedProjections() at boot removes even that.
 */
export async function getAdjustedProjections() {
  if (_cache.data) {
    if (Date.now() - _cache.at >= 60_000 && !_cache.refreshing) {
      _cache.refreshing = true;
      _computeAdjusted()
        .then((d) => { _cache = { at: Date.now(), data: d, refreshing: false }; })
        .catch((e) => { _cache.refreshing = false; console.error('[adjusted] bg refresh failed', e); });
    }
    return _cache.data;
  }
  const d = await _computeAdjusted();
  _cache = { at: Date.now(), data: d, refreshing: false };
  return d;
}

/** Precompute + cache at boot so the first pricing request never waits. */
export async function warmAdjustedProjections() {
  try {
    const d = await _computeAdjusted();
    _cache = { at: Date.now(), data: d, refreshing: false };
    console.log(`[adjusted] warmed: ${d.matched}/${d.total} matched, ${d.consensusCount} consensus`);
  } catch (e) {
    console.error('[adjusted] warm failed', e);
  }
}

// Phase 0 isolation: keep the Supabase consensus fetch OUT of the picture until
// the pure data-injection path is proven live. Flip to true to re-enable the
// live consensus tilt once Phase 0 is confirmed stable on the deployed league.
const CONSENSUS_ENABLED = false;

async function _computeAdjusted() {
  const dataset = loadProjections();
  const consensus = CONSENSUS_ENABLED ? await loadConsensus() : {};
  const idx = buildProviderIndex();

  const projections = [];
  let matched = 0;
  for (const p of dataset.players) {
    const pos = p.position;
    const avg = consensus[pos]?.[p.name];
    const delta = tiltFromConsensus(avg);

    // Season point + bounds (PPR canonical line).
    const seasonPoint = adjustFP(pos, p.point, p.season, 'season', delta);
    const seasonFloor = scaleBound(p.floor, p.point, seasonPoint);
    const seasonCeil = scaleBound(p.ceiling, p.point, seasonPoint);

    // Per-week adjusted mean + CI.
    const weekly = {};
    const weeklyCI = {};
    const perGameSig = [];
    const weekVals = [];
    for (const w of p.weekly) {
      const wk = Number(w.week);
      if (!Number.isFinite(wk)) continue;
      const wStored = num(w.fantasy_pts);
      if (wStored == null) continue;
      const wAdj = adjustFP(pos, wStored, w, 'weekly', delta);
      const wFloor = scaleBound(num(w.fantasy_pts_floor), wStored, wAdj);
      const wCeil = scaleBound(num(w.fantasy_pts_ceiling), wStored, wAdj);
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
      scoringBasis: 'ppr',
      derived: false,
      defaultedVariance: false,
      stats: null,
      tier: null,
      rank: null,
    });
  }

  const consensusCount = Object.values(consensus).reduce((a, m) => a + Object.keys(m).length, 0);
  const result = {
    version: `${idx?.version ?? 'noimport'}:adj:${consensusCount}`,
    meta: { scoringBasis: 'ppr', source: 'live-adjusted' },
    projections,
    matched,
    total: dataset.players.length,
    consensusCount,
  };
  return result;
}
