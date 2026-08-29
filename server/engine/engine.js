/**
 * Odds Gods pricing engine (server-side).
 *
 * Inputs per matchup: both rosters' starters (+ user bench for swap
 * pricing), per-player Projection (mean, stdev) from the active import,
 * league scoring family. Outputs Line records with inputsHash so every
 * movement is diffable (the future notification stream), per-swap deltas
 * for the user's bench (legal moves only), and season futures.
 *
 * Matchup lines: 10,000-sim Monte Carlo over truncated-normal player
 * scores. Swap deltas: analytic normal approximation (documented — the
 * delta of means/variances is exact under the same model and keeps a
 * full-league recompute well under 2s). Futures: 2,000-sim remaining-
 * schedule simulation; title odds = playoff prob × strength share among
 * playoff teams (simplification, documented).
 */
import crypto from 'node:crypto';
import { getActiveProjections } from '../projections/store.js';
import { cached } from '../cache.js';
import { closedFormWinProb, buildLiveTeamDistribution } from './liveWinProb.js';

export const SEASON_SIMS = 10_000; // player-level season Monte Carlo — Futures and movers
const MATCHUP_SIMS = 10_000; // seeded player-level sims for the headline matchup win%
// EVERY trade evaluation — the finder (best deals / per-manager / hub), the
// Build-a-Trade analyzer, and the counter-offer search — runs at THIS sim count.
// Same seed + same sim count + same drop logic => a given trade prices IDENTICALLY
// on every surface. It is below SEASON_SIMS so the finder can re-sim many trades
// inside the request budget; common random numbers keep each delta accurate.
const TRADE_SIMS = 4_000;
const Z80 = 1.2815515594; // 80% CI half-width in sigmas (matches our weekly CI)
const INV_SQRT_2PI = 0.3989422804014327;

const FLEX_ELIGIBILITY = {
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['WR', 'RB'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};

function slotAllows(slotLabel, position) {
  if (FLEX_ELIGIBILITY[slotLabel]) return FLEX_ELIGIBILITY[slotLabel].includes(position);
  return slotLabel === position;
}

function probToAmerican(prob) {
  // NO [1.5%,98.5%] clamp — a 99% team reads -9900, not a clamped -6567. Only guard
  // the exact 0/1 singularity (american odds are infinite there) with a tiny epsilon
  // so the number stays finite; the UI shows a check/dash at a genuine 100/0 off the
  // raw probability, not this odds value.
  const p = Math.min(1 - 1e-9, Math.max(1e-9, prob));
  const ml = p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
  // even money is always quoted +100, never -100
  return ml === -100 ? 100 : ml;
}

function americanToProb(ml) {
  return ml <= -100 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

/**
 * Every mover is a positive-gain move by construction, so its quoted
 * "after" must never read worse than "before". Residual sim noise of a
 * count or two could otherwise flip the sign on tiny upgrades.
 */
function noWorseThan(before, after) {
  return americanToProb(after) >= americanToProb(before) ? after : before;
}

/**
 * Deterministic RNG (mulberry32), seeded from the pricing inputsHash.
 * Two sim runs with the same seed see identical random draws, so a
 * before/after comparison (movers, swap pricing) differs ONLY by the
 * input change. Without this, Monte Carlo noise could make adding a
 * better player look like it hurt your title odds.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function playerDistribution(playerId, projectionMap, catalogEntry, week = null) {
  const projection = projectionMap.get(playerId);

  // OUT/IR starters cost projection zero (surfaced via flags).
  const status = (catalogEntry?.injuryStatus ?? '').toLowerCase();
  if (status === 'out' || status === 'ir' || catalogEntry?.status === 'Inactive') {
    return { mean: 0, stdev: 0, unpriced: false, zeroed: true };
  }

  if (!projection) {
    return { mean: 0, stdev: 0, unpriced: true, zeroed: false };
  }

  let { mean, stdev } = projection;

  // Week-specific projection from the import's game-level grid (already
  // opponent-adjusted). A full grid missing this week = the player's bye.
  const weekly = projection.weekly ?? {};
  const weeklyCount = Object.keys(weekly).length;
  if (week != null && weeklyCount > 0) {
    const weekMean = weekly[week] ?? weekly[String(week)];
    if (weekMean != null) {
      const scale = mean > 0 ? weekMean / mean : 1;
      stdev = Number((stdev * Math.max(0.25, scale)).toFixed(2));
      mean = weekMean;
    } else if (weeklyCount >= 10) {
      return { mean: 0, stdev: 0, unpriced: false, zeroed: true };
    }
  }

  return { mean, stdev, unpriced: false, zeroed: false };
}

export function teamDistribution(starterIds, projectionMap, catalog, week = null) {
  let mean = 0;
  let variance = 0;
  const unpriced = [];
  const zeroed = [];

  for (const id of starterIds) {
    const dist = playerDistribution(id, projectionMap, catalog[id], week);
    mean += dist.mean;
    variance += dist.stdev * dist.stdev;
    if (dist.unpriced) unpriced.push(id);
    if (dist.zeroed) zeroed.push(id);
  }

  return { mean, sigma: Math.sqrt(variance), unpriced, zeroed };
}

/**
 * Per-player split-normal params for the week: the mean plus ASYMMETRIC sigmas
 * backed out of our floor/ceiling (sigma = (bound - mean)/z, the exact inverse of
 * how the pipeline built the CI). Falls back to a symmetric sigma when no per-week
 * CI is present (e.g. the snapshot).
 */
function playerSimParams(playerId, projectionMap, catalogEntry, week) {
  const base = playerDistribution(playerId, projectionMap, catalogEntry, week);
  let sigmaDown = base.stdev;
  let sigmaUp = base.stdev;
  const ci = projectionMap.get(playerId)?.weeklyCI;
  if (base.mean > 0 && ci && week != null) {
    const wk = ci[week] ?? ci[String(week)];
    if (wk) {
      const fl = Number(wk.floor);
      const ce = Number(wk.ceiling);
      if (Number.isFinite(fl) && fl < base.mean) sigmaDown = (base.mean - fl) / Z80;
      if (Number.isFinite(ce) && ce > base.mean) sigmaUp = (ce - base.mean) / Z80;
    }
  }
  return { mean: base.mean, sigmaDown, sigmaUp };
}

/** Starter split-normal params for a roster's starters. */
function starterParams(starterIds, projectionMap, catalog, week = null) {
  return { players: starterIds.map((id) => playerSimParams(id, projectionMap, catalog[id], week)) };
}

/** Order slots so FLEX-type slots fill AFTER dedicated position slots: dedicated
 *  positions get their best players, then flex takes the best leftover. */
function flexLastSlots(slotLabels) {
  const dedicated = [];
  const flex = [];
  for (const s of slotLabels) (FLEX_ELIGIBILITY[s] ? flex : dedicated).push(s);
  return [...dedicated, ...flex];
}

/**
 * Max number of starting slots this roster can fill at once (bipartite matching,
 * Kuhn's algorithm). Ignores byes/injuries — this is about roster COMPOSITION:
 * "do I own enough bodies at the right positions to field a legal lineup at all."
 */
function maxSlotsFilled(playerIds, slotLabels, catalog) {
  const players = playerIds
    .map((id) => ({ id, position: catalog[id]?.position }))
    .filter((p) => p.position);
  // For each slot, which player-indices are eligible.
  const eligible = slotLabels.map((slot) =>
    players.map((p, i) => (slotAllows(slot, p.position) ? i : -1)).filter((i) => i >= 0),
  );
  const matchOfPlayer = new Array(players.length).fill(-1);
  const tryAssign = (slotIdx, seen) => {
    for (const pi of eligible[slotIdx]) {
      if (seen[pi]) continue;
      seen[pi] = true;
      if (matchOfPlayer[pi] === -1 || tryAssign(matchOfPlayer[pi], seen)) {
        matchOfPlayer[pi] = slotIdx;
        return true;
      }
    }
    return false;
  };
  let filled = 0;
  for (let s = 0; s < slotLabels.length; s += 1) {
    if (tryAssign(s, new Array(players.length).fill(false))) filled += 1;
  }
  return filled;
}

/** True iff the roster can fill every starting slot (a legal lineup exists). */
export function canFieldLineup(playerIds, slotLabels, catalog) {
  return maxSlotsFilled(playerIds, slotLabels, catalog) >= slotLabels.length;
}

/**
 * Optimal starting lineup for a roster in a given week -> split-normal params.
 * bestLineupDistribution fills each slot with the best eligible unused player by
 * that week's projection; a bye player projects 0, so he's automatically benched.
 */
function optimalLineupParams(playerIds, slotLabels, projectionMap, catalog, week) {
  const { starters } = bestLineupDistribution(
    playerIds,
    flexLastSlots(slotLabels),
    projectionMap,
    catalog,
    week,
  );
  return starterParams(starters, projectionMap, catalog, week);
}

/**
 * Optimal lineup for a week WITH per-slot detail (name/position/projection) so
 * the schedule week view can show exactly who each side is projected to start.
 * Same greedy fill as bestLineupDistribution (best eligible per slot, byes = 0),
 * but it also returns the slot->player mapping and the sim params.
 */
function optimalLineup(playerIds, slotLabels, projectionMap, catalog, week) {
  const orderedSlots = flexLastSlots(slotLabels);
  const pool = playerIds
    .map((id) => ({ id, position: catalog[id]?.position, dist: playerDistribution(id, projectionMap, catalog[id], week) }))
    .filter((p) => p.position);
  const used = new Set();
  const lineup = [];
  const starterIds = [];
  for (const slot of orderedSlots) {
    let best = null;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      if (!slotAllows(slot, p.position)) continue;
      if (!best || p.dist.mean > best.dist.mean) best = p;
    }
    if (best) {
      used.add(best.id);
      starterIds.push(best.id);
      lineup.push({ slot, playerId: best.id, name: catalog[best.id]?.name ?? String(best.id), position: best.position, projection: Number(best.dist.mean.toFixed(1)) });
    } else {
      lineup.push({ slot, playerId: null, name: '—', position: null, projection: 0 });
    }
  }
  return { lineup, params: starterParams(starterIds, projectionMap, catalog, week) };
}

function sumMeans(params) {
  return params.players.reduce((s, p) => s + p.mean, 0);
}

/** Optimal starter assignment (slot -> playerId) for a week; byes (proj 0) lose. */
function optimalAssign(playerIds, slotLabels, projectionMap, catalog, week) {
  const orderedSlots = flexLastSlots(slotLabels);
  const pool = playerIds
    .map((id) => ({ id, position: catalog[id]?.position, mean: playerDistribution(id, projectionMap, catalog[id], week).mean }))
    .filter((p) => p.position);
  const used = new Set();
  const assign = [];
  for (const slot of orderedSlots) {
    let best = null;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      if (!slotAllows(slot, p.position)) continue;
      if (!best || p.mean > best.mean) best = p;
    }
    if (best) { used.add(best.id); assign.push({ slot, playerId: best.id }); }
    else assign.push({ slot, playerId: null });
  }
  return assign;
}

// Projected points contributed by ONE position's STARTERS in the optimal lineup
// (dedicated slots + any flex slots that position wins). Used only to test
// whether a trade upgrades a specific position the user asked to improve.
function positionStarterMean(playerIds, position, slotLabels, projectionMap, catalog) {
  const assign = optimalAssign(playerIds, slotLabels, projectionMap, catalog, null);
  let mean = 0;
  for (const a of assign) {
    if (a.playerId && catalog[a.playerId]?.position === position) {
      mean += projectionMap.get(a.playerId)?.mean ?? 0;
    }
  }
  return mean;
}

// Fallback replacement floor when the projection universe has no free agent at a
// position (e.g. synthetic tests). Real leagues override this per-position with
// the best available free agent (see replacementLevels).
const REPLACEMENT_FALLBACK = { QB: 12, RB: 6, WR: 6, TE: 5, K: 7, DEF: 6, DST: 6 };

/**
 * Per-position waiver "replacement" value = the projection of the BEST free agent
 * at that position (highest-projected player not on any team's roster). This is
 * what a manager would stream when a required slot can't be filled, and it is
 * automatically league-size-aware: fewer teams => fewer players rostered => the
 * best available free agent is a better player => a higher replacement level.
 */
export function replacementLevels(teams, projectionMap, catalog) {
  const rostered = new Set((teams ?? []).flatMap((t) => (t.players ?? []).map(String)));
  const byPos = new Map();
  for (const [id] of projectionMap) {
    if (rostered.has(String(id))) continue;
    const pos = catalog[id]?.position;
    if (!pos) continue;
    // Injury-aware season mean: playerDistribution zeroes OUT/IR players, so an
    // injured free agent can't set an inflated replacement level.
    const mean = playerDistribution(id, projectionMap, catalog[id], null).mean;
    if (!Number.isFinite(mean) || mean <= 0) continue;
    if (!byPos.has(pos) || mean > byPos.get(pos)) byPos.set(pos, mean);
  }
  return (pos) => byPos.get(pos) ?? REPLACEMENT_FALLBACK[pos] ?? 5;
}

/**
 * Optimal-lineup starter params with a WAIVER FLOOR: every starting slot scores
 * at least its positional replacement level (the best available free agent). A
 * manager would never start a bye/injured/below-replacement player in a required
 * slot when a free agent is available — they stream one. This covers three cases
 * the raw optimal lineup gets wrong by scoring 0: an unfilled slot (no player at
 * that position), a bye player (projection 0 that week), and a starter projected
 * below the streamable replacement.
 */
function streamedLineupParams(playerIds, slotLabels, projectionMap, catalog, week, replacementFor) {
  const assign = optimalAssign(playerIds, slotLabels, projectionMap, catalog, week);
  const players = [];
  for (const a of assign) {
    // Replacement level for this slot (FLEX = best streamable among its positions).
    const repl = FLEX_ELIGIBILITY[a.slot]
      ? Math.max(...FLEX_ELIGIBILITY[a.slot].map((p) => replacementFor(p)))
      : replacementFor(a.slot);
    const own = a.playerId ? playerSimParams(a.playerId, projectionMap, catalog[a.playerId], week) : null;
    if (own && own.mean >= repl) {
      players.push(own);
    } else {
      const sd = Math.max(1, repl * 0.4);
      players.push({ mean: repl, sigmaDown: sd, sigmaUp: sd });
    }
  }
  return { players };
}

/**
 * A team's projected points for one week under the ONE lineup rule the whole app
 * shares: the CURRENT (ongoing) week uses the team's ACTUAL set starters — the user
 * controls it, so an empty slot scores 0 — and every FUTURE week uses the optimal
 * lineup with byes/empty slots filled at replacement level. Same split as the
 * weekly lines (engine.js) and the season sim (seasonSetup). Exported so the
 * Predictor / forks / projected-scores in leverage.js price weeks identically.
 */
export function teamWeekProjection(team, week, currentWeek, slotLabels, projectionMap, catalog, replacementFor) {
  if (week === currentWeek) {
    return teamDistribution(team.starters ?? [], projectionMap, catalog, week).mean;
  }
  return sumMeans(streamedLineupParams(team.players ?? [], slotLabels, projectionMap, catalog, week, replacementFor));
}

/** Actual starter assignment from a provider starters array (aligned to slots). */
function actualAssign(starterIds, slotLabels) {
  return slotLabels.map((slot, i) => {
    const id = starterIds?.[i];
    return { slot, playerId: id && id !== '0' ? id : null };
  });
}

/**
 * Full roster detail for one team in one week: the starting lineup (by slot) plus
 * the bench (everyone else), each with that week's projection, plus the sim params
 * for the starters. Lets the schedule week view compare starters vs bench.
 */
function rosterDetail(starterAssign, allPlayerIds, projectionMap, catalog, week) {
  const proj = (id) => (id ? Number(playerDistribution(id, projectionMap, catalog[id], week).mean.toFixed(1)) : 0);
  const starters = starterAssign.map(({ slot, playerId }) => ({
    slot,
    playerId: playerId ?? null,
    name: playerId ? (catalog[playerId]?.name ?? String(playerId)) : '—',
    position: playerId ? (catalog[playerId]?.position ?? null) : null,
    projection: proj(playerId),
  }));
  const starterSet = new Set(starterAssign.map((s) => s.playerId).filter(Boolean));
  const bench = allPlayerIds
    .filter((id) => !starterSet.has(id))
    .map((id) => ({
      slot: 'BN',
      playerId: id,
      name: catalog[id]?.name ?? String(id),
      position: catalog[id]?.position ?? null,
      projection: proj(id),
    }))
    .sort((a, b) => b.projection - a.projection);
  return { starters, bench, params: starterParams([...starterSet], projectionMap, catalog, week) };
}

/**
 * One draw from a player's asymmetric CI, CENTERED ON THE MEAN. A raw split-normal
 * averages above its mode when right-skewed, which would bias team totals and
 * unfairly reward high-ceiling lineups; subtracting the skew offset makes
 * E[draw] = mean while keeping the CI's asymmetric shape.
 */
/** Split-normal draw from a GIVEN standard-normal z (enables common random numbers). */
function splitNormalFromZ(p, z) {
  const s = z >= 0 ? p.sigmaUp : p.sigmaDown;
  const skewOffset = (p.sigmaUp - p.sigmaDown) * INV_SQRT_2PI;
  return Math.max(0, p.mean - skewOffset + z * s);
}

function splitNormalDraw(p, rng) {
  return splitNormalFromZ(p, gaussian(rng));
}

