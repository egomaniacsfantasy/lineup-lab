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
import { sleeperProvider } from '../providers/sleeperProvider.js';
import { getSupabaseAdmin } from '../services/supabaseAdmin.js';
import { tiltFromConsensus, adjustFP, scaleBound } from './agreementTilt.js';

const Z80 = 1.2815515594; // 80% interval half-width in sigmas (matches our weekly CI)

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The last consensus we successfully read. On a timeout/error we reuse THIS instead
// of dropping to no-consensus, so the +/-10% agreement tilt can't flip on and off
// between 60s refreshes -- that flip reshuffled every team's odds on reload.
let _lastGoodConsensus = null;

/** Average agreement score per player: { position: { name: avg } }. */
async function loadConsensus() {
  const admin = getSupabaseAdmin();
  if (!admin) return _lastGoodConsensus ?? {};
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
    return _lastGoodConsensus ?? {};   // keep the tilt stable across a transient failure
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
  // Only a real, non-empty read updates the fallback (an empty success shouldn't
  // wipe a good consensus we could reuse on the next timeout).
  if (Object.keys(out).length > 0) _lastGoodConsensus = out;
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
      // Never let a refresh that came back WITHOUT consensus overwrite a warm build
      // that HAS it -- that on/off flip is what jumped the odds on reload.
      if (e.data && (e.data.consensusCount ?? 0) > 0 && (d.consensusCount ?? 0) === 0) {
        e.at = Date.now();          // mark fresh so we don't retry-hammer
        e.refreshing = false;
        console.log(`[adjusted:${suf || 'ppr'}] kept warm consensus build (refresh had none)`);
        return;
      }
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
  // Cold cache: build WITH consensus so the VERY FIRST request already uses the
  // consensus-weighted values -- no one-time model-only view that would read
  // differently from every later (warm) request. The consensus read is time-bounded
  // (4s) and falls back to last-good/model-only, so this can't hang. Concurrent cold
  // callers share the one in-flight build.
  if (!e.coldBuild) {
    e.coldBuild = _computeAdjusted(CONSENSUS_ENABLED, suf)
      .then((d) => { e.data = d; e.at = Date.now(); e.coldBuild = null; return d; })
      .catch((err) => {
        e.coldBuild = null;
        console.error(`[adjusted:${suf || 'ppr'}] cold consensus build failed; using model-only`, err);
        return _computeAdjusted(false, suf);
      });
  }
  return e.coldBuild;
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
  const idx = await buildProviderIndex();

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