// Unclamped split-normal draw: E[draw] = mean exactly (no 0-floor). Used ONLY for
// the user's matchup histograms so their averages land on the displayed
// projection — the 0-floor in splitNormalDraw would lift a team's summed score a
// couple points. The rest of the app keeps the floored draw unchanged.
function splitNormalDrawRaw(p, rng) {
  const z = gaussian(rng);
  const s = z >= 0 ? p.sigmaUp : p.sigmaDown;
  const skewOffset = (p.sigmaUp - p.sigmaDown) * INV_SQRT_2PI;
  return p.mean - skewOffset + z * s;
}

/**
 * Player-level Monte Carlo win probability: each sim draws every starter from
 * their own asymmetric CI, sums the lineup, and compares to the opponent's.
 * Seeded shared rng -> identical every run, and A's win% + B's win% = 100%.
 */
function simulateMatchupWinProb(a, b, rng) {
  let wins = 0;
  for (let i = 0; i < MATCHUP_SIMS; i += 1) {
    let scoreA = 0;
    for (const p of a.players) scoreA += splitNormalDraw(p, rng);
    let scoreB = 0;
    for (const p of b.players) scoreB += splitNormalDraw(p, rng);
    if (scoreA > scoreB) wins += 1;
    else if (scoreA === scoreB) wins += 0.5;
  }
  return wins / MATCHUP_SIMS;
}

/**
 * Same matchup sim as simulateMatchupWinProb, but KEEPS every sim's two team
 * scores (it draws in the identical a-then-b order, so it consumes the rng
 * exactly the same way and yields the identical win prob — safe to swap in for
 * one matchup without perturbing a shared rng stream). Returns the raw per-sim
 * score arrays so the caller can build score/margin histograms.
 */
function simulateMatchupSamples(a, b, rng) {
  const scoreA = new Float64Array(MATCHUP_SIMS);
  const scoreB = new Float64Array(MATCHUP_SIMS);
  let wins = 0;
  for (let i = 0; i < MATCHUP_SIMS; i += 1) {
    // Unclamped draws so the team totals are unbiased (see splitNormalDrawRaw).
    let sa = 0;
    for (const p of a.players) sa += splitNormalDrawRaw(p, rng);
    let sb = 0;
    for (const p of b.players) sb += splitNormalDrawRaw(p, rng);
    scoreA[i] = sa;
    scoreB[i] = sb;
    if (sa > sb) wins += 1;
    else if (sa === sb) wins += 0.5;
  }
  return { winProbA: wins / MATCHUP_SIMS, scoreA, scoreB };
}

/** Density histogram of a sample array: equal-width bins whose areas sum to 1. */
function densityHistogram(values, nbins = 32) {
  const n = values.length;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  if (!(max > min)) max = min + 1; // degenerate guard
  const width = (max - min) / nbins;
  const counts = new Array(nbins).fill(0);
  for (let i = 0; i < n; i += 1) {
    let idx = Math.floor((values[i] - min) / width);
    if (idx < 0) idx = 0;
    else if (idx >= nbins) idx = nbins - 1;
    counts[idx] += 1;
  }
  const bins = counts.map((c, i) => ({
    x: Number((min + (i + 0.5) * width).toFixed(2)), // bin center
    density: Number((c / (n * width)).toFixed(6)),
  }));
  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number((sum / n).toFixed(2)),
    binWidth: Number(width.toFixed(3)),
    bins,
  };
}

/**
 * The three matchup distributions from the USER's perspective. Samples come from
 * the UNBIASED (unclamped) draw, so each team's average already sits on its
 * displayed projection (projA / projB = the sum-of-means on the matchup line); the
 * tiny shift below just pins it there exactly, cancelling Monte-Carlo sampling
 * noise so the chart matches the line to the decimal (shape is untouched). The
 * returned winProb is the exact sample fraction, and the caller uses it as the
 * matchup line's win% so the chart and the line agree.
 */
function matchupHistograms(scoreA, scoreB, userIsA, projA, projB) {
  const n = scoreA.length;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i += 1) {
    sumA += scoreA[i];
    sumB += scoreB[i];
  }
  const shiftA = projA - sumA / n;
  const shiftB = projB - sumB / n;
  const you = new Float64Array(n);
  const opp = new Float64Array(n);
  const margin = new Float64Array(n);
  let wins = 0;
  for (let i = 0; i < n; i += 1) {
    const av = scoreA[i] + shiftA;
    const bv = scoreB[i] + shiftB;
    const yv = userIsA ? av : bv;
    const ov = userIsA ? bv : av;
    you[i] = yv;
    opp[i] = ov;
    margin[i] = yv - ov;
    if (yv > ov) wins += 1;
    else if (yv === ov) wins += 0.5;
  }
  return {
    sims: n,
    winProb: wins / n,
    you: densityHistogram(you),
    opponent: densityHistogram(opp),
    margin: densityHistogram(margin),
  };
}

function lineFromDistributions(a, b, winProb) {
  return {
    moneyline: probToAmerican(winProb),
    winProbability: Number((winProb * 100).toFixed(1)),
    projection: Number(a.mean.toFixed(1)),
    spread: Number((a.mean - b.mean).toFixed(1)),
    total: Number((a.mean + b.mean).toFixed(1)),
  };
}

export function computeInputsHash({ projectionVersion, teams, week, overlay }) {
  const payload = JSON.stringify({
    projectionVersion,
    week,
    starters: teams.map((t) => [t.rosterId, t.starters]),
    // A user's projection overlay is part of the inputs: their adjusted lines
    // must cache and seed independently of the house line.
    overlay: overlay ?? null,
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

// Seed hash for the sim's RANDOM stream. It deliberately EXCLUDES
// projectionVersion (unlike computeInputsHash, which identifies a cache/record
// state). Reason: projectionVersion churns constantly — it ends in
// `:consensusCount`, and flips on the model-only->consensus warmup — so if the
// seed tracked it, every version bump would reshuffle the entire common-random-
// number stream and re-roll every team's title odds from scratch, making the
// displayed championship % (and every trade delta) jump on refresh. Keying the
// seed to the STABLE inputs (rosters + week + overlay) holds the noise fixed, so
// projections still move the odds through the mean scores but smoothly (proper
// CRN — noise cancels between two states instead of being re-drawn).
export function computeSeedHash({ teams, week, overlay }) {
  const payload = JSON.stringify({
    week,
    starters: teams.map((t) => [t.rosterId, t.starters]),
    overlay: overlay ?? null,
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

/**
 * Apply a user's projection overlay onto a base projection. The overlay holds
 * absolute points the user set ({ base, weekly }), not deltas — Franco is the
 * starting point, the user's number wins where present, everything else stays
 * Franco. This is the "my book, my line" merge: Franco → user.
 */
/**
 * Live-score lock: for the CURRENT week, replace a finished player's projection
 * with their ACTUAL points and zero variance (floor = ceiling = mean), so the
 * sim draws exactly that score every iteration and treats them as decided. Mutates
 * projectionMap in place. No-op when liveLocks is empty — so the normal
 * projection-only pricing path is 100% unchanged, and this only activates during
 * a live game week once finished players are passed in.
 */
export function applyLiveLocks(projectionMap, liveLocks, week) {
  if (!liveLocks || week == null) return projectionMap;
  for (const playerId of Object.keys(liveLocks)) {
    const pts = Number(liveLocks[playerId]);
    if (!Number.isFinite(pts)) continue;
    const proj = projectionMap.get(playerId);
    if (!proj) continue;
    projectionMap.set(playerId, {
      ...proj,
      stdev: 0,
      weekly: { ...(proj.weekly ?? {}), [week]: pts, [String(week)]: pts },
      weeklyCI: {
        ...(proj.weeklyCI ?? {}),
        [week]: { floor: pts, ceiling: pts },
        [String(week)]: { floor: pts, ceiling: pts },
      },
    });
  }
  return projectionMap;
}

export function applyOverlay(projectionMap, overlay) {
  if (!overlay || typeof overlay !== 'object') return projectionMap;
  for (const [playerId, ov] of Object.entries(overlay)) {
    if (!ov || typeof ov !== 'object') continue;
    const base = projectionMap.get(playerId) ?? {
      playerId,
      mean: 0,
      stdev: 6,
      weekly: {},
    };
    const next = { ...base };
    if (typeof ov.base === 'number' && Number.isFinite(ov.base)) {
      next.mean = ov.base;
      // Weekly matchups price off weekly[week], not the season mean, so shift
      // the whole weekly grid to the user's level while keeping Franco's
      // week-to-week shape. (e.g. base 12.8 → 16 scales every week by 1.25.)
      const oldMean = base.mean;
      if (base.weekly && oldMean > 0) {
        const factor = ov.base / oldMean;
        const scaled = {};
        for (const [w, v] of Object.entries(base.weekly)) scaled[w] = v * factor;
        next.weekly = scaled;
      }
    }
    if (ov.weekly && typeof ov.weekly === 'object') {
      // Explicit per-week overrides win over the scaled grid.
      next.weekly = { ...(next.weekly ?? base.weekly ?? {}), ...ov.weekly };
    }
    projectionMap.set(playerId, next);
  }
  return projectionMap;
}

/**
 * Price one league: matchup lines, user swap deltas, season futures.
 * @param {object} ctx { league, teams, matchups, week, catalog, scheduleWeeks }
 */
/**
 * Prepare a raw league ctx (projections = version + list) into the shape every sim
 * needs: a projectionMap keyed by player id (overlay + live-locks applied), slotLabels,
 * catalog, and the stable per-league seed. ONE place, so the Predictor / leverage
 * endpoints price against the EXACT same projections as priceLeague -- no drift, which
 * is the whole point of not rebuilding this outside the engine. Returns null if there
 * are no projections.
 */
export function prepareLeagueCtx(ctx) {
  const active = ctx.projections ?? getActiveProjections();
  if (!active) return null;
  const { league, teams, week, overlay } = ctx;
  // Starting slots for this league (exclude bench/IR/taxi).
  const slotLabels = (league.rosterPositions ?? []).filter((p) => !['BN', 'IR', 'TAXI'].includes(p));
  const projectionMap = new Map(active.projections.map((p) => [p.playerId, p]));
  applyOverlay(projectionMap, overlay);               // user's numbers on top of Franco
  applyLiveLocks(projectionMap, ctx.liveLocks, week); // lock finished players (no-op until live)
  // Stable seed from rosters + week + overlay only (NOT record/schedule), so conditioning
  // a season on a pick reuses the identical random draws (common random numbers).
  const seed = parseInt(computeSeedHash({ teams, week, overlay }).slice(0, 8), 16);
  return { ...ctx, catalog: ctx.catalog ?? ctx.players, active, slotLabels, projectionMap, seed };
}

export function priceLeague(ctx) {
  const prepared = prepareLeagueCtx(ctx);
  if (!prepared) {
    return { available: false, reason: 'no_projections' };
  }
  const { league, teams, matchups, week, catalog, scheduleWeeks, overlay,
          active, slotLabels, projectionMap, seed } = prepared;

  const inputsHash = computeInputsHash({
    projectionVersion: active.version,
    teams,
    week,
    overlay: overlay ?? null,
  });

  // ── matchup lines ──
  const teamsByRoster = new Map(teams.map((t) => [t.rosterId, t]));
  const distByRoster = new Map(
    teams.map((t) => [t.rosterId, teamDistribution(t.starters, projectionMap, catalog, week)]),
  );
  // Per-player split-normal params (asymmetric CI) for the headline matchup sim.
  const paramsByRoster = new Map(
    teams.map((t) => [t.rosterId, starterParams(t.starters, projectionMap, catalog, week)]),
  );

  // Per-week distributions for the futures sim: each remaining week uses
  // that week's game-level projections (byes priced as real zeros).
  const weekDistCache = new Map();
  const distForWeek = (rosterId, w) => {
    const key = `${rosterId}|${w}`;
    let dist = weekDistCache.get(key);
    if (!dist) {
      dist = teamDistribution(
        teamsByRoster.get(rosterId)?.starters ?? [],
        projectionMap,
        catalog,
        w,
      );
      weekDistCache.set(key, dist);
    }
    return dist;
  };

  const byMatchup = new Map();
  matchups.forEach((m) => {
    if (m.matchupId == null) return;
    const list = byMatchup.get(m.matchupId) ?? [];
    list.push(m);
    byMatchup.set(m.matchupId, list);
  });

  // `seed` comes from prepareLeagueCtx above (one seed per inputs state; identical
  // inputs always price identically).
  const linesRng = mulberry32(seed);

  const lines = [];
  // The user's own displayed win% this week — captured here so the market's
  // waiver card can anchor its "before" to the EXACT number the matchup shows
  // (not a second, independently-seeded sim that drifts by noise).
  const userRosterIdForLines = teams.find((t) => t.isUser)?.rosterId ?? null;
  let userDisplayWinProb = null;
  byMatchup.forEach((pair, matchupId) => {
    if (pair.length !== 2) return;
    const [a, b] = pair;
    const distA = distByRoster.get(a.rosterId);
    const distB = distByRoster.get(b.rosterId);
    // Player-level asymmetric sim for win%. projection/spread/total below stay
    // the sum of player means (distByRoster), so displayed totals are unchanged.
    // For the USER's own matchup we keep the per-sim scores to build the margin /
    // your-points / opponent-points histograms, RECENTERED onto those displayed
    // projections so the charts and the line match exactly; the displayed win% is
    // then taken from the recentered samples so it agrees with the margin chart.
    // simulateMatchupSamples draws identically to simulateMatchupWinProb, so the
    // shared linesRng stream stays aligned for the other matchups.
    const isUserMatchup =
      a.rosterId === userRosterIdForLines || b.rosterId === userRosterIdForLines;
    let winProbA;
    let userHistograms = null;
    if (isUserMatchup) {
      const s = simulateMatchupSamples(
        paramsByRoster.get(a.rosterId),
        paramsByRoster.get(b.rosterId),
        linesRng,
      );
      const userIsA = a.rosterId === userRosterIdForLines;
      userHistograms = matchupHistograms(s.scoreA, s.scoreB, userIsA, distA.mean, distB.mean);
      winProbA = userIsA ? userHistograms.winProb : 1 - userHistograms.winProb;
    } else {
      winProbA = simulateMatchupWinProb(
        paramsByRoster.get(a.rosterId),
        paramsByRoster.get(b.rosterId),
        linesRng,
      );
    }
    if (a.rosterId === userRosterIdForLines) userDisplayWinProb = winProbA;
    else if (b.rosterId === userRosterIdForLines) userDisplayWinProb = 1 - winProbA;

    lines.push({
      matchupId,
      week,
      computedAt: Date.now(),
      inputsHash,
      sides: {
        [a.rosterId]: {
          ...lineFromDistributions(distA, distB, winProbA),
          unpricedStarters: distA.unpriced,
          zeroedStarters: distA.zeroed,
          ...(a.rosterId === userRosterIdForLines && userHistograms
            ? { histograms: userHistograms }
            : {}),
        },
        [b.rosterId]: {
          ...lineFromDistributions(distB, distA, 1 - winProbA),
          unpricedStarters: distB.unpriced,
          zeroedStarters: distB.zeroed,
          ...(b.rosterId === userRosterIdForLines && userHistograms
            ? { histograms: userHistograms }
            : {}),
        },
      },
    });
  });

  // ── user swap deltas (legal moves only — roster legality from league) ──
  const userTeam = teams.find((t) => t.isUser) ?? null;
  const userSwaps = [];
  let playerMeans = {};

  if (userTeam) {
    const userMatchup = matchups.find((m) => m.rosterId === userTeam.rosterId);
    const oppMatchup = userMatchup
      ? matchups.find(
          (m) => m.matchupId === userMatchup.matchupId && m.rosterId !== userTeam.rosterId,
        )
      : null;

    // Off-season fallback: no scheduled opponent yet — price swaps against
    // the league-median team so the board never fabricates an opponent.
    const fallbackStarters = userTeam.starters;
    const usingFallback = !(userMatchup && oppMatchup) && fallbackStarters.length > 0;

    if ((userMatchup && oppMatchup) || usingFallback) {
      const oppDist = usingFallback
        ? leagueMedianDistribution(distByRoster)
        : distByRoster.get(oppMatchup.rosterId);
      const starterIds = usingFallback ? fallbackStarters : userMatchup.starters;
      const bench = userTeam.players.filter((id) => !starterIds.includes(id));

      // Phase 3: start/sit deltas from the SAME player-level split-normal sim as
      // the matchup win%, using COMMON RANDOM NUMBERS. We pre-draw the opponent
      // total, each starter's draw, and the standard-normal z per slot, then reuse
      // them for every candidate swap — so the delta reflects only the swapped
      // player (a ±0.x% is signal, not simulation noise).
      const userStarterP = starterIds.map((id) => playerSimParams(id, projectionMap, catalog[id], week));
      const oppP = usingFallback
        ? [{ mean: oppDist.mean, sigmaUp: oppDist.sigma, sigmaDown: oppDist.sigma }]
        : (paramsByRoster.get(oppMatchup.rosterId)?.players ?? []);

      const N = MATCHUP_SIMS;
      const swapRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      const oppTotal = new Float64Array(N);
      const baseTotal = new Float64Array(N);
      const slotZ = userStarterP.map(() => new Float64Array(N));
      const slotDraw = userStarterP.map(() => new Float64Array(N));
      for (let i = 0; i < N; i += 1) {
        let opp = 0;
        for (const p of oppP) opp += splitNormalDraw(p, swapRng);
        oppTotal[i] = opp;
        let base = 0;
        for (let j = 0; j < userStarterP.length; j += 1) {
          const z = gaussian(swapRng);
          slotZ[j][i] = z;
          const d = splitNormalFromZ(userStarterP[j], z);
          slotDraw[j][i] = d;
          base += d;
        }
        baseTotal[i] = base;
      }
      let baseWins = 0;
      for (let i = 0; i < N; i += 1) {
        if (baseTotal[i] > oppTotal[i]) baseWins += 1;
        else if (baseTotal[i] === oppTotal[i]) baseWins += 0.5;
      }
      const baseWinProb = baseWins / N;
      const baseMean = userStarterP.reduce((s, p) => s + p.mean, 0);

      starterIds.forEach((starterId, slotIndex) => {
        const slotLabel = slotLabels[slotIndex] ?? 'FLEX';
        const starterParam = userStarterP[slotIndex];
        const zForSlot = slotZ[slotIndex];
        const drawForSlot = slotDraw[slotIndex];

        bench.forEach((benchId) => {
          const benchPosition = catalog[benchId]?.position;
          if (!benchPosition || !slotAllows(slotLabel, benchPosition)) return; // illegal swap
          const benchParam = playerSimParams(benchId, projectionMap, catalog[benchId], week);
          if (benchParam.mean <= 0 && starterParam.mean <= 0) return; // both effectively unpriced

          let swapWins = 0;
          for (let i = 0; i < N; i += 1) {
            // Same z as this slot in this sim -> only the swapped player changes.
            const candidateDraw = splitNormalFromZ(benchParam, zForSlot[i]);
            const swapTotal = baseTotal[i] - drawForSlot[i] + candidateDraw;
            if (swapTotal > oppTotal[i]) swapWins += 1;
            else if (swapTotal === oppTotal[i]) swapWins += 0.5;
          }
          const newWinProb = swapWins / N;
          const newMean = baseMean - starterParam.mean + benchParam.mean;

          userSwaps.push({
            slotIndex,
            slotLabel,
            starterId,
            benchId,
            starterMean: Number(starterParam.mean.toFixed(1)),
            benchMean: Number(benchParam.mean.toFixed(1)),
            deltaWinProb: Number(((newWinProb - baseWinProb) * 100).toFixed(1)),
            resultingWinProb: Number((newWinProb * 100).toFixed(1)),
            resultingMoneyline: probToAmerican(newWinProb),
            resultingProjection: Number(newMean.toFixed(1)),
          });
        });
      });
    }

  }

  // Phase 1: per-player week-specific means for EVERY rostered player in the
  // league (not just the user's team), so both lineups — yours AND your
  // opponent's — display our consensus-adjusted week value instead of falling
  // back to the provider's number.
  for (const id of new Set(teams.flatMap((t) => t.players))) {
    const dist = playerDistribution(id, projectionMap, catalog[id], week);
    playerMeans[id] = {
      mean: Number(dist.mean.toFixed(1)),
      stdev: Number(dist.stdev.toFixed(1)),
      unpriced: dist.unpriced,
      zeroed: dist.zeroed,
      derived: projectionMap.get(id)?.derived ?? false,
    };
  }

  // ── season futures: simulate the remaining schedule ──
  const futures = simulateSeason({ league, teams, scheduleWeeks, week, projectionMap, catalog, slotLabels, seed });

  // ── the user's line for every scheduled week (Season tab schedule) ──
  // Same replacement levels the futures sim uses, so a future week where a
  // starter is on bye (or an empty required slot) is priced as if the manager
  // streams the waiver-level replacement, not a 0.
  const replacementFor = replacementLevels(teams, projectionMap, catalog);
  const weeklyLines = [];
  const userTeamForWeekly = teams.find((t) => t.isUser);
  const weeklyRng = mulberry32((seed ^ 0x85ebca6b) >>> 0);
  if (userTeamForWeekly) {
    for (const entry of scheduleWeeks ?? []) {
      const mine = entry.matchups.find(
        (m) => m.rosterId === userTeamForWeekly.rosterId && m.matchupId != null,
      );
      if (!mine) continue;
      const theirs = entry.matchups.find(
        (m) => m.matchupId === mine.matchupId && m.rosterId !== mine.rosterId,
      );
      if (!theirs) continue;

      const oppTeam = teamsByRoster.get(theirs.rosterId);
      const opponentName = teamsByRoster.get(theirs.rosterId)?.teamName ?? `Roster ${theirs.rosterId}`;
      const isCurrent = entry.week === week;

      // Current week: the ACTUAL set lineup (what you're really starting).
      // Future weeks: the OPTIMAL lineup (byes auto-benched). Both include the
      // full bench so you can compare starters vs bench for that week.
      const myAssign = isCurrent
        ? actualAssign(mine.starters, slotLabels)
        : optimalAssign(userTeamForWeekly.players, slotLabels, projectionMap, catalog, entry.week);
      const oppAssign = isCurrent
        ? actualAssign(theirs.starters, slotLabels)
        : optimalAssign(oppTeam?.players ?? [], slotLabels, projectionMap, catalog, entry.week);
      const my = rosterDetail(myAssign, userTeamForWeekly.players, projectionMap, catalog, entry.week);
      const opp = rosterDetail(oppAssign, oppTeam?.players ?? [], projectionMap, catalog, entry.week);

      let moneyline, winProb, projection, opponentProjection, note;
      const currentLine = isCurrent ? lines.find((line) => line.matchupId === mine.matchupId) : null;
      const currentSide = currentLine?.sides?.[String(userTeamForWeekly.rosterId)];
      const opponentSide = currentLine?.sides?.[String(theirs.rosterId)];
      if (currentSide && opponentSide) {
        // Current week: headline is the live matchup line (your actual lineup).
        moneyline = currentSide.moneyline;
        winProb = currentSide.winProbability;
        projection = currentSide.projection;
        opponentProjection = opponentSide.projection;
        note = 'Live line, your current lineup.';
      } else {
        // Future week: optimal lineup vs optimal lineup, player-level sim, with
        // bye/empty required slots filled at the streamable replacement level
        // (same as the futures sim) so a bye doesn't crater the projection.
        const myStreamed = streamedLineupParams(userTeamForWeekly.players, slotLabels, projectionMap, catalog, entry.week, replacementFor);
        const oppStreamed = streamedLineupParams(oppTeam?.players ?? [], slotLabels, projectionMap, catalog, entry.week, replacementFor);
        const wp = simulateMatchupWinProb(myStreamed, oppStreamed, weeklyRng);
        moneyline = probToAmerican(wp);
        winProb = Number((wp * 100).toFixed(1));
        projection = Number(sumMeans(myStreamed).toFixed(1));
        opponentProjection = Number(sumMeans(oppStreamed).toFixed(1));
        note = 'Optimal lineups (bye/empty slots filled at replacement), simulated player-by-player.';
      }

      weeklyLines.push({
        week: entry.week,
        opponentRosterId: theirs.rosterId,
        opponentName,
        moneyline,
        winProb,
        projection,
        opponentProjection,
        note,
        isCurrent,
        yourStarters: my.starters,
        yourBench: my.bench,
        opponentStarters: opp.starters,
        opponentBench: opp.bench,
      });
    }
  }

  // ── real Draft Wrapped (computed, not fiction) ──
  const draftWrapped = computeDraftWrapped({
    league,
    teams,
    draftPicks: ctx.draftPicks ?? null,
    projectionMap,
    distByRoster,
    scheduleWeeks,
    week,
    catalog,
    slotLabels,
    replacementFor,
  });

  // ── market movers: real FA claim + trade lanes, priced ──
  const movers = computeMovers({
    league,
    teams,
    matchups,
    projections: active.projections,
    projectionMap,
    distByRoster,
    scheduleWeeks,
    week,
    catalog,
    seed,
    overlay,
    // The user's displayed matchup win% — the waiver card anchors its "before"
    // to this exact value so it matches the matchup tab and the biggest-edge card.
    userDisplayWinProb,
  });

  // ── scoring honesty ──
  const basis = active.meta?.scoringBasis ?? 'ppr';
  let scoringNote = null;
  if (league.hasCustomScoring) {
    scoringNote = `Priced at ${basis.toUpperCase()} projections; your league has custom scoring.`;
  } else if (league.scoringFamily !== basis) {
    scoringNote = `Priced at ${basis.toUpperCase()} projections; your league is ${league.scoringFamily.toUpperCase()}.`;
  }

  return {
    available: true,
    projectionVersion: active.version,
    computedAt: Date.now(),
    inputsHash,
    week,
    scoringNote,
    lines,
    userSwaps,
    playerMeans,
    futures,
    weeklyLines,
    draftWrapped,
    movers,
    leagueMedian: leagueMedianDistribution(distByRoster),
  };
}

/** Median team distribution across the league (honest stand-in opponent). */
function leagueMedianDistribution(distByRoster) {
  const dists = [...distByRoster.values()].sort((a, b) => a.mean - b.mean);
  if (dists.length === 0) return { mean: 100, sigma: 25 };
  const mid = dists[Math.floor(dists.length / 2)];
  return { mean: Number(mid.mean.toFixed(1)), sigma: Number(mid.sigma.toFixed(1)) };
}

const GRADE_SCALE = [
  [1.15, 'A+'], [1.08, 'A'], [1.04, 'A-'], [1.0, 'B+'],
  [0.96, 'B'], [0.92, 'B-'], [0.88, 'C+'], [0, 'C'],
];

/**
 * Draft Wrapped, computed from the league's real draft:
 * - boldest pick = the user's biggest reach vs the model's overall rank
 * - roster grade = user's projected starter points vs the league median
 */
function computeDraftWrapped({ league, teams, draftPicks, projectionMap, distByRoster, scheduleWeeks, week, catalog, slotLabels, replacementFor }) {
  if (!draftPicks || draftPicks.length === 0) return null;

  const userTeam = teams.find((t) => t.isUser);
  if (!userTeam) return null;

  // model overall rank: every projected player sorted by mean
  const ranked = [...projectionMap.values()].sort((a, b) => b.mean - a.mean);
  const modelRank = new Map(ranked.map((p, i) => [p.playerId, i + 1]));

  const userPicks = draftPicks.filter((p) => p.rosterId === userTeam.rosterId);
  let boldest = null;
  let unpricedPicks = 0;

  for (const pick of userPicks) {
    const rank = modelRank.get(pick.playerId);
    if (rank === undefined) {
      unpricedPicks += 1;
      continue;
    }
    const reach = rank - pick.pickNo; // positive = drafted above the model
    if (!boldest || reach > boldest.reach) {
      boldest = {
        playerId: pick.playerId,
        name: catalog[pick.playerId]?.name ?? `Player ${pick.playerId}`,
        pickNo: pick.pickNo,
        reach,
      };
    }
  }

  // roster grade: projected starter points vs league median
  const totals = teams
    .map((t) => distByRoster.get(t.rosterId)?.mean ?? 0)
    .sort((a, b) => a - b);
  const median = totals.length
    ? (totals[Math.floor((totals.length - 1) / 2)] + totals[Math.ceil((totals.length - 1) / 2)]) / 2
    : 1;
  const userMean = distByRoster.get(userTeam.rosterId)?.mean ?? 0;
  const ratio = median > 0 ? userMean / median : 1;
  const grade = GRADE_SCALE.find(([min]) => ratio >= min)?.[1] ?? 'C';

  // toughest / easiest scheduled week by opponent strength
  let toughest = null;
  let easiest = null;
  const teamsByRoster = new Map(teams.map((t) => [t.rosterId, t]));
  for (const entry of scheduleWeeks ?? []) {
    const mine = entry.matchups.find((m) => m.rosterId === userTeam.rosterId && m.matchupId != null);
    if (!mine) continue;
    const theirs = entry.matchups.find(
      (m) => m.matchupId === mine.matchupId && m.rosterId !== mine.rosterId,
    );
    if (!theirs) continue;
    const oppTeam = teamsByRoster.get(theirs.rosterId);
    if (!oppTeam) continue;
    // Full player-level sim (same as the schedule), byes filled at replacement.
    const dwRng = mulberry32((0x1234567 ^ entry.week) >>> 0);
    const meParams = streamedLineupParams(userTeam.players, slotLabels, projectionMap, catalog, entry.week, replacementFor);
    const oppParams = streamedLineupParams(oppTeam.players, slotLabels, projectionMap, catalog, entry.week, replacementFor);
    const winProb = simulateMatchupWinProb(meParams, oppParams, dwRng);
    const row = {
      week: entry.week,
      opponent: teamsByRoster.get(theirs.rosterId)?.teamName ?? `Roster ${theirs.rosterId}`,
      odds: probToAmerican(winProb),
      winProb: Number((winProb * 100).toFixed(1)),
    };
    if (!toughest || row.winProb < toughest.winProb) toughest = row;
    if (!easiest || row.winProb > easiest.winProb) easiest = row;
  }

  return {
    teamName: userTeam.teamName,
    leagueName: league.name,
    grade,
    ratio: Number(ratio.toFixed(3)),
    boldestPick: boldest,
    unpricedPicks,
    totalPicks: userPicks.length,
    toughestWeek: toughest,
    easiestWeek: easiest,
  };
}

export function tradeLaneMatchesPricedResult(lane, priced) {
  if (!priced?.available || !priced.you || !priced.them) return false;
  const youGain = roundTradeDelta(priced.you.valueDelta ?? 0);
  const themGain = roundTradeDelta(priced.them.valueDelta ?? 0);
  return (
    roundTradeDelta(lane.valueGain ?? 0) === youGain &&
    roundTradeDelta(lane.partnerGain ?? 0) === themGain &&
    (lane.verdict == null || lane.verdict === priced.verdict) &&
    (lane.acceptanceProbability == null || lane.acceptanceProbability === priced.acceptance?.probability) &&
    (lane.valueGap == null || lane.valueGap === priced.valueGap)
  );
}

export function roundTradeDelta(value = 0) {
  return Number((value ?? 0).toFixed(1));
}

export function starterImpactBand(delta = 0) {
  const rounded = roundTradeDelta(delta);
  if (rounded > 0.5) return 'upgrade';
  if (rounded < -0.5) return 'downgrade';
  return 'flat';
}

function titleOddsDelta(lane) {
  return americanToProb(lane.titleOddsAfter ?? 0) - americanToProb(lane.titleOddsBefore ?? 0);
}

export function rankTradeLanes(lanes) {
  return [...lanes].sort((a, b) => {
    const titleDelta = Number(titleOddsDelta(b) >= 0) - Number(titleOddsDelta(a) >= 0);
    if (titleDelta !== 0) return titleDelta;
    const strictDelta = Number(b.framing === 'both_upgrade') - Number(a.framing === 'both_upgrade');
    if (strictDelta !== 0) return strictDelta;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

export function laneAcceptReasons({ opp, give, get, priced, catalog, framing = 'both_upgrade' }) {
  const youGain = roundTradeDelta(priced.you?.valueDelta ?? 0);
  const themGain = roundTradeDelta(priced.them?.valueDelta ?? 0);
  const names = (ids) => ids.map((id) => catalog[id]?.name ?? `Player ${id}`).join(' + ');

  if (titleOddsDelta({
    titleOddsBefore: priced.you?.titleBefore,
    titleOddsAfter: priced.you?.titleAfter,
  }) < 0) {
    return ['Weekly points improve. Title odds dip.'];
  }

  if (priced.volatilityReason) {
    return [priced.volatilityReason];
  }

  if (framing === 'near_fair_you_win') {
    const cost = themGain >= 0 ? 'nothing this week' : `${Math.abs(themGain).toFixed(1)} pts/wk`;
    return [
      `Costs ${opp.teamName} ${cost}; you add ${youGain.toFixed(1)}.`,
      `${opp.teamName}'s lineup stays flat; your starters gain ${youGain.toFixed(1)}.`,
      `Low-cost ask for ${opp.teamName}; you add ${youGain.toFixed(1)} this week.`,
    ];
  }

  if (starterImpactBand(themGain) === 'upgrade') {
    return [
      `${opp.teamName} upgrades starters by ${themGain.toFixed(1)} pts/wk; you add ${youGain.toFixed(1)}.`,
      `Both starters move: ${opp.teamName} +${themGain.toFixed(1)}, you +${youGain.toFixed(1)}.`,
      `Your lineup gains ${youGain.toFixed(1)} while ${opp.teamName} gains ${themGain.toFixed(1)}.`,
    ];
  }

  if (priced.bestPlayer?.toThem) {
    return [
      `${opp.teamName} gets the best player (${priced.bestPlayer.name}); you add ${youGain.toFixed(1)} pts/wk.`,
      `Best player goes their way; your starters gain ${youGain.toFixed(1)}.`,
      `${opp.teamName} gets the headline name; you get ${youGain.toFixed(1)} pts/wk.`,
    ];
  }

  return [
    `${names(get)} adds ${youGain.toFixed(1)} pts/wk to your starters.`,
    `You add ${youGain.toFixed(1)} with ${names(get)}.`,
    `${names(get)} is the weekly upgrade; ${names(give)} is the ask.`,
  ];
}

/**
 * Off-season market movers, priced in title-odds movement:
 *  1. best free-agent claim that upgrades a user starter slot
 *  2. best mutually-positive 1-for-1 trade lane against a real roster
 */
export function computeMovers(ctx) {
  const { league, teams, matchups, projections, projectionMap, distByRoster, week, catalog, seed, userDisplayWinProb = null } = ctx;
  const userTeam = teams.find((t) => t.isUser);
  if (!userTeam) return [];
  // Redraft-value movers are misleading in dynasty/keeper, where youth and
  // picks carry the value Franco's weekly model doesn't price yet.
  if (league.leagueType && league.leagueType !== 'redraft') return [];

  const slotLabels = (league.rosterPositions ?? []).filter((p) => !['BN', 'IR', 'TAXI'].includes(p));
  const rostered = new Set(teams.flatMap((t) => t.players));
  const movers = [];

  // 1) waiver / free-agent claim — priced on THIS WEEK's win probability.
  // The matchup tab is a this-week view, so the claim answers "which free agent
  // most raises my chance to win THIS week": fill an empty slot, beat a bye'd or
  // injured starter, a favorable streamer. Priced on the SAME per-player
  // asymmetric matchup sim as the headline line and the biggest-edge swaps.
  // (Season title odds are the wrong metric here — over a full year any single
  // add is fungible, e.g. a specific kicker ~ the one you'd stream, so it always
  // read ~0%.)
  const weekMeanOf = (id) => playerDistribution(id, projectionMap, catalog[id], week).mean;

  // Your opponent this week (or the league-median team in the preseason). Use
  // the ACTUAL set lineups the matchup tab prices — no replacement fill, so an
  // empty slot (you have no kicker) genuinely scores 0 this week.
  const userMatchup = matchups.find((m) => m.rosterId === userTeam.rosterId && m.matchupId != null);
  const oppMatchup = userMatchup
    ? matchups.find((m) => m.matchupId === userMatchup.matchupId && m.rosterId !== userTeam.rosterId)
    : null;
  const oppTeam = oppMatchup ? teams.find((t) => t.rosterId === oppMatchup.rosterId) : null;
  const oppStarters = oppMatchup?.starters?.length ? oppMatchup.starters : (oppTeam?.starters ?? []);
  const oppParams = oppStarters.length
    ? starterParams(oppStarters, projectionMap, catalog, week)
    : (() => {
        const d = leagueMedianDistribution(distByRoster);
        return { players: [{ mean: d.mean, sigmaUp: d.sigma, sigmaDown: d.sigma }] };
      })();

  // Your lineup slot by slot, INCLUDING empty required slots. Built from the full
  // roster via the optimal assignment so an unfilled K/DEF (you own none yet) is a
  // real mean-0 target. Critical: the provider strips '0' placeholders out of
  // `starters`, so an empty slot disappears from that array entirely — mapping over
  // it would hide the missing kicker/defense and drop it from the waiver search.
  const userLineup = optimalLineup(userTeam.players, slotLabels, projectionMap, catalog, week).lineup;
  const currentByIndex = userLineup.map((e) => e.playerId); // null for an unfilled slot
  const starterSlots = userLineup.map((entry, i) => ({
    index: i,
    slot: entry.slot,
    mean: entry.projection ?? 0,
  }));

  let bestClaim = null;
  for (const candidate of projections) {
    if (rostered.has(candidate.playerId)) continue;
    if (!['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(candidate.position)) continue;
    // Never suggest a depth-chart backup. A QB2 who out-projects a QB1 in one
    // slice is noise (he barely plays); Franco's depth_rank is the truth source.
    if (candidate.depthRank != null && candidate.depthRank >= 2) continue;
    let target = null;
    for (const s of starterSlots) {
      if (!slotAllows(s.slot, candidate.position)) continue;
      if (target == null || s.mean < target.mean) target = s;
    }
    if (!target) continue; // no legal slot for this position
    const gain = weekMeanOf(candidate.playerId) - target.mean;
    if (gain < 2) continue; // must add real points to this week's lineup
    if (!bestClaim || gain > bestClaim.gain) {
      bestClaim = { candidate, gain, targetIndex: target.index, slot: target.slot };
    }
  }

  if (bestClaim) {
    // Before = your current lineup as priced now. After = that same lineup with
    // the claim dropped into that slot (fills the empty spot, or replaces the
    // weakest current starter it beats). Empty slots (null) drop out of the sim.
    const baseStarterIds = currentByIndex.filter(Boolean);
    const afterStarterIds = currentByIndex
      .map((id, i) => (i === bestClaim.targetIndex ? bestClaim.candidate.playerId : id))
      .filter(Boolean);
    const baseParams = starterParams(baseStarterIds, projectionMap, catalog, week);
    const afterParams = starterParams(afterStarterIds, projectionMap, catalog, week);
    // Common random numbers: draw the opponent's totals ONCE and reuse them for
    // before and after, so the win-prob delta is the swap, not sim noise.
    const N = MATCHUP_SIMS;
    const oppRng = mulberry32((seed ^ 0x51ed270b) >>> 0);
    const oppTotals = new Float64Array(N);
    for (let i = 0; i < N; i += 1) {
      let s = 0;
      for (const p of oppParams.players) s += splitNormalDraw(p, oppRng);
      oppTotals[i] = s;
    }
    const winProbVs = (params) => {
      const r = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      let wins = 0;
      for (let i = 0; i < N; i += 1) {
        let s = 0;
        for (const p of params.players) s += splitNormalDraw(p, r);
        if (s > oppTotals[i]) wins += 1;
        else if (s === oppTotals[i]) wins += 0.5;
      }
      return wins / N;
    };
    // CRN delta: same opponent + same current-lineup draws, only the claimed
    // slot changes — so this is the pure effect of the add, not sim noise.
    const baseCrn = winProbVs(baseParams);
    const afterCrn = Math.max(baseCrn, winProbVs(afterParams));
    const delta = afterCrn - baseCrn;
    // Anchor the shown "before" to the EXACT win% the matchup tab displays (same
    // seeded sim as the headline line), then apply the CRN delta. So the card
    // reads "30.5% -> 30.5%+gain", consistent with the matchup and biggest-edge.
    const beforeWinProb = userDisplayWinProb != null ? userDisplayWinProb : baseCrn;
    const afterWinProb = Math.min(1, Math.max(0, beforeWinProb + delta));
    movers.push({
      kind: 'waiver',
      headline: `Claim ${bestClaim.candidate.name} off waivers`,
      detail: `Starts at ${bestClaim.candidate.position} this week (+${bestClaim.gain.toFixed(1)} pts to your lineup)`,
      playerId: bestClaim.candidate.playerId,
      valueGain: Number(bestClaim.gain.toFixed(1)),
      weekly: true,
      titleOddsBefore: probToAmerican(beforeWinProb),
      titleOddsAfter: probToAmerican(afterWinProb),
    });
  }

  return movers;
}

/** Sum a team's simulated score for a week: each starter drawn from their CI. */
function drawTeamScore(params, rng) {
  if (!params || !params.players) return 0;
  let s = 0;
  for (const p of params.players) s += splitNormalDraw(p, rng);
  return s;
}

/**
 * Independent RNG seed per (base, sim, week, rosterId). Because every team-week's
 * draw uses its own stream, changing ONE team's roster leaves every other team's
 * draws byte-identical between two runs with the same base seed — that's the
 * common-random-numbers that makes trade-analyzer deltas stable (not sim noise).
 */
function streamSeed(base, sim, week, rosterId) {
  let h = base >>> 0;
  h = Math.imul(h ^ (sim + 0x9e3779b9), 2654435761) >>> 0;
  h = Math.imul(h ^ (week + 0x85ebca6b), 2246822519) >>> 0;
  h = Math.imul(h ^ (rosterId + 0xc2b2ae35), 3266489917) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Team score for a (sim, week, rosterId) drawn from its own CRN stream. */
function drawTeamScoreCRN(params, base, sim, week, rosterId) {
  if (!params || !params.players) return 0;
  const rng = mulberry32(streamSeed(base, sim, week, rosterId));
  let s = 0;
  for (const p of params.players) s += splitNormalDraw(p, rng);
  return s;
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard (non-reseeding) single-elimination bracket seed order for a bracket of
 * `size` (a power of two): 1 & 2 on opposite halves, so winner(1v8) meets
 * winner(4v5), etc. size=4 -> [1,4,2,3]; size=8 -> [1,8,4,5,2,7,3,6].
 */
function standardBracketSeeds(size) {
  if (size <= 1) return [1];
  const half = standardBracketSeeds(size / 2);
  const out = [];
  for (const s of half) {
    out.push(s);
    out.push(size + 1 - s);
  }
  return out;
}

// Iteration count for the LIVE season engine (fewer than SEASON_SIMS: the live
// number refreshes every ~30s, so ±1% Monte-Carlo noise is fine and it keeps the
// per-cycle cost + baseline memory low at scale).
export const LIVE_SIMS = 2500;

/** Shared season setup used by simulateSeason, computeSeasonBaseline and the
 *  live engine — so seeding/bracket/params logic never drifts between them. */
function seasonSetup({ league, teams, scheduleWeeks, week, projectionMap, catalog, slotLabels, forcedBracket }) {
  const regularWeeks = league.regularSeasonWeeks ?? 14;
  const playoffTeams = Math.min(league.playoffTeams ?? 6, teams.length);
  const playoffWeekStart = league.playoffWeekStart ?? (regularWeeks + 1);
  const rosterIds = teams.map((t) => t.rosterId);
  // Which weeks are still UNDECIDED and must be simulated. Two floors, both needed:
  //   - after the last SCORED week (avoids double-counting a finalized-but-unadvanced
  //     week that is already in the records), and
  //   - at or after the current display week. Weeks BELOW the display week are already
  //     played and counted in each team's record/pointsFor; if lastScoredWeek lags the
  //     live week (ESPN's latestScoringPeriod trails), those decided weeks would
  //     otherwise sit in `remaining` and get RE-ROLLED with random draws every sim —
  //     which is exactly what kept clinched teams off 100% and eliminated teams off 0%.
  const displayWeek = Number.isFinite(week) ? week : 1;
  const lastScored = Number.isFinite(league.lastScoredWeek) ? league.lastScoredWeek : (week - 1);
  const startWeek = Math.max(displayWeek, (lastScored ?? (week - 1)) + 1);
  const remaining = (scheduleWeeks ?? []).filter((w) => w.week >= startWeek && w.week <= regularWeeks);

  const bracketSize = nextPow2(Math.max(1, playoffTeams));
  const rounds = Math.max(1, Math.round(Math.log2(bracketSize)));
  const bracketOrder = standardBracketSeeds(bracketSize);
  const playoffWeeks = [];
  for (let r = 0; r < rounds; r += 1) playoffWeeks.push(playoffWeekStart + r);

  const divisionOf = new Map(teams.map((t) => [t.rosterId, t.division ?? null]));
  const divisionsEnabled =
    (league.divisions ?? 0) >= 2 &&
    teams.some((t) => t.division != null) &&
    league.divisionWinnerPriority !== false;
  const playoffReseed = league.playoffReseed === true;

  const replacementFor = replacementLevels(teams, projectionMap, catalog);
  const weeksNeeded = new Set([...remaining.map((w) => w.week), ...playoffWeeks]);
  const paramsBy = new Map();
  for (const t of teams) {
    const m = new Map();
    for (const wk of weeksNeeded) {
      // Current (ongoing) week: the team's ACTUAL set starters — the user controls
      // this week, so an empty slot scores 0. Every future/playoff week: the optimal
      // lineup with byes/empty slots filled at replacement level. This is the same
      // current-vs-future split the weekly lines make, so per-game odds, Futures and
      // the Predictor all price a week the same way.
      m.set(wk, wk === week
        ? starterParams(t.starters, projectionMap, catalog, wk)
        : streamedLineupParams(t.players, slotLabels, projectionMap, catalog, wk, replacementFor));
    }
    paramsBy.set(t.rosterId, m);
  }
  return {
    regularWeeks, playoffTeams, rosterIds, remaining, playoffWeeks, paramsBy,
    playoff: { playoffTeams, playoffWeeks, bracketOrder, divisionOf, divisionsEnabled, playoffReseed, forcedBracket },
  };
}

/** Standings + top-K seeding (division-aware). Returns { standings, seeded }. */
function seedStandings(rosterIds, wins, pf, coin, playoff) {
  const ranked = [...rosterIds].sort(
    (x, y) =>
      (wins.get(y) - wins.get(x)) ||
      (pf.get(y) - pf.get(x)) ||
      (coin.get(y) - coin.get(x)),
  );
  let standings = ranked;
  if (playoff.divisionsEnabled) {
    const wonDiv = new Set();
    const winners = [];
    for (const id of ranked) {
      const d = playoff.divisionOf.get(id);
      if (d != null && !wonDiv.has(d)) {
        wonDiv.add(d);
        winners.push(id);
      }
    }
    const winnerSet = new Set(winners);
    standings = [...winners, ...ranked.filter((id) => !winnerSet.has(id))];
  }
  return { standings, seeded: standings.slice(0, playoff.playoffTeams) };
}

/** Single-elim bracket (reseed or fixed). drawScore(rosterId, wk) -> team score.
 *  playoff.forcedBracket (optional) maps "round:idx" -> winner rosterId (round and
 *  idx 0-based); a matchup the user has picked uses that winner instead of drawing,
 *  while every unpicked matchup still simulates — so the Predictor can condition the
 *  title on a partially-clicked-through bracket. */
function runBracket(seeded, playoff, drawScore) {
  const { playoffTeams, playoffWeeks, bracketOrder, playoffReseed, forcedBracket } = playoff;
  // Forced winner for matchup (round, idx) between a and b, else null. Only honored
  // when the pick is actually one of the two teams in that matchup.
  const forcedWin = (round, idx, a, b) => {
    if (!forcedBracket) return null;
    const w = forcedBracket[`${round}:${idx}`];
    if (w == null) return null;
    const s = String(w);
    return String(a) === s ? a : String(b) === s ? b : null;
  };
  if (playoffReseed) {
    let survivors = seeded.map((id, i) => ({ id, seed: i + 1 }));
    let r = 0;
    while (survivors.length > 1) {
      const wk = playoffWeeks[Math.min(r, playoffWeeks.length - 1)];
      survivors.sort((x, y) => x.seed - y.seed);
      const byes = nextPow2(survivors.length) - survivors.length;
      const advancing = survivors.slice(0, byes);
      const playing = survivors.slice(byes);
      for (let i = 0; i < playing.length / 2; i += 1) {
        const hi = playing[i];
        const lo = playing[playing.length - 1 - i];
        const forced = forcedWin(r, i, hi.id, lo.id);
        const winId = forced != null ? forced : (drawScore(hi.id, wk) >= drawScore(lo.id, wk) ? hi.id : lo.id);
        advancing.push(winId === hi.id ? hi : lo);
      }
      survivors = advancing;
      r += 1;
    }
    return survivors[0]?.id ?? null;
  }
  let alive = bracketOrder.map((s) => (s <= playoffTeams ? seeded[s - 1] : null));
  let r = 0;
  while (alive.length > 1) {
    const wk = playoffWeeks[Math.min(r, playoffWeeks.length - 1)];
    const next = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i];
      const b = alive[i + 1];
      if (a == null && b == null) next.push(null);
      else if (a == null) next.push(b);
      else if (b == null) next.push(a);
      else {
        const forced = forcedWin(r, i / 2, a, b);
        next.push(forced != null ? forced : (drawScore(a, wk) >= drawScore(b, wk) ? a : b));
      }
    }
    alive = next;
    r += 1;
  }
  return alive[0];
}

/**
 * The bracket as a renderable, pick-through view (NOT a sim): each round's
 * matchups with both sides + seeds, the winner where the user has forced one, and
 * `null` where it is still pending. Future rounds only materialize once the current
 * one is fully picked (their teams are unknown until then). Mirrors runBracket's
 * structure exactly, so the "round:idx" keys the client sends back as forcedBracket
 * line up with what the sim forces.
 */
export function bracketView(seeded, playoff) {
  const { playoffTeams, playoffWeeks, bracketOrder, playoffReseed, forcedBracket } = playoff;
  const wkOf = (r) => playoffWeeks[Math.min(r, playoffWeeks.length - 1)];
  const forcedWin = (round, idx, a, b) => {
    if (!forcedBracket) return null;
    const w = forcedBracket[`${round}:${idx}`];
    if (w == null) return null;
    const s = String(w);
    return String(a) === s ? a : String(b) === s ? b : null;
  };
  const seeds = seeded.map((id, i) => ({ rosterId: String(id), seed: i + 1 }));
  const rounds = [];
  let champion = null;

  if (playoffReseed) {
    let survivors = seeded.map((id, i) => ({ id, seed: i + 1 }));
    let r = 0;
    while (survivors.length > 1) {
      survivors.sort((x, y) => x.seed - y.seed);
      const byes = nextPow2(survivors.length) - survivors.length;
      const advancing = survivors.slice(0, byes);
      const playing = survivors.slice(byes);
      const matchups = [];
      let pending = false;
      for (let i = 0; i < playing.length / 2; i += 1) {
        const hi = playing[i];
        const lo = playing[playing.length - 1 - i];
        const forced = forcedWin(r, i, hi.id, lo.id);
        matchups.push({ round: r, idx: i, week: wkOf(r),
          a: { rosterId: String(hi.id), seed: hi.seed }, b: { rosterId: String(lo.id), seed: lo.seed },
          winnerRosterId: forced != null ? String(forced) : null });
        if (forced != null) advancing.push(forced === hi.id ? hi : lo);
        else pending = true;
      }
      rounds.push({ round: r, week: wkOf(r), matchups });
      if (pending) return { seeds, rounds, champion };
      survivors = advancing;
      r += 1;
    }
    champion = survivors.length === 1 ? String(survivors[0].id) : null;
    return { seeds, rounds, champion };
  }

  let alive = bracketOrder.map((s) => (s <= playoffTeams ? { id: seeded[s - 1], seed: s } : null));
  let r = 0;
  while (alive.filter(Boolean).length > 1) {
    const next = [];
    const matchups = [];
    let pending = false;
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i];
      const b = alive[i + 1];
      if (a == null && b == null) { next.push(null); continue; }
      if (a == null) { next.push(b); continue; }        // bye advances
      if (b == null) { next.push(a); continue; }         // bye advances
      const forced = forcedWin(r, i / 2, a.id, b.id);
      matchups.push({ round: r, idx: i / 2, week: wkOf(r),
        a: { rosterId: String(a.id), seed: a.seed }, b: { rosterId: String(b.id), seed: b.seed },
        winnerRosterId: forced != null ? String(forced) : null });
      if (forced != null) next.push(forced === a.id ? a : b);
      else { next.push(null); pending = true; }
    }
    rounds.push({ round: r, week: wkOf(r), matchups });
    if (pending) return { seeds, rounds, champion };
    alive = next;
    r += 1;
  }
  const last = alive.filter(Boolean);
  champion = last.length === 1 ? String(last[0].id) : null;
  return { seeds, rounds, champion };
}

/**
 * The deterministic playoff bracket for a DECIDED regular season, ready to render
 * and click through. Seeds come from the teams' current records via the same
 * sim-invariant tiebreak the sim uses, so the bracket matches the odds. `ctx`
 * carries the (optional) forcedBracket, so the view reflects the picks so far.
 * Only meaningful when the regular season is fully decided (seeding deterministic).
 */
export function playoffBracket(ctx) {
  const { teams, seed = 1 } = ctx;
  const setup = seasonSetup(ctx);
  const { rosterIds, playoff } = setup;
  const wins = new Map(teams.map((t) => [t.rosterId, t.record?.wins ?? 0]));
  const pf = new Map(teams.map((t) => [t.rosterId, t.pointsFor ?? 0]));
  const coin = new Map(rosterIds.map((id) => [id, mulberry32(streamSeed(seed, 0, 0, id))()]));
  const { seeded } = seedStandings(rosterIds, wins, pf, coin, playoff);
  const view = bracketView(seeded, playoff);
  return { ...view, playoffTeams: playoff.playoffTeams, reseed: playoff.playoffReseed === true };
}

/** Shared per-team result mapping for simulateSeason + simulateSeasonLive. */
function buildSeasonResult(teams, agg) {
  const { sims, regularWeeks, playoffCounts, titleCounts, winSums, seedSums, currentWeekWins, currentWeekTeams } = agg;
  const totalGames = regularWeeks;
  return teams.map((t) => {
    const playoffProb = playoffCounts.get(t.rosterId) / sims;
    const titleProb = titleCounts.get(t.rosterId) / sims;
    const projWinsExact = winSums.get(t.rosterId) / sims;
    const projWins = Number(projWinsExact.toFixed(1));
    const projLosses = Number(Math.max(0, totalGames - projWinsExact).toFixed(1));
    return {
      rosterId: t.rosterId,
      teamName: t.teamName,
      record: t.record,
      isUser: t.isUser,
      projWins,
      projLosses,
      projRecord: `${Math.round(projWinsExact)}-${Math.max(0, totalGames - Math.round(projWinsExact))}`,
      expWins: Number((winSums.get(t.rosterId) / sims).toFixed(2)),
      playoffProb: Number((playoffProb * 100).toFixed(1)),
      playoffClinched: playoffProb >= 0.999,
      playoffOdds: probToAmerican(playoffProb),
      titleProb: Number((titleProb * 100).toFixed(1)),
      championOdds: probToAmerican(titleProb),
      avgSeed: Number((seedSums.get(t.rosterId) / sims).toFixed(1)),
      weekWinProb: currentWeekTeams.has(t.rosterId)
        ? Number(((currentWeekWins.get(t.rosterId) / sims) * 100).toFixed(1))
        : null,
    };
  });
}

/** Group a week's matchups into [aRosterId, bRosterId] pairs. */
function weekPairs(weekEntry) {
  const byMatchup = new Map();
  (weekEntry?.matchups ?? []).forEach((m) => {
    if (m.matchupId == null) return;
    const list = byMatchup.get(m.matchupId) ?? [];
    list.push(m);
    byMatchup.set(m.matchupId, list);
  });
  const pairs = [];
  byMatchup.forEach((pair) => {
    if (pair.length === 2) pairs.push([pair[0].rosterId, pair[1].rosterId]);
  });
  return pairs;
}

/**
 * Season Monte Carlo for the Futures tab: simulates the rest of the regular
 * season player-by-player (each team fielding its OPTIMAL lineup that week), then
 * seeds a real bracket and simulates the playoffs. Returns per-team playoff %,
 * championship %, average final seed, and projected record.
 */
export function simulateSeason(ctx) {
  const { teams, week, seed = 1, sims = SEASON_SIMS } = ctx;
  const setup = seasonSetup(ctx);
  const { regularWeeks, rosterIds, remaining, paramsBy, playoff } = setup;
  const paramsFor = (id, wk) => paramsBy.get(id)?.get(wk);

  const playoffCounts = new Map(rosterIds.map((id) => [id, 0]));
  const titleCounts = new Map(rosterIds.map((id) => [id, 0]));
  const winSums = new Map(rosterIds.map((id) => [id, 0]));
  const seedSums = new Map(rosterIds.map((id) => [id, 0]));
  const currentWeekWins = new Map(rosterIds.map((id) => [id, 0]));
  const currentWeekTeams = new Set();

  for (let sim = 0; sim < sims; sim += 1) {
    const wins = new Map(teams.map((t) => [t.rosterId, t.record?.wins ?? 0]));
    const pf = new Map(teams.map((t) => [t.rosterId, t.pointsFor ?? 0]));

    for (const weekEntry of remaining) {
      for (const [aId, bId] of weekPairs(weekEntry)) {
        const sa = drawTeamScoreCRN(paramsFor(aId, weekEntry.week), seed, sim, weekEntry.week, aId);
        const sb = drawTeamScoreCRN(paramsFor(bId, weekEntry.week), seed, sim, weekEntry.week, bId);
        pf.set(aId, (pf.get(aId) ?? 0) + sa);
        pf.set(bId, (pf.get(bId) ?? 0) + sb);
        if (sa > sb) wins.set(aId, wins.get(aId) + 1);
        else if (sb > sa) wins.set(bId, wins.get(bId) + 1);
        if (weekEntry.week === week) {
          currentWeekTeams.add(aId);
          currentWeekTeams.add(bId);
          if (sa > sb) currentWeekWins.set(aId, currentWeekWins.get(aId) + 1);
          else if (sb > sa) currentWeekWins.set(bId, currentWeekWins.get(bId) + 1);
        }
      }
    }

    rosterIds.forEach((id) => winSums.set(id, winSums.get(id) + wins.get(id)));
    // Tiebreak for exact wins+PF ties. Sim-INVARIANT (no `sim` term): a fixed per-team
    // value so a tie resolves the same way in every sim. Otherwise a per-sim coin flips
    // seeds ~50/50 on ties — mainly forced-point ties in the Predictor, and (with
    // divisions) a flipped division winner cascades the whole seed block — keeping a
    // fully-decided season off 0/100. Exact ties are astronomically rare in a real
    // simulated season (float PF), so this barely touches Futures.
    const coin = new Map(rosterIds.map((id) => [id, mulberry32(streamSeed(seed, 0, 0, id))()]));
    const { standings, seeded } = seedStandings(rosterIds, wins, pf, coin, playoff);
    standings.forEach((id, i) => seedSums.set(id, seedSums.get(id) + (i + 1)));
    seeded.forEach((id) => playoffCounts.set(id, playoffCounts.get(id) + 1));
    const champion = runBracket(seeded, playoff, (id, wk) => drawTeamScoreCRN(paramsFor(id, wk), seed, sim, wk, id));
    if (champion != null) titleCounts.set(champion, titleCounts.get(champion) + 1);
  }

  return buildSeasonResult(teams, { sims, regularWeeks, playoffCounts, titleCounts, winSums, seedSums, currentWeekWins, currentWeekTeams });
}

/**
 * LIVE engine, part 1: precompute the reusable BASELINE for a league — for each of
 * `sims` iterations, every team's wins + points-for from all weeks AFTER the
 * current one (deterministic given the seed, so stable while a game plays), plus
 * the current-week pairings and the playoff-week params the live re-roll needs.
 * Computed once (e.g. off the 6h reprice); reused by every 30s live update.
 */
export function computeSeasonBaseline(ctx) {
  const { teams, week, seed = 1, sims = LIVE_SIMS } = ctx;
  const setup = seasonSetup(ctx);
  const { regularWeeks, rosterIds, remaining, playoffWeeks, paramsBy, playoff } = setup;
  const paramsFor = (id, wk) => paramsBy.get(id)?.get(wk);
  const futureWeeks = remaining.filter((w) => w.week !== week);

  const futures = [];
  for (let sim = 0; sim < sims; sim += 1) {
    const wins = new Map(rosterIds.map((id) => [id, 0]));
    const pf = new Map(rosterIds.map((id) => [id, 0]));
    for (const weekEntry of futureWeeks) {
      for (const [aId, bId] of weekPairs(weekEntry)) {
        const sa = drawTeamScoreCRN(paramsFor(aId, weekEntry.week), seed, sim, weekEntry.week, aId);
        const sb = drawTeamScoreCRN(paramsFor(bId, weekEntry.week), seed, sim, weekEntry.week, bId);
        pf.set(aId, pf.get(aId) + sa);
        pf.set(bId, pf.get(bId) + sb);
        if (sa > sb) wins.set(aId, wins.get(aId) + 1);
        else if (sb > sa) wins.set(bId, wins.get(bId) + 1);
      }
    }
    futures.push(new Map(rosterIds.map((id) => [id, { wins: wins.get(id), pf: pf.get(id) }])));
  }

  const currentEntry = remaining.find((w) => w.week === week) ?? null;
  const playoffParamsBy = new Map(
    rosterIds.map((id) => [id, new Map(playoffWeeks.map((wk) => [wk, paramsFor(id, wk)]))]),
  );

  return {
    sims, seed, week, regularWeeks, rosterIds, playoff,
    teams: teams.map((t) => ({ rosterId: t.rosterId, teamName: t.teamName, record: t.record, isUser: t.isUser })),
    base: new Map(teams.map((t) => [t.rosterId, { wins: t.record?.wins ?? 0, pf: t.pointsFor ?? 0 }])),
    futures,
    currentWeekPairs: currentEntry ? weekPairs(currentEntry) : [],
    playoffParamsBy,
  };
}

/**
 * LIVE engine, part 2: re-run the season from a cached baseline in milliseconds.
 * Only the current week is re-rolled — from each team's LIVE normal {mean,
 * variance} (from livePlayerScore-summed team distributions) — then the cached
 * future is added, teams are re-seeded, and the bracket runs. Reuses the exact
 * seeding/bracket logic as the full sim, so the odds are consistent.
 */
export function simulateSeasonLive(baseline, liveDists) {
  const { sims, seed, week, regularWeeks, rosterIds, teams, base, futures, currentWeekPairs, playoff, playoffParamsBy } = baseline;
  const playoffCounts = new Map(rosterIds.map((id) => [id, 0]));
  const titleCounts = new Map(rosterIds.map((id) => [id, 0]));
  const winSums = new Map(rosterIds.map((id) => [id, 0]));
  const seedSums = new Map(rosterIds.map((id) => [id, 0]));
  const currentWeekWins = new Map(rosterIds.map((id) => [id, 0]));
  const currentWeekTeams = new Set();

  for (let sim = 0; sim < sims; sim += 1) {
    const wins = new Map(rosterIds.map((id) => [id, base.get(id).wins]));
    const pf = new Map(rosterIds.map((id) => [id, base.get(id).pf]));

    // Current week: one normal draw per team from its LIVE distribution.
    const rng = mulberry32(streamSeed((seed ^ 0x6d2b79f5) >>> 0, sim, week, 1));
    for (const [aId, bId] of currentWeekPairs) {
      const da = liveDists.get(aId);
      const db = liveDists.get(bId);
      const sa = da ? Math.max(0, da.mean + Math.sqrt(Math.max(0, da.variance)) * gaussian(rng)) : 0;
      const sb = db ? Math.max(0, db.mean + Math.sqrt(Math.max(0, db.variance)) * gaussian(rng)) : 0;
      pf.set(aId, pf.get(aId) + sa);
      pf.set(bId, pf.get(bId) + sb);
      currentWeekTeams.add(aId);
      currentWeekTeams.add(bId);
      if (sa > sb) { wins.set(aId, wins.get(aId) + 1); currentWeekWins.set(aId, currentWeekWins.get(aId) + 1); }
      else if (sb > sa) { wins.set(bId, wins.get(bId) + 1); currentWeekWins.set(bId, currentWeekWins.get(bId) + 1); }
    }

    const fut = futures[sim];
    for (const id of rosterIds) {
      wins.set(id, wins.get(id) + fut.get(id).wins);
      pf.set(id, pf.get(id) + fut.get(id).pf);
    }

    rosterIds.forEach((id) => winSums.set(id, winSums.get(id) + wins.get(id)));
    // Tiebreak for exact wins+PF ties. Sim-INVARIANT (no `sim` term): a fixed per-team
    // value so a tie resolves the same way in every sim. Otherwise a per-sim coin flips
    // seeds ~50/50 on ties — mainly forced-point ties in the Predictor, and (with
    // divisions) a flipped division winner cascades the whole seed block — keeping a
    // fully-decided season off 0/100. Exact ties are astronomically rare in a real
    // simulated season (float PF), so this barely touches Futures.
    const coin = new Map(rosterIds.map((id) => [id, mulberry32(streamSeed(seed, 0, 0, id))()]));
    const { standings, seeded } = seedStandings(rosterIds, wins, pf, coin, playoff);
    standings.forEach((id, i) => seedSums.set(id, seedSums.get(id) + (i + 1)));
    seeded.forEach((id) => playoffCounts.set(id, playoffCounts.get(id) + 1));
    const champion = runBracket(seeded, playoff, (id, wk) => drawTeamScoreCRN(playoffParamsBy.get(id)?.get(wk), seed, sim, wk, id));
    if (champion != null) titleCounts.set(champion, titleCounts.get(champion) + 1);
  }

  return buildSeasonResult(teams, { sims, regularWeeks, playoffCounts, titleCounts, winSums, seedSums, currentWeekWins, currentWeekTeams });
}

/**
 * LIVE engine, part 3: the projection inputs the live cycle needs — the pregame
 * projectionMap (with any user overlay) and the deterministic seed — built the
 * SAME way priceLeague builds them, so the baseline + live futures line up with
 * the static sim. No liveLocks: the current week is re-rolled from the game clock,
 * not locked. Returns null off-season (no projections).
 */
export function buildLiveProjectionInputs(ctx) {
  const active = ctx.projections ?? getActiveProjections();
  if (!active) return null;
  const { league, teams, week, overlay } = ctx;
  const slotLabels = (league.rosterPositions ?? []).filter((p) => !['BN', 'IR', 'TAXI'].includes(p));
  const projectionMap = new Map(active.projections.map((p) => [p.playerId, p]));
  applyOverlay(projectionMap, overlay);
  const inputsHash = computeInputsHash({ projectionVersion: active.version, teams, week, overlay: overlay ?? null });
  const seed = parseInt(computeSeedHash({ teams, week, overlay }).slice(0, 8), 16);
  return { projectionMap, slotLabels, seed, version: active.version };
}

/**
 * LIVE engine, part 4: compute the live overlay for one league in one cycle.
 *  - builds each team's LIVE distribution from starters (pregame projection scaled
 *    by the game clock + points already scored),
 *  - closed-form win% for every current-week matchup (the same {moneyline,
 *    winProbability, projection, spread, total} line shape as the static price),
 *  - simulateSeasonLive off the cached baseline for the full futures.
 * `live` supplies the per-player resolvers the engine stays decoupled from:
 *   pointsForPlayer(id) -> points scored so far, fForPlayer(id) -> fraction remaining.
 * Returns { at, week, sides:{matchupId:{rosterId:lineFields}}, futures }.
 */
export function priceLiveOverlay(ctx, inputs, live, baseline) {
  const { teams, matchups, week, catalog } = ctx;
  const { projectionMap } = inputs;
  const pointsForPlayer = live.pointsForPlayer ?? (() => 0);
  const fForPlayer = live.fForPlayer ?? (() => 1);

  // Live {mean, variance} per roster (variance shrinks as games finish).
  const liveDistByRoster = new Map();
  for (const t of teams) {
    liveDistByRoster.set(
      t.rosterId,
      buildLiveTeamDistribution(
        t.starters,
        (id) => playerDistribution(id, projectionMap, catalog[id], week),
        (id) => pointsForPlayer(id),
        (id) => fForPlayer(id),
      ),
    );
  }

  const byMatchup = new Map();
  matchups.forEach((m) => {
    if (m.matchupId == null) return;
    const list = byMatchup.get(m.matchupId) ?? [];
    list.push(m);
    byMatchup.set(m.matchupId, list);
  });

  const sides = {};
  byMatchup.forEach((pair, matchupId) => {
    if (pair.length !== 2) return;
    const [a, b] = pair;
    const da = liveDistByRoster.get(a.rosterId);
    const db = liveDistByRoster.get(b.rosterId);
    if (!da || !db) return;
    const distA = { mean: da.mean, sigma: Math.sqrt(da.variance) };
    const distB = { mean: db.mean, sigma: Math.sqrt(db.variance) };
    const wpA = closedFormWinProb(da, db);
    sides[matchupId] = {
      [a.rosterId]: lineFromDistributions(distA, distB, wpA),
      [b.rosterId]: lineFromDistributions(distB, distA, 1 - wpA),
    };
  });

  const futures = baseline ? simulateSeasonLive(baseline, liveDistByRoster) : null;
  return { at: Date.now(), week, sides, futures };
}

/**
 * Starter value of every player on a roster over the given weeks = the sum of
 * their own projection in the weeks they'd be IN the optimal starting lineup.
 * A player who never starts scores 0; your only kicker scores every week (so he's
 * protected); a bye week just contributes 0 that week. This is the coherent drop
 * metric — it drops your least-used bench player, NOT a redundant star.
 */
/**
 * Starter value-over-replacement: for each week, build the optimal lineup and
 * credit each starter max(0, week mean − positional replacement). A slot filled
 * below replacement is worth 0 (you'd stream the replacement instead).
 */
function starterVOR(teamPlayers, slotLabels, projectionMap, catalog, weeks, replacementFor) {
  const orderedSlots = flexLastSlots(slotLabels);
  const val = new Map(teamPlayers.map((id) => [id, 0]));
  for (const w of weeks) {
    const pool = teamPlayers
      .map((id) => ({ id, position: catalog[id]?.position, mean: playerDistribution(id, projectionMap, catalog[id], w).mean }))
      .filter((p) => p.position);
    const used = new Set();
    for (const slot of orderedSlots) {
      let best = null;
      for (const p of pool) {
        if (used.has(p.id)) continue;
        if (!slotAllows(slot, p.position)) continue;
        if (!best || p.mean > best.mean) best = p;
      }
      if (best) {
        used.add(best.id);
        const vor = Math.max(0, best.mean - replacementFor(best.position));
        val.set(best.id, (val.get(best.id) ?? 0) + vor);
      }
    }
  }
  return val;
}

/** A player's total value over replacement across the weeks (regardless of
 *  starting) — their worth as a depth/hold asset. */
function standaloneVOR(playerId, projectionMap, catalog, weeks, replacementFor) {
  const pos = catalog[playerId]?.position;
  let v = 0;
  for (const w of weeks) {
    const mean = playerDistribution(playerId, projectionMap, catalog[playerId], w).mean;
    v += Math.max(0, mean - replacementFor(pos));
  }
  return v;
}

// A benched player is worth ~half their standalone value-over-replacement (only
// helps on a bye/injury/matchup).
const BENCH_WEIGHT = 0.5;

/**
 * Iteratively drop the lowest keep-score player, where keep-score = points OVER
 * REPLACEMENT while starting + half the standalone value-over-replacement as
 * depth. Because a player near the streamable replacement (a kicker, a defense,
 * a waiver-level skill player) has little value over replacement, backups and
 * even a sole K/DEF fall out naturally when a higher-VOR player needs the roster
 * spot — no special-case rules and no feasibility protection needed: the season
 * sim streams a replacement for any emptied required slot, so dropping your last
 * kicker is honestly priced, not blocked.
 */
export function chooseDrops(teamPlayers, droppableIds, n, slotLabels, projectionMap, catalog, weeks, replacementFor) {
  const drops = [];
  let pool = [...teamPlayers];
  const droppable = new Set(droppableIds.map(String));
  for (let k = 0; k < n; k += 1) {
    const starter = starterVOR(pool, slotLabels, projectionMap, catalog, weeks, replacementFor);
    // Full credit for value while STARTING, plus half credit for value in the
    // weeks the player would only be depth (standalone − starter). This avoids
    // double-counting a starter's own weeks, so a low-VOR sole kicker doesn't
    // out-score a higher-VOR bench skill player.
    const keepScore = (id) => {
      const sv = starter.get(id) ?? 0;
      const total = standaloneVOR(id, projectionMap, catalog, weeks, replacementFor);
      return sv + BENCH_WEIGHT * Math.max(0, total - sv);
    };
    let worst = null;
    let worstScore = Infinity;
    for (const id of pool) {
      if (!droppable.has(String(id))) continue;
      const score = keepScore(id);
      if (score < worstScore) { worstScore = score; worst = id; }
    }
    if (worst == null) break;
    drops.push(worst);
    pool = pool.filter((id) => id !== worst);
    droppable.delete(String(worst));
  }
  return drops;
}

/**
 * Trade analyzer: swap the given players between the user and a partner, enforce
 * roster limits (marginal-value drops), then re-run the season Monte Carlo with
 * the SAME seed (common random numbers) and report the change in playoff %,
 * championship %, average seed, and expected wins — for both sides.
 */
/** Current-week win% delta between two season-sim rows (null when unavailable). */
function weekWinProbDelta(after, before) {
  if (after == null || after.weekWinProb == null || before == null || before.weekWinProb == null) return null;
  return Number((after.weekWinProb - before.weekWinProb).toFixed(1));
}

export function analyzeTrade(ctx, { partnerRosterId, give = [], get = [], userDrops = null }) {
  const active = ctx.projections ?? getActiveProjections();
  if (!active) return { available: false, reason: 'no_projections' };
  const { league, teams, week, catalog, scheduleWeeks, overlay } = ctx;
  const projectionMap = new Map(active.projections.map((p) => [p.playerId, p]));
  applyOverlay(projectionMap, overlay);

  const slotLabels = (league.rosterPositions ?? []).filter((p) => !['BN', 'IR', 'TAXI'].includes(p));
  const maxRoster = (league.rosterPositions ?? []).filter((p) => !['IR', 'TAXI'].includes(p)).length;

  const userTeam = teams.find((t) => t.isUser);
  const partnerTeam = teams.find((t) => t.rosterId === Number(partnerRosterId));
  if (!userTeam || !partnerTeam) return { available: false, reason: 'team_not_found' };

  const regularWeeks = league.regularSeasonWeeks ?? 14;
  const playoffWeekStart = league.playoffWeekStart ?? (regularWeeks + 1);
  const bracketSize = nextPow2(Math.max(1, Math.min(league.playoffTeams ?? 6, teams.length)));
  const rounds = Math.max(1, Math.round(Math.log2(bracketSize)));
  const dropWeeks = [];
  for (let w = week; w <= regularWeeks; w += 1) dropWeeks.push(w);
  for (let r = 0; r < rounds; r += 1) dropWeeks.push(playoffWeekStart + r);

  const giveSet = new Set(give.map(String));
  const getSet = new Set(get.map(String));

  // Post-trade rosters BEFORE drops.
  const userAfter = [...userTeam.players.filter((id) => !giveSet.has(String(id))), ...get];
  const partnerAfter = [...partnerTeam.players.filter((id) => !getSet.has(String(id))), ...give];

  // Roster-limit drops, valued by points over replacement (user's is a
  // suggestion they can override).
  const replacementFor = replacementLevels(teams, projectionMap, catalog);
  const userNeed = Math.max(0, userAfter.length - maxRoster);
  const partnerNeed = Math.max(0, partnerAfter.length - maxRoster);
  const userDroppable = userTeam.players.filter((id) => !giveSet.has(String(id)));
  const partnerDroppable = partnerTeam.players.filter((id) => !getSet.has(String(id)));
  const finalUserDrops = userDrops && userDrops.length >= userNeed
    ? userDrops.slice(0, userNeed)
    : chooseDrops(userAfter, userDroppable, userNeed, slotLabels, projectionMap, catalog, dropWeeks, replacementFor);
  const finalPartnerDrops = chooseDrops(partnerAfter, partnerDroppable, partnerNeed, slotLabels, projectionMap, catalog, dropWeeks, replacementFor);

  const userDropSet = new Set(finalUserDrops.map(String));
  const partnerDropSet = new Set(finalPartnerDrops.map(String));
  const userFinal = userAfter.filter((id) => !userDropSet.has(String(id)));
  const partnerFinal = partnerAfter.filter((id) => !partnerDropSet.has(String(id)));

  // A trade that strips your last player at a required position (e.g. your only
  // kicker) leaves an unfillable slot every week — warn rather than pretend.
  const warnings = {
    you: canFieldLineup(userFinal, slotLabels, catalog) ? null : 'This trade leaves you without a legal starting lineup (a required position, likely K or DEF, is now empty). You would need to add one off waivers.',
    partner: canFieldLineup(partnerFinal, slotLabels, catalog) ? null : `${partnerTeam.teamName} would be left without a legal lineup at a required position.`,
  };

  // Same-seed CRN comparison.
  const inputsHash = computeInputsHash({ projectionVersion: active.version, teams, week, overlay: overlay ?? null });
  const seed = parseInt(computeSeedHash({ teams, week, overlay }).slice(0, 8), 16);
  const base = { league, teams, scheduleWeeks, week, projectionMap, catalog, slotLabels, seed };
  const baseline = simulateSeason({ ...base, sims: TRADE_SIMS });
  // Refresh each traded team's CURRENT-WEEK starters to the best lineup its NEW roster
  // can field. Without this the sim's current week keeps the pre-trade starters (and even
  // a player you just traded away), so the this-week win% never moves no matter the deal.
  // The optimal post-trade lineup is what you'd actually start, so trading in a stud lifts
  // this week and trading one away drops it.
  const optimalStarters = (playerIds) =>
    optimalAssign(playerIds, slotLabels, projectionMap, catalog, week)
      .map((a) => a.playerId)
      .filter(Boolean);
  const tradedTeams = teams.map((t) =>
    t.rosterId === userTeam.rosterId
      ? { ...t, players: userFinal, starters: optimalStarters(userFinal) }
      : t.rosterId === partnerTeam.rosterId
        ? { ...t, players: partnerFinal, starters: optimalStarters(partnerFinal) }
        : t,
  );
  const after = simulateSeason({ ...base, teams: tradedTeams, sims: TRADE_SIMS });

  const find = (arr, id) => arr.find((f) => f.rosterId === id);
  const sideDelta = (team) => {
    const b = find(baseline, team.rosterId);
    const a = find(after, team.rosterId);
    // Current-week win % is borrowed straight from the season sim above — the same
    // run (and same seed) that produced the title/playoff numbers, so it's
    // internally consistent and free.
    return {
      rosterId: team.rosterId,
      teamName: team.teamName,
      isUser: team.isUser ?? false,
      before: { playoffProb: b.playoffProb, titleProb: b.titleProb, avgSeed: b.avgSeed, expWins: b.expWins, weekWinProb: b.weekWinProb },
      after: { playoffProb: a.playoffProb, titleProb: a.titleProb, avgSeed: a.avgSeed, expWins: a.expWins, weekWinProb: a.weekWinProb },
      delta: {
        playoffProb: Number((a.playoffProb - b.playoffProb).toFixed(1)),
        titleProb: Number((a.titleProb - b.titleProb).toFixed(1)),
        avgSeed: Number((a.avgSeed - b.avgSeed).toFixed(1)),
        expWins: Number((a.expWins - b.expWins).toFixed(1)),
        weekWinProb: weekWinProbDelta(a, b),
      },
    };
  };

  const nameOf = (id) => ({ playerId: id, name: catalog[id]?.name ?? String(id) });
  return {
    available: true,
    maxRoster,
    dropsNeeded: { you: userNeed, partner: partnerNeed },
    drops: { you: finalUserDrops.map(nameOf), partner: finalPartnerDrops.map(nameOf) },
    warnings,
    you: sideDelta(userTeam),
    partner: sideDelta(partnerTeam),
  };
}

/**
 * Fair-counter on the sim: the trade is "fair" when both sides' championship-%
 * change is balanced (imbalance = yourΔc − theirΔc ≈ target, default 0). If one
 * side is winning, find the single throw-in from THAT side whose addition brings
 * the imbalance closest to the target — scored by the actual season sim, not by
 * points. Searches candidates at a cheap sim count, confirms the winner at full.
 */
export function suggestCounter(ctx, { partnerRosterId, give = [], get = [], userDrops = null, target = 0 }) {
  const active = ctx.projections ?? getActiveProjections();
  if (!active) return { available: false, reason: 'no_projections' };
  const { league, teams, week, catalog, scheduleWeeks, overlay } = ctx;
  const projectionMap = new Map(active.projections.map((p) => [p.playerId, p]));
  applyOverlay(projectionMap, overlay);

  const slotLabels = (league.rosterPositions ?? []).filter((p) => !['BN', 'IR', 'TAXI'].includes(p));
  const maxRoster = (league.rosterPositions ?? []).filter((p) => !['IR', 'TAXI'].includes(p)).length;
  const userTeam = teams.find((t) => t.isUser);
  const partnerTeam = teams.find((t) => t.rosterId === Number(partnerRosterId));
  if (!userTeam || !partnerTeam) return { available: false, reason: 'team_not_found' };

  const regularWeeks = league.regularSeasonWeeks ?? 14;
  const playoffWeekStart = league.playoffWeekStart ?? (regularWeeks + 1);
  const bracketSize = nextPow2(Math.max(1, Math.min(league.playoffTeams ?? 6, teams.length)));
  const rounds = Math.max(1, Math.round(Math.log2(bracketSize)));
  const dropWeeks = [];
  for (let w = week; w <= regularWeeks; w += 1) dropWeeks.push(w);
  for (let r = 0; r < rounds; r += 1) dropWeeks.push(playoffWeekStart + r);

  const inputsHash = computeInputsHash({ projectionVersion: active.version, teams, week, overlay: overlay ?? null });
  const seed = parseInt(computeSeedHash({ teams, week, overlay }).slice(0, 8), 16);
  const base = { league, teams, scheduleWeeks, week, projectionMap, catalog, slotLabels, seed };
  const replacementFor = replacementLevels(teams, projectionMap, catalog);
  const optimalStarters = (playerIds) =>
    optimalAssign(playerIds, slotLabels, projectionMap, catalog, week).map((a) => a.playerId).filter(Boolean);

  // Evaluate a give/get trade at a sim count vs a matching baseline; return each
  // side's championship-% change (same seed => CRN cancels sim noise).
  const evalTrade = (giveList, getList, sims, baseline) => {
    const giveSet = new Set(giveList.map(String));
    const getSet = new Set(getList.map(String));
    const userAfter = [...userTeam.players.filter((id) => !giveSet.has(String(id))), ...getList];
    const partnerAfter = [...partnerTeam.players.filter((id) => !getSet.has(String(id))), ...giveList];
    const userNeed = Math.max(0, userAfter.length - maxRoster);
    const partnerNeed = Math.max(0, partnerAfter.length - maxRoster);
    const userDroppable = userTeam.players.filter((id) => !giveSet.has(String(id)));
    const partnerDroppable = partnerTeam.players.filter((id) => !getSet.has(String(id)));
    const uDrops = userDrops && userDrops.length >= userNeed
      ? userDrops.slice(0, userNeed)
      : chooseDrops(userAfter, userDroppable, userNeed, slotLabels, projectionMap, catalog, dropWeeks, replacementFor);
    const pDrops = chooseDrops(partnerAfter, partnerDroppable, partnerNeed, slotLabels, projectionMap, catalog, dropWeeks, replacementFor);
    const uSet = new Set(uDrops.map(String));
    const pSet = new Set(pDrops.map(String));
    const userFinal = userAfter.filter((id) => !uSet.has(String(id)));
    const partnerFinal = partnerAfter.filter((id) => !pSet.has(String(id)));
    const tradedTeams = teams.map((t) =>
      t.rosterId === userTeam.rosterId ? { ...t, players: userFinal, starters: optimalStarters(userFinal) }
        : t.rosterId === partnerTeam.rosterId ? { ...t, players: partnerFinal, starters: optimalStarters(partnerFinal) } : t);
    const after = simulateSeason({ ...base, teams: tradedTeams, sims });
    const bu = baseline.find((f) => f.rosterId === userTeam.rosterId);
    const bp = baseline.find((f) => f.rosterId === partnerTeam.rosterId);
    const au = after.find((f) => f.rosterId === userTeam.rosterId);
    const ap = after.find((f) => f.rosterId === partnerTeam.rosterId);
    return { youDelta: au.titleProb - bu.titleProb, partnerDelta: ap.titleProb - bp.titleProb };
  };

  const SEARCH_SIMS = 3000;
  const FAIR_TOL = 2;      // within ±2 championship pts of target = already fair

  const baseline = simulateSeason({ ...base, sims: SEARCH_SIMS });
  const b0 = evalTrade(give, get, SEARCH_SIMS, baseline);
  const imbalance0 = b0.youDelta - b0.partnerDelta;
  if (Math.abs(imbalance0 - target) <= FAIR_TOL) {
    return { available: true, needed: false };
  }

  // Winning side adds a throw-in to hand the other side value back. Search the
  // ENTIRE remaining roster (every player not already in the deal) and pick the
  // one the sim says lands the imbalance closest to the target.
  const whoAdds = imbalance0 > target ? 'you' : 'them';
  const addTeam = whoAdds === 'you' ? userTeam : partnerTeam;
  const dealSet = new Set([...give.map(String), ...get.map(String)]);
  const cands = addTeam.players.filter((id) => !dealSet.has(String(id)));
  const withAdd = (id) => (whoAdds === 'you'
    ? { g: [...give, id], t: get }
    : { g: give, t: [...get, id] });

  let best = null;
  for (const id of cands) {
    const { g, t } = withAdd(id);
    const r = evalTrade(g, t, SEARCH_SIMS, baseline);
    const score = Math.abs((r.youDelta - r.partnerDelta) - target);
    if (!best || score < best.score) best = { id, score };
  }

  // Only suggest if a single add actually improves the balance.
  if (!best || best.score >= Math.abs(imbalance0 - target)) {
    return { available: true, needed: true, whoAdds, add: [] };
  }

  // Confirm the winner at TRADE_SIMS — the same count as the analyzer and the
  // finder — so the displayed before/after are apples-to-apples with every surface.
  const baseFull = simulateSeason({ ...base, sims: TRADE_SIMS });
  const beforeFull = evalTrade(give, get, TRADE_SIMS, baseFull);
  const { g, t } = withAdd(best.id);
  const confirm = evalTrade(g, t, TRADE_SIMS, baseFull);
  return {
    available: true,
    needed: true,
    whoAdds,
    add: [{ id: best.id, name: catalog[best.id]?.name ?? String(best.id) }],
    before: {
      youDelta: Number(beforeFull.youDelta.toFixed(1)),
      partnerDelta: Number(beforeFull.partnerDelta.toFixed(1)),
    },
    after: {
      youDelta: Number(confirm.youDelta.toFixed(1)),
      partnerDelta: Number(confirm.partnerDelta.toFixed(1)),
    },
  };
}

/**
 * Suggest the best trades across the league, scored by our season sim. Scours
 * plausible give/get combos with every opponent, cheaply pre-filters by starter
 * points, then runs the season sim on the most promising to return each side's
 * Δ championship %. The client applies the acceptance model (its per-manager
 * friendliness/relationship sliders) and ranks by expected gain = yourΔc × P(accept).
 */
// Trade acceptance — MUST stay in sync with src/utils/tradeAcceptance.ts (the
// Build-a-Trade analyzer uses that exact function). Probability the partner
// accepts, from THEIR title-odds gain and your read of them (friendliness /
// relationship, 0–10, neutral = 5). Keeping this identical is what makes the
// market ranking's accept % match the number you see in the analyzer.
const ACCEPT_BAR0 = 0.6, ACCEPT_K_FRIEND = 0.10, ACCEPT_K_REL = 0.05, ACCEPT_SPREAD = 1.5;
function acceptanceProbability(theirDeltaTitle, friendliness = 5, relationship = 5) {
  const threshold = ACCEPT_BAR0 - ACCEPT_K_FRIEND * (friendliness - 5) - ACCEPT_K_REL * (relationship - 5);
  const z = (theirDeltaTitle - threshold) / ACCEPT_SPREAD;
  return Math.max(3, Math.min(97, Math.round((1 / (1 + Math.exp(-z))) * 100)));
}

export async function suggestTrades(ctx, { maxSim = 15, partnerRosterId = null, position = null, readsByRoster = {} } = {}) {
  const active = ctx.projections ?? getActiveProjections();
  if (!active) return { available: false, reason: 'no_projections' };
  const { league, teams, week, catalog, scheduleWeeks, overlay } = ctx;
  const projectionMap = new Map(active.projections.map((p) => [p.playerId, p]));
  applyOverlay(projectionMap, overlay);

  const slotLabels = (league.rosterPositions ?? []).filter((p) => !['BN', 'IR', 'TAXI'].includes(p));
  const maxRoster = (league.rosterPositions ?? []).filter((p) => !['IR', 'TAXI'].includes(p)).length;
  const userTeam = teams.find((t) => t.isUser);
  if (!userTeam) return { available: false, reason: 'team_not_found' };
  // Manager-first: when a partner is chosen, search ONLY that manager (a wider,
  // deeper net for the one team). Otherwise fall back to every opponent.
  const opponents = partnerRosterId != null
    ? teams.filter((t) => !t.isUser && t.rosterId === partnerRosterId)
    : teams.filter((t) => !t.isUser);
  if (opponents.length === 0) return { available: true, suggestions: [], debug: { generated: 0, simmed: 0, positive: 0, ms: 0 } };

  const regularWeeks = league.regularSeasonWeeks ?? 14;
  const playoffWeekStart = league.playoffWeekStart ?? (regularWeeks + 1);
  const bracketSize = nextPow2(Math.max(1, Math.min(league.playoffTeams ?? 6, teams.length)));
  const rounds = Math.max(1, Math.round(Math.log2(bracketSize)));
  const dropWeeks = [];
  for (let w = week; w <= regularWeeks; w += 1) dropWeeks.push(w);
  for (let r = 0; r < rounds; r += 1) dropWeeks.push(playoffWeekStart + r);

  const inputsHash = computeInputsHash({ projectionVersion: active.version, teams, week, overlay: overlay ?? null });
  const seed = parseInt(computeSeedHash({ teams, week, overlay }).slice(0, 8), 16);
  const base = { league, teams, scheduleWeeks, week, projectionMap, catalog, slotLabels, seed };
  const replacementFor = replacementLevels(teams, projectionMap, catalog);

  // Best current-week lineup a roster can field — so the after-trade current week
  // reflects the deal (same fix as the analyzer). Without it the this-week win% is 0.
  const optimalStarters = (playerIds) =>
    optimalAssign(playerIds, slotLabels, projectionMap, catalog, week).map((a) => a.playerId).filter(Boolean);

  // Season-sim a give/get trade with a specific partner vs a shared baseline.
  const evalTrade = (giveList, getList, partnerTeam, sims, baseline) => {
    const giveSet = new Set(giveList.map(String));
    const getSet = new Set(getList.map(String));
    const userAfter = [...userTeam.players.filter((id) => !giveSet.has(String(id))), ...getList];
    const partnerAfter = [...partnerTeam.players.filter((id) => !getSet.has(String(id))), ...giveList];
    const userNeed = Math.max(0, userAfter.length - maxRoster);
    const partnerNeed = Math.max(0, partnerAfter.length - maxRoster);
    const uDrops = chooseDrops(userAfter, userTeam.players.filter((id) => !giveSet.has(String(id))), userNeed, slotLabels, projectionMap, catalog, dropWeeks, replacementFor);
    const pDrops = chooseDrops(partnerAfter, partnerTeam.players.filter((id) => !getSet.has(String(id))), partnerNeed, slotLabels, projectionMap, catalog, dropWeeks, replacementFor);
    const uSet = new Set(uDrops.map(String));
    const pSet = new Set(pDrops.map(String));
    const userFinal = userAfter.filter((id) => !uSet.has(String(id)));
    const partnerFinal = partnerAfter.filter((id) => !pSet.has(String(id)));
    const tradedTeams = teams.map((t) =>
      t.rosterId === userTeam.rosterId ? { ...t, players: userFinal, starters: optimalStarters(userFinal) }
        : t.rosterId === partnerTeam.rosterId ? { ...t, players: partnerFinal, starters: optimalStarters(partnerFinal) } : t);
    const after = simulateSeason({ ...base, teams: tradedTeams, sims });
    const bu = baseline.find((f) => f.rosterId === userTeam.rosterId);
    const bp = baseline.find((f) => f.rosterId === partnerTeam.rosterId);
    const au = after.find((f) => f.rosterId === userTeam.rosterId);
    const ap = after.find((f) => f.rosterId === partnerTeam.rosterId);
    // How much the trade upgrades the PARTNER's starters (pts/week) — the main
    // driver of whether they'd accept.
    const theirValueDelta = computeStarterImpact(partnerTeam.players, partnerAfter, slotLabels, projectionMap, catalog).delta;
    // Playoff-odds delta rides the SAME seeded season sim as the title delta — no
    // extra run, no added noise.
    // Playoff-odds AND current-week win% deltas both ride the SAME seeded season
    // sim as the title delta — no extra runs, no added noise.
    return {
      youDelta: au.titleProb - bu.titleProb,
      partnerDelta: ap.titleProb - bp.titleProb,
      youPlayoffDelta: au.playoffProb - bu.playoffProb,
      partnerPlayoffDelta: ap.playoffProb - bp.playoffProb,
      youWeekDelta: weekWinProbDelta(au, bu),
      partnerWeekDelta: weekWinProbDelta(ap, bp),
      theirValueDelta,
    };
  };

  // Yield to the event loop so a concurrent request (e.g. the trade analyzer)
  // isn't starved while the search runs.
  const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

  // ── Candidate generation is CHEAP: fair-value combos with each opponent
  // (1-1, 2-1, 1-2, 2-2, 3-3), scored by a starter-points PROXY (no simming).
  // Only the competent few get the expensive season sim — that's what keeps this
  // fast instead of simming thousands of trades.
  const TRADEABLE = ['QB', 'RB', 'WR', 'TE'];
  const projected = (id) => projectionMap.get(id)?.mean ?? 0;
  const val = (ids) => ids.reduce((s, id) => s + projected(id), 0);
  // Trade VALUE (VOR × position weight vs a 12-team reference) + a NEUTRAL
  // acceptance estimate — the same currency the trade detail uses, so the Market
  // ranking (title gain × accept %) lines up with the deal you open. Per-manager
  // scouting dials refine the % further on the detail view.
  const startersPerTeam = (pos) => {
    const ded = slotLabels.filter((s) => s === pos).length;
    const flex = slotLabels.filter((s) => FLEX_ELIGIBILITY[s]?.includes(pos)).length;
    return ded + flex / 3;
  };
  const TRADE_POS_W = { QB: 1.4, RB: 0.85, WR: 1.25, TE: 1.1, DEF: 0.25, K: 0.2 };
  const replByPos = {};
  const replacementTotal = (pos) => {
    if (replByPos[pos] === undefined) {
      const totals = active.projections.filter((p) => p.position === pos).map((p) => p.seasonTotal ?? 0).sort((a, b) => b - a);
      const rank = Math.max(0, Math.round(12 * Math.max(1, startersPerTeam(pos))) - 1);
      replByPos[pos] = totals[Math.min(totals.length - 1, rank)] ?? 0;
    }
    return replByPos[pos];
  };
  const valueOf = (id) => {
    const p = projectionMap.get(id);
    if (!p) return 0;
    return ((p.seasonTotal ?? 0) - replacementTotal(p.position)) * (TRADE_POS_W[p.position] ?? 1);
  };
  const sumValue = (ids) => ids.reduce((s, id) => s + Math.max(0, valueOf(id)), 0);
  const valueGapOf = (give, get) => sumValue(give) - sumValue(get); // >0 = you overpay
  const acceptEstimate = (theirValueDelta, valueGap) => {
    let s = 0.35;
    s += theirValueDelta * (theirValueDelta >= 0 ? 1.15 : 1.35);
    s += Math.max(-3.5, Math.min(3.5, valueGap / 18));
    return Math.max(3, Math.min(97, Math.round(100 / (1 + Math.exp(-s / 3.2)))));
  };
  const tradeable = (team) => team.players
    .filter((id) => TRADEABLE.includes(catalog[id]?.position))
    .sort((a, b) => projected(b) - projected(a))
    .slice(0, 9);
  const combos = (arr, k) => {
    if (k <= 0) return [[]];
    if (k > arr.length) return [];
    const out = [];
    for (let i = 0; i <= arr.length - k; i += 1) {
      for (const rest of combos(arr.slice(i + 1), k - 1)) out.push([arr[i], ...rest]);
    }
    return out;
  };
  const nameOf = (id) => catalog[id]?.name ?? String(id);
  // Every practical shape, including uneven ones (3-for-2, 3-for-1, etc.) so a lopsided
  // roster still produces balanced combos. Candidate generation is cheap (no sims); the
  // gap-sort + fairness ranking still pick the best few to actually simulate.
  const SIZES = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 3], [3, 2], [2, 3], [3, 1], [1, 3]];

  const t0 = Date.now();
  // Optional "upgrade this position" filter: only keep trades that raise the
  // user's STARTING output at that position (its dedicated + flex starters). It's
  // a candidate filter — championship % is still the value; this just narrows the
  // search to trades that improve, say, RB.
  const targetPos = position && ['QB', 'RB', 'WR', 'TE'].includes(position) ? position : null;
  const beforePos = targetPos ? positionStarterMean(userTeam.players, targetPos, slotLabels, projectionMap, catalog) : 0;

  // Candidate generation uses ONLY projected-value fairness to decide which trades
  // are worth simulating — NO starter-lineup metric. Championship % from the sim
  // is the only thing that determines value; this just picks the near-even trades
  // to sim (we can't sim every possible combo). gap = how balanced the trade is;
  // edge = how much MORE projected value YOU get (positive = leans your way).
  const scored = [];
  for (const opp of opponents) {
    const mine = tradeable(userTeam);
    const theirs = tradeable(opp);
    for (const [k, j] of SIZES) {
      for (const give of combos(mine, k)) {
        const gv = val(give);
        for (const get of combos(theirs, j)) {
          const tv = val(get);
          const r = tv > 0 ? gv / tv : 1;
          // Value band only prunes the ALL-managers pool (best deals) so it doesn't try
          // to build 100k combos. A CLICKED manager keeps EVERY combo — the gap-sort
          // below still sims the most balanced first, so you always get that manager's
          // 5 fairest trades, never blank.
          if (partnerRosterId == null && (r < 0.5 || r > 2.0)) continue;
          if (targetPos) {
            const userAfter = userTeam.players.filter((id) => !give.includes(id)).concat(get);
            const afterPos = positionStarterMean(userAfter, targetPos, slotLabels, projectionMap, catalog);
            if (afterPos <= beforePos + 0.1) continue; // must upgrade that position's starters
          }
          scored.push({ partner: opp, give, get, gap: Math.abs(gv - tv), edge: tv - gv });
        }
      }
    }
  }

  // ── Pick each manager's most VALUE-BALANCED candidates WITHOUT simulating. gap =
  // |give value − get value|, so the smallest gaps are the fairest, most realistic
  // swaps. ONLY these get the (expensive) season sim below. This is the whole fix:
  // the old design SCANNED hundreds of trades with full sims and timed out after ~20,
  // leaving most managers empty. Now we sim ~K per manager and always cover everyone.
  const dedupeKey = (c) => `${c.partner.rosterId}|${[...c.give].sort()}|${[...c.get].sort()}`;
  const K_PER_MGR = partnerRosterId != null ? 8 : 5;
  const byMgr = new Map();
  const seen = new Set();
  for (const c of scored) {
    const key = dedupeKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byMgr.get(c.partner.rosterId) ?? [];
    list.push(c);
    byMgr.set(c.partner.rosterId, list);
  }
  // Each manager contributes its K fairest-by-value trades, interleaved round-robin so
  // a time cut-off still leaves every manager represented rather than starving the tail.
  const perMgr = [...byMgr.values()].map((list) =>
    [...list].sort((a, b) => a.gap - b.gap).slice(0, K_PER_MGR));
  const finalists = [];
  for (let i = 0; i < K_PER_MGR; i += 1) {
    for (const list of perMgr) if (list[i]) finalists.push(list[i]);
  }

  // ── Sim ONLY the finalists, at a light count — fast enough to cover every manager
  // inside the budget. CRN + a stable seed keep each delta consistent across refreshes;
  // the finder is a directional read (open a deal in the analyzer for the exact number).
  // A single clicked manager is only ~K trades, so sim it at the FULL analyzer count —
  // its numbers then MATCH the Build-a-Trade analyzer exactly. The all-managers sweep
  // stays a light, fast scan (hence approximate, clearly a quick read).
  const FINDER_SIMS = partnerRosterId != null ? TRADE_SIMS : 600;
  const finalBaseline = simulateSeason({ ...base, sims: FINDER_SIMS });
  const suggestions = [];
  let re = 0;
  let finalErrors = 0;
  for (const c of finalists) {
    if (Date.now() - t0 > 26_000) break;   // return what we have before the client's 30s abort
    let ev;
    try { ev = evalTrade(c.give, c.get, c.partner, FINDER_SIMS, finalBaseline); }
    catch { finalErrors += 1; continue; }
    const { youDelta, partnerDelta, youPlayoffDelta, partnerPlayoffDelta, youWeekDelta, partnerWeekDelta } = ev;
    re += 1;
    if (re % 3 === 0) await yieldToLoop();
    // No title constraint — keep every trade, ranked by fairness below.
    const read = readsByRoster[c.partner.rosterId] ?? {};
    const accept = acceptanceProbability(partnerDelta, read.friendliness ?? 5, read.relationship ?? 5);
    suggestions.push({
      partnerRosterId: c.partner.rosterId,
      partnerName: c.partner.teamName,
      give: c.give.map((id) => ({ id, name: nameOf(id) })),
      get: c.get.map((id) => ({ id, name: nameOf(id) })),
      youDelta: Number(youDelta.toFixed(1)),
      partnerDelta: Number(partnerDelta.toFixed(1)),
      youPlayoffDelta: Number(youPlayoffDelta.toFixed(1)),
      partnerPlayoffDelta: Number(partnerPlayoffDelta.toFixed(1)),
      youWeekDelta: youWeekDelta ?? null,
      partnerWeekDelta: partnerWeekDelta ?? null,
      acceptance: accept,
      score: Number((youDelta * (accept / 100)).toFixed(2)),
    });
  }
  // Fairest first: smallest combined title movement across both teams.
  suggestions.sort((a, b) => (Math.abs(a.youDelta) + Math.abs(a.partnerDelta)) - (Math.abs(b.youDelta) + Math.abs(b.partnerDelta)));

  return {
    available: true,
    suggestions: suggestions.slice(0, 60),
    debug: {
      opponents: opponents.length,
      generated: scored.length,      // candidate combos built (no sim)
      finalists: finalists.length,   // fairest-by-value picked to actually sim
      simmed: re,                    // finalists that finished simulating
      suggestions: suggestions.length,
      finalErrors,                   // candidates that threw while simming
      ms: Date.now() - t0,
    },
  };
}

/**
 * Best legal starting lineup from a pool of players: greedily fill each
 * starting slot with the highest-projection eligible player left. Used to
 * value a roster before and after a trade — a trade is only worth what it
 * does to the lineup you'd actually start, not your bench.
 */
function bestLineupDistribution(playerIds, slotLabels, projectionMap, catalog, week) {
  const pool = playerIds
    .map((id) => ({
      id,
      position: catalog[id]?.position,
      dist: playerDistribution(id, projectionMap, catalog[id], week),
    }))
    .filter((p) => p.position);

  const used = new Set();
  let mean = 0;
  let variance = 0;
  const starters = [];

  for (const slot of slotLabels) {
    let best = null;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      if (!slotAllows(slot, p.position)) continue;
      if (!best || p.dist.mean > best.dist.mean) best = p;
    }
    if (best) {
      used.add(best.id);
      mean += best.dist.mean;
      variance += best.dist.stdev * best.dist.stdev;
      starters.push(best.id);
    }
  }

  return { mean, sigma: Math.sqrt(variance), starters };
}

function computeStarterImpact(playerIdsBefore, playerIdsAfter, slotLabels, projectionMap, catalog) {
  const before = bestLineupDistribution(playerIdsBefore, slotLabels, projectionMap, catalog, null);
  const after = bestLineupDistribution(playerIdsAfter, slotLabels, projectionMap, catalog, null);
  return {
    before,
    after,
    delta: Number((after.mean - before.mean).toFixed(1)),
  };
}

const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

function depthByPosition(playerIds, catalog) {
  const counts = Object.fromEntries(FANTASY_POSITIONS.map((p) => [p, 0]));
  for (const id of playerIds) {
    const pos = catalog[id]?.position;
    if (pos && counts[pos] != null) counts[pos] += 1;
  }
  return counts;
}

/**
 * Price a proposed trade for BOTH sides. Honest by construction: every
 * number is recomputed from the real rosters and the active projections.
 * The only subjective inputs are the partner-trait knobs, supplied by the
 * user (the one person who actually knows their league), so the
 * acceptance read is parameterized truth, never fabricated psychology.
 */
export function priceTrade(ctx, { userRosterId, partnerRosterId, give = [], get = [], traits = {}, baseline = null, sims = TRADE_SIMS, seed: seedOverride = null }) {
  const active = Array.isArray(ctx.projections)
    ? { version: 'ctx-projections', projections: ctx.projections }
    : ctx.projections ?? getActiveProjections();
  if (!active) return { available: false, reason: 'no_projections' };

  const { league, teams, catalog, scheduleWeeks, week, overlay } = ctx;
  const projectionMap = new Map(active.projections.map((p) => [p.playerId, p]));
  applyOverlay(projectionMap, overlay);
  const slotLabels = (league.rosterPositions ?? []).filter(
    (p) => !['BN', 'IR', 'TAXI'].includes(p),
  );

  const user = teams.find((t) => t.rosterId === userRosterId);
  const partner = teams.find((t) => t.rosterId === partnerRosterId);
  if (!user || !partner) return { available: false, reason: 'roster_not_found' };
  if (give.length === 0 || get.length === 0) {
    return { available: false, reason: 'empty_side' };
  }

  // One seed per inputs state (shared with priceLeague's futures sim when the
  // caller passes it), so before/after cancel common variance (CRN).
  const seed = seedOverride ?? parseInt(
    computeSeedHash({ teams, week, overlay }).slice(0, 8),
    16,
  );

  const userPoolAfter = user.players.filter((id) => !give.includes(id)).concat(get);
  const partnerPoolAfter = partner.players.filter((id) => !get.includes(id)).concat(give);
  const userImpact = computeStarterImpact(
    user.players,
    userPoolAfter,
    slotLabels,
    projectionMap,
    catalog,
  );
  const partnerImpact = computeStarterImpact(
    partner.players,
    partnerPoolAfter,
    slotLabels,
    projectionMap,
    catalog,
  );
  // Title odds move on the SAME per-player season Monte Carlo as the Futures tab
  // and the Build-a-trade analyzer — every starter drawn from its own asymmetric
  // CI, summed, compared — so a trade reads identically on every surface. The
  // market-lane pass (computeMovers) shares its season baseline via `baseline`
  // so the always-on lanes don't re-sim the pre-trade league once per lane.
  const base = { league, teams, scheduleWeeks, week, projectionMap, catalog, slotLabels, seed };
  const futuresBefore = baseline ?? simulateSeason({ ...base, sims });
  const tradedTeams = teams.map((t) =>
    t.rosterId === userRosterId
      ? { ...t, players: userPoolAfter }
      : t.rosterId === partnerRosterId
        ? { ...t, players: partnerPoolAfter }
        : t,
  );
  const futuresAfter = simulateSeason({ ...base, teams: tradedTeams, sims });

  const find = (futures, rosterId) => futures.find((f) => f.rosterId === rosterId);
  const yourBefore = find(futuresBefore, userRosterId);
  const yourAfter = find(futuresAfter, userRosterId);
  const theirBefore = find(futuresBefore, partnerRosterId);
  const theirAfter = find(futuresAfter, partnerRosterId);

  const yourValueDelta = userImpact.delta;
  const theirValueDelta = partnerImpact.delta;
  const displayYourAfter =
    yourValueDelta < 0 && (yourAfter?.titleProb ?? 0) > (yourBefore?.titleProb ?? 0)
      ? yourBefore
      : yourAfter;
  const displayTheirAfter =
    theirValueDelta < 0 && (theirAfter?.titleProb ?? 0) > (theirBefore?.titleProb ?? 0)
      ? theirBefore
      : theirAfter;

  // Trade value = value over replacement on SEASON TOTALS, against a fixed
  // 12-team reference (a small league otherwise makes even studs replacement-
  // level), tempered by position the same way the GOD board is. This keeps a
  // player's trade value consistent with where he sits in the rankings: Burrow
  // is worth far more than a streaming DEF, so a lopsided deal reads lopsided.
  const startersPerTeam = (pos) => {
    const ded = slotLabels.filter((s) => s === pos).length;
    const flex = slotLabels.filter((s) => FLEX_ELIGIBILITY[s]?.includes(pos)).length;
    return ded + flex / 3; // flex shared among RB/WR/TE
  };
  const TRADE_POS_W = { QB: 1.4, RB: 0.85, WR: 1.25, TE: 1.1, DEF: 0.25, K: 0.2 };
  const replByPos = {};
  const replacementTotal = (pos) => {
    if (replByPos[pos] === undefined) {
      const totals = active.projections
        .filter((p) => p.position === pos)
        .map((p) => p.seasonTotal ?? 0)
        .sort((a, b) => b - a);
      const rank = Math.max(0, Math.round(12 * Math.max(1, startersPerTeam(pos))) - 1);
      replByPos[pos] = totals[Math.min(totals.length - 1, rank)] ?? 0;
    }
    return replByPos[pos];
  };
  const valueOf = (id) => {
    const p = projectionMap.get(id);
    if (!p) return 0;
    const vor = (p.seasonTotal ?? 0) - replacementTotal(p.position);
    return vor * (TRADE_POS_W[p.position] ?? 1);
  };
  const sumValue = (ids) => ids.reduce((s, id) => s + Math.max(0, valueOf(id)), 0);
  const giveValue = sumValue(give);
  const getValue = sumValue(get);
  const valueGap = Number((giveValue - getValue).toFixed(0)); // >0 = you overpay

  const everyPlayer = [...give, ...get]
    .map((id) => ({
      id,
      name: catalog[id]?.name ?? `Player ${id}`,
      value: valueOf(id),
      toThem: give.includes(id),
    }))
    .sort((a, b) => b.value - a.value);
  const bestPlayer = everyPlayer[0];

  // Does the deal leave the other side without a starter at a required spot?
  const partnerDepthAfter = depthByPosition(partnerPoolAfter, catalog);
  const partnerHole = ['QB', 'RB', 'WR', 'TE'].find(
    (pos) => slotLabels.includes(pos) && (partnerDepthAfter[pos] ?? 0) === 0,
  );

  // depth picture for the user
  const depthBefore = depthByPosition(user.players, catalog);
  const depthAfter = depthByPosition(userPoolAfter, catalog);

  // Fit note is judged against their roster after the trade, so the copy cannot
  // claim a need that was created by the deal itself.
  const partnerDepth = depthByPosition(partner.players, catalog);
  const slotNeed = (pos) => slotLabels.filter((s) => slotAllows(s, pos)).length;
  const incomingPositions = new Set(give.map((id) => catalog[id]?.position).filter(Boolean));
  const outgoingPositions = new Set(get.map((id) => catalog[id]?.position).filter(Boolean));
  const replacementPos = [...incomingPositions].find((pos) => outgoingPositions.has(pos));
  const addsScarcePos = [...incomingPositions].find(
    (pos) => partnerDepth[pos] != null &&
      partnerDepth[pos] <= slotNeed(pos) &&
      (partnerDepthAfter[pos] ?? 0) <= slotNeed(pos),
  );

  // ── acceptance read: computable facts, nudged by the user's read on the
  //    other manager (1–10 dials, supplied by you — not fabricated) ──
  const clamp10 = (n, fallback) => Math.min(10, Math.max(1, n ?? fallback));
  const toughness = clamp10(traits.toughness, 5); // pushover ↔ shark
  const dealAppetite = clamp10(traits.dealAppetite, 5); // ghosts ↔ wheeler-dealer
  const fandomTeam = traits.fandomTeam ?? null;
  const fandomLevel = clamp10(traits.fandomLevel, 5);

  const reasons = [];
  let score = 0.35;

  const theirStarterBand = starterImpactBand(theirValueDelta);
  if (theirStarterBand === 'upgrade') {
    score += theirValueDelta * 1.15;
    reasons.push(`Upgrades their starters by ${theirValueDelta} pts a week, rest of season.`);
  } else if (theirStarterBand === 'downgrade') {
    score += theirValueDelta * 1.35;
    reasons.push(`Downgrades their starters by ${Math.abs(theirValueDelta)} pts a week, rest of season.`);
  } else {
    score -= 0.8;
    reasons.push('Their starters stay flat.');
  }

  if (bestPlayer.toThem) {
    score += 1.8;
    reasons.push(`They land the best player in the deal (${bestPlayer.name}).`);
  } else {
    score -= 2.5;
    reasons.push(`They give up the best player in the deal (${bestPlayer.name}).`);
  }

  // Positive valueGap means you give more total value than you receive, which
  // makes acceptance likelier; negative means you're asking them to overpay.
  score += Math.max(-3.5, Math.min(3.5, valueGap / 18));

  // The honest reason a "great value" offer still gets declined: it would
  // leave them unable to field a starter somewhere.
  if (partnerHole) {
    score -= 3.2;
    reasons.push(`It leaves them with no ${partnerHole} to start. They'd need one back in the deal.`);
  }

  if (replacementPos || addsScarcePos) {
    score += replacementPos ? 1.1 : 1.6;
    reasons.push(
      replacementPos
        ? `Replaces the ${replacementPos} they're sending.`
        : `Adds help at ${addsScarcePos}, still a scarce spot for them.`,
    );
  }

  // Fandom: a homer overvalues their NFL team's players — hard to pry one
  // loose, easy to tempt them with one.
  if (fandomTeam) {
    const wantsFromYou = get.some((id) => catalog[id]?.team === fandomTeam);
    const sendingTheirGuy = give.some((id) => catalog[id]?.team === fandomTeam);
    if (wantsFromYou) {
      score -= fandomLevel * 0.4;
      reasons.push(`You're asking for a ${fandomTeam} player and they bleed ${fandomTeam}.`);
    }
    if (sendingTheirGuy) {
      score += fandomLevel * 0.3;
      reasons.push(`You're dangling a ${fandomTeam} player they'd love to own.`);
    }
  }

  // Toughness raises the bar (5 = neutral).
  score -= (toughness - 5) * 0.6;
  if (toughness >= 8) reasons.push('You pegged them as a ruthless negotiator, so the bar is higher.');

  // Deal appetite: low = they ghost most offers; high = they love to wheel.
  if (dealAppetite <= 3) {
    score -= 1.7;
    reasons.push('You marked them as someone who ignores most offers.');
  } else if (dealAppetite >= 8) {
    score += 1.1;
    reasons.push('You marked them as an active trader who loves to wheel and deal.');
  }

  const acceptanceBand =
    score >= 5 ? 'Smash accept'
      : score >= 2.5 ? 'Likely'
        : score >= 0 ? 'Coin flip'
          : score >= -2.5 ? 'Unlikely'
            : 'Long shot';
  // Continuous probability so the scouting dials visibly move the read, not
  // just flip a coarse band. Logistic on the same score (k=2.5).
  const acceptanceProb = Math.max(3, Math.min(97, Math.round(100 / (1 + Math.exp(-score / 3.2)))));

  // ── fair-deal counter: if the player value is lopsided, suggest throw-ins
  //    that even it out (value = points over replacement, the same currency we
  //    rank trades by). The side that's getting more value adds the player(s).
  const FAIR_TOL = 15; // season-total value points; deals within this read as fair
  let fairCounter = null;
  if (Math.abs(valueGap) > FAIR_TOL) {
    const youAdd = valueGap < 0; // they overpay → you even it up; else they add
    const addingTeam = youAdd ? user : partner;
    const inDeal = new Set(youAdd ? give : get);
    // Who the adding side actually starts — we draw throw-ins from depth first so
    // a counter doesn't ask them to gut their lineup to balance the math.
    const addingStarters = new Set(
      bestLineupDistribution(addingTeam.players, slotLabels, projectionMap, catalog, null).starters,
    );
    const candidates = addingTeam.players
      .filter((id) => !inDeal.has(id))
      .map((id) => ({
        id,
        name: catalog[id]?.name ?? `Player ${id}`,
        value: valueOf(id),
        starter: addingStarters.has(id),
      }))
      .filter((c) => c.value > 0.3);
    const byValueDesc = (a, b) => b.value - a.value;
    const depth = candidates.filter((c) => !c.starter).sort(byValueDesc);
    const starters = candidates.filter((c) => c.starter).sort(byValueDesc);

    const add = [];
    let remaining = Math.abs(valueGap);
    const draw = (pool) => {
      for (const c of pool) {
        if (remaining <= FAIR_TOL || add.length >= 3) break;
        if (c.value <= remaining + FAIR_TOL) {
          add.push(c);
          remaining -= c.value;
        }
      }
    };
    draw(depth); // bench/depth first
    if (remaining > FAIR_TOL) draw(starters); // reach into starters only if needed
    // The gap is bigger than any single fitting piece: offer the closest match.
    if (add.length === 0) {
      const all = [...depth, ...starters];
      if (all.length) {
        const target = Math.abs(valueGap);
        const best = all.reduce((b, c) =>
          Math.abs(c.value - target) < Math.abs(b.value - target) ? c : b,
        );
        add.push(best);
        remaining = target - best.value;
      }
    }

    if (add.length) {
      const added = add.reduce((s, c) => s + c.value, 0);
      fairCounter = {
        whoAdds: youAdd ? 'you' : 'them',
        teamName: addingTeam.teamName,
        allDepth: add.every((c) => !c.starter),
        add: add.map((c) => ({
          id: c.id,
          name: c.name,
          value: Number(c.value.toFixed(0)),
          starter: c.starter,
        })),
        gapBefore: Math.abs(valueGap),
        gapAfter: Number(Math.abs(Math.abs(valueGap) - added).toFixed(0)),
      };
    }
  }

  // ── your-side verdict from your title-odds + value movement ──
  const titleGain = (displayYourAfter?.titleProb ?? 0) - (yourBefore?.titleProb ?? 0);
  let verdict;
  if (yourValueDelta >= 4 && titleGain >= 0) verdict = 'Smash accept';
  else if (yourValueDelta >= 1) verdict = 'Good value';
  else if (yourValueDelta > -1) verdict = 'Fair';
  else if (yourValueDelta >= -3) verdict = 'Justifiable overpay';
  else verdict = 'Overpay';

  const isDepthPackage =
    give.length >= 2 &&
    get.length === 1 &&
    give.filter((id) => bestLineupDistribution([...user.players.filter((p) => !give.includes(p)), id], slotLabels, projectionMap, catalog, week).starters.includes(id)).length <= 1;

  return {
    available: true,
    projectionVersion: active.version,
    you: {
      teamName: user.teamName,
      titleBefore: yourBefore?.championOdds ?? 0,
      titleAfter: displayYourAfter?.championOdds ?? 0,
      titleProbBefore: yourBefore?.titleProb ?? 0,
      titleProbAfter: displayYourAfter?.titleProb ?? 0,
      valueDelta: yourValueDelta,
      depthBefore,
      depthAfter,
    },
    them: {
      teamName: partner.teamName,
      titleBefore: theirBefore?.championOdds ?? 0,
      titleAfter: displayTheirAfter?.championOdds ?? 0,
      valueDelta: theirValueDelta,
    },
    verdict,
    acceptance: { band: acceptanceBand, probability: acceptanceProb, reasons },
    valueGap,
    fairCounter,
    bestPlayer: { name: bestPlayer.name, toThem: bestPlayer.toThem },
    isDepthPackage,
  };
}

/** Cached league pricing keyed by the league id; recomputes when inputs change. */
export async function getLeaguePricing(ctxLoader, leagueId) {
  return cached(`pricing:${leagueId}`, 60_000, async () => {
    const ctx = await ctxLoader();
    // Safety net: if pricing on the live-adjusted projections throws or comes
    // back unavailable, re-price on the snapshot so the league can never stall.
    try {
      const result = priceLeague(ctx);
      if (result && result.available) return result;
      if (ctx.projections) return priceLeague({ ...ctx, projections: null });
      return result;
    } catch (err) {
      if (ctx.projections) {
        console.error('[pricing] adjusted priceLeague failed; retrying snapshot', err);
        return priceLeague({ ...ctx, projections: null });
      }
      throw err;
    }
  });
}
