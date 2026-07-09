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

const SIMS = 10_000;
const FUTURES_SIMS = 2_000;
const MATCHUP_SIMS = 5_000; // seeded player-level sims for the headline matchup win%
const Z80 = 1.2815515594; // 80% CI half-width in sigmas (matches our weekly CI)
const INV_SQRT_2PI = 0.3989422804014327;
const LANE_PRICING_LIMIT_PER_OPPONENT = 2;
const LANE_PRICING_LIMIT_TOTAL = 12;

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

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function probToAmerican(prob) {
  const p = Math.min(0.985, Math.max(0.015, prob));
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

function teamDistribution(starterIds, projectionMap, catalog, week = null) {
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

/** 10k-sim win probability between two team distributions. */
function simulateWinProb(a, b, rng) {
  let wins = 0;
  for (let i = 0; i < SIMS; i += 1) {
    const scoreA = Math.max(0, a.mean + a.sigma * gaussian(rng));
    const scoreB = Math.max(0, b.mean + b.sigma * gaussian(rng));
    if (scoreA > scoreB) wins += 1;
    else if (scoreA === scoreB) wins += 0.5;
  }
  return wins / SIMS;
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

/**
 * Apply a user's projection overlay onto a base projection. The overlay holds
 * absolute points the user set ({ base, weekly }), not deltas — Franco is the
 * starting point, the user's number wins where present, everything else stays
 * Franco. This is the "my book, my line" merge: Franco → user.
 */
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
export function priceLeague(ctx) {
  const active = ctx.projections ?? getActiveProjections();

  if (!active) {
    return { available: false, reason: 'no_projections' };
  }

  const { league, teams, matchups, week, catalog, scheduleWeeks, overlay } = ctx;
  // Starting slots for this league (exclude bench/IR/taxi). Used by swaps + the
  // weekly schedule's optimal-lineup sims.
  const slotLabels = (league.rosterPositions ?? []).filter((p) => !['BN', 'IR', 'TAXI'].includes(p));

  const projectionMap = new Map(active.projections.map((p) => [p.playerId, p]));
  // Layer the user's own numbers on top of Franco before any sim runs.
  applyOverlay(projectionMap, overlay);

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

  // one seed per inputs state: identical inputs always price identically
  const seed = parseInt(inputsHash.slice(0, 8), 16);
  const linesRng = mulberry32(seed);

  const lines = [];
  byMatchup.forEach((pair, matchupId) => {
    if (pair.length !== 2) return;
    const [a, b] = pair;
    const distA = distByRoster.get(a.rosterId);
    const distB = distByRoster.get(b.rosterId);
    // Player-level asymmetric sim for win%. projection/spread/total below stay
    // the sum of player means, so displayed totals are unchanged.
    const winProbA = simulateMatchupWinProb(
      paramsByRoster.get(a.rosterId),
      paramsByRoster.get(b.rosterId),
      linesRng,
    );

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
        },
        [b.rosterId]: {
          ...lineFromDistributions(distB, distA, 1 - winProbA),
          unpricedStarters: distB.unpriced,
          zeroedStarters: distB.zeroed,
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
  const futures = simulateFutures({ league, teams, distByRoster, scheduleWeeks, week, distForWeek, seed });

  // ── the user's line for every scheduled week (Season tab schedule) ──
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
        note = 'Live line — your current lineup.';
      } else {
        // Future week: optimal lineup vs optimal lineup, player-level sim.
        const wp = simulateMatchupWinProb(my.params, opp.params, weeklyRng);
        moneyline = probToAmerican(wp);
        winProb = Number((wp * 100).toFixed(1));
        projection = Number(sumMeans(my.params).toFixed(1));
        opponentProjection = Number(sumMeans(opp.params).toFixed(1));
        note = 'Optimal lineups, simulated player-by-player.';
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
function computeDraftWrapped({ league, teams, draftPicks, projectionMap, distByRoster, scheduleWeeks, week, catalog }) {
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
    const opp = distByRoster.get(theirs.rosterId);
    const me = distByRoster.get(userTeam.rosterId);
    if (!opp || !me) continue;
    const winProb = normalCdf((me.mean - opp.mean) / Math.sqrt((me.sigma ** 2 + opp.sigma ** 2) || 1));
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

/**
 * Re-run the futures sim with the user's team mean shifted by delta.
 * Same seed as the baseline run: the only difference between before and
 * after is the roster change itself, never sim noise.
 */
function titleOddsWithUserDelta({ league, teams, distByRoster, scheduleWeeks, week, seed }, userRosterId, deltaMean) {
  const shifted = new Map(distByRoster);
  const base = distByRoster.get(userRosterId);
  if (base) {
    shifted.set(userRosterId, { ...base, mean: Math.max(1, base.mean + deltaMean) });
  }
  const futures = simulateFutures({ league, teams, distByRoster: shifted, scheduleWeeks, week, seed });
  return futures.find((f) => f.rosterId === userRosterId) ?? null;
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
    return [`Adds weekly points; slightly lowers your title odds.`];
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
function computeMovers(ctx) {
  const { league, teams, matchups, projections, projectionMap, distByRoster, scheduleWeeks, week, catalog, seed } = ctx;
  const userTeam = teams.find((t) => t.isUser);
  if (!userTeam) return [];
  // Redraft-value movers are misleading in dynasty/keeper, where youth and
  // picks carry the value Franco's weekly model doesn't price yet.
  if (league.leagueType && league.leagueType !== 'redraft') return [];

  const baseFutures = simulateFutures({ league, teams, distByRoster, scheduleWeeks, week, seed });
  const baseUser = baseFutures.find((f) => f.rosterId === userTeam.rosterId);
  if (!baseUser) return [];

  const slotLabels = (league.rosterPositions ?? []).filter((p) => !['BN', 'IR', 'TAXI'].includes(p));
  const userMatchup = matchups.find((m) => m.rosterId === userTeam.rosterId);
  const starters = userMatchup?.starters?.length ? userMatchup.starters : userTeam.starters;
  const rostered = new Set(teams.flatMap((t) => t.players));

  const movers = [];

  // 1) waiver / free-agent claim
  const starterMeans = starters.map((id, i) => ({
    id,
    slot: slotLabels[i] ?? 'FLEX',
    mean: projectionMap.get(id)?.mean ?? 0,
  }));
  let bestClaim = null;
  for (const candidate of projections) {
    if (rostered.has(candidate.playerId)) continue;
    if (!['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(candidate.position)) continue;
    // Never suggest dropping a real starter for a depth-chart backup. A QB2
    // who out-projects a QB1 in one slice is noise (he barely plays); Franco's
    // depth_rank is the truth source for that.
    if (candidate.depthRank != null && candidate.depthRank >= 2) continue;
    for (const starter of starterMeans) {
      const allowed = FLEX_ELIGIBILITY[starter.slot] ?? [starter.slot];
      if (!allowed.includes(candidate.position)) continue;
      const delta = candidate.mean - starter.mean;
      // a waiver claim has to be a real upgrade, not a rounding-error edge
      if (delta < 2) continue;
      if (!bestClaim || delta > bestClaim.delta) {
        bestClaim = { candidate, starter, delta };
      }
    }
  }
  if (bestClaim) {
    const after = titleOddsWithUserDelta(ctx, userTeam.rosterId, bestClaim.delta);
    movers.push({
      kind: 'waiver',
      headline: `Claim ${bestClaim.candidate.name} off waivers`,
      detail: `Upgrade over ${catalog[bestClaim.starter.id]?.name ?? 'your current starter'} at ${bestClaim.candidate.position}`,
      playerId: bestClaim.candidate.playerId,
      valueGain: Number(bestClaim.delta.toFixed(1)),
      titleOddsBefore: baseUser.championOdds,
      titleOddsAfter: noWorseThan(
        baseUser.championOdds,
        after?.championOdds ?? baseUser.championOdds,
      ),
    });
  }

  // 2) trade lanes: generate candidates, then let the existing trade pricer
  // decide whether the card is real enough to show.
  const benchOf = (team) => {
    const teamStarters = new Set(
      (matchups.find((m) => m.rosterId === team.rosterId)?.starters?.length
        ? matchups.find((m) => m.rosterId === team.rosterId).starters
        : team.starters),
    );
    return team.players.filter((id) => !teamStarters.has(id) && projectionMap.has(id));
  };

  const TRADEABLE = ['QB', 'RB', 'WR', 'TE'];
  const projected = (id) => projectionMap.get(id)?.mean ?? 0;
  const names = (ids) => ids.map((id) => catalog[id]?.name ?? `Player ${id}`).join(' + ');
  const volatilitySwapReason = (giveId, getId, opp) => {
    if (catalog[giveId]?.position !== catalog[getId]?.position) return null;
    const giveP = projectionMap.get(giveId);
    const getP = projectionMap.get(getId);
    if (!giveP || !getP) return null;
    const giveFloor = giveP.floor ?? Math.max(0, giveP.mean - giveP.stdev);
    const getFloor = getP.floor ?? Math.max(0, getP.mean - getP.stdev);
    const giveCeiling = giveP.ceiling ?? giveP.mean + giveP.stdev;
    const getCeiling = getP.ceiling ?? getP.mean + getP.stdev;
    const userMean = distByRoster.get(userTeam.rosterId)?.mean ?? 0;
    const oppMean = distByRoster.get(opp.rosterId)?.mean ?? 0;
    const userNeedsSwing = userMean + 2 < oppMean;
    const userNeedsSafety = userMean > oppMean + 2;
    const userGetsCeiling = getCeiling - giveCeiling >= 3 && giveFloor - getFloor >= 1.5;
    const userGetsFloor = giveCeiling - getCeiling >= 3 && getFloor - giveFloor >= 1.5;
    const getRange = getCeiling - getFloor;
    const giveRange = giveCeiling - giveFloor;

    if (userGetsCeiling && userNeedsSwing) {
      return `Ceiling for floor — ${catalog[getId]?.name ?? 'the incoming player'} widens your weekly range.`;
    }

    if (userGetsFloor && userNeedsSafety) {
      return `Floor for ceiling — ${catalog[getId]?.name ?? 'the incoming player'} steadies your weekly range.`;
    }

    if (getRange >= giveRange * 1.8 && userNeedsSwing) {
      return `Ceiling for floor — ${catalog[getId]?.name ?? 'the incoming player'} nearly doubles your weekly range.`;
    }

    return null;
  };
  const tradeableOf = (team) => {
    const starters = new Set(
      (matchups.find((m) => m.rosterId === team.rosterId)?.starters?.length
        ? matchups.find((m) => m.rosterId === team.rosterId).starters
        : team.starters),
    );
    return team.players
      .filter((id) => TRADEABLE.includes(catalog[id]?.position) && projectionMap.has(id))
      .sort((a, b) => {
        const starterDelta = Number(starters.has(a)) - Number(starters.has(b));
        return starterDelta || projected(b) - projected(a);
      })
      .slice(0, 12);
  };
  const pairsOf = (ids) => {
    const pairs = [];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) pairs.push([ids[i], ids[j]]);
    }
    return pairs.sort((a, b) => projected(b[0]) + projected(b[1]) - projected(a[0]) - projected(a[1]));
  };

  const strictLanes = [];
  const fallbackLanes = [];
  let lanePricesRemaining = LANE_PRICING_LIMIT_TOTAL;

  for (const opp of teams) {
    if (opp.rosterId === userTeam.rosterId) continue;
    if (lanePricesRemaining <= 0) break;
    const userSingles = tradeableOf(userTeam);
    const oppSingles = tradeableOf(opp);
    const userPairs = pairsOf(benchOf(userTeam).filter((id) => TRADEABLE.includes(catalog[id]?.position))).slice(0, 24);
    const oppPairs = pairsOf(benchOf(opp).filter((id) => TRADEABLE.includes(catalog[id]?.position))).slice(0, 24);
    const candidates = [];

    for (const giveId of userSingles) {
      for (const getId of oppSingles) {
        const ratio = projected(getId) > 0 ? projected(giveId) / projected(getId) : 1;
        const samePosition = catalog[giveId]?.position === catalog[getId]?.position;
        const volatilityReason = samePosition ? volatilitySwapReason(giveId, getId, opp) : null;
        if (samePosition && !volatilityReason) continue;
        if (ratio >= 0.45 && ratio <= 1.9) {
          candidates.push({ give: [giveId], get: [getId], volatilityReason });
        }
      }
    }
    for (const give of userPairs) {
      for (const getId of oppSingles.slice(0, 8)) {
        const ratio = projected(getId) > 0 ? (projected(give[0]) + projected(give[1])) / projected(getId) : 1;
        if (ratio >= 0.6 && ratio <= 2.2) candidates.push({ give, get: [getId] });
      }
    }
    for (const giveId of userSingles.slice(0, 8)) {
      for (const get of oppPairs) {
        const ratio = (projected(get[0]) + projected(get[1])) > 0
          ? projected(giveId) / (projected(get[0]) + projected(get[1]))
          : 1;
        if (ratio >= 0.45 && ratio <= 1.8) candidates.push({ give: [giveId], get });
      }
    }

    const seen = new Set();
    const scored = candidates
      .filter((candidate) => {
        const key = `${candidate.give.join(',')}|${candidate.get.join(',')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((candidate) => {
        const userPoolAfter = userTeam.players.filter((id) => !candidate.give.includes(id)).concat(candidate.get);
        const oppPoolAfter = opp.players.filter((id) => !candidate.get.includes(id)).concat(candidate.give);
        const youGain = computeStarterImpact(
          userTeam.players,
          userPoolAfter,
          slotLabels,
          projectionMap,
          catalog,
        ).delta;
        const themGain = computeStarterImpact(
          opp.players,
          oppPoolAfter,
          slotLabels,
          projectionMap,
          catalog,
        ).delta;
        const strict = youGain > 0 && starterImpactBand(themGain) === 'upgrade';
        const fallback = youGain > 0 && themGain >= -1;
        if (!strict && !fallback) return null;
        return { candidate, youGain, themGain, strict };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const strictDelta = Number(b.strict) - Number(a.strict);
        if (strictDelta !== 0) return strictDelta;
        const gainDelta = (b.youGain + b.themGain) - (a.youGain + a.themGain);
        if (gainDelta !== 0) return gainDelta;
        const aFairness = Math.abs(a.candidate.give.reduce((sum, id) => sum + projected(id), 0) - a.candidate.get.reduce((sum, id) => sum + projected(id), 0));
        const bFairness = Math.abs(b.candidate.give.reduce((sum, id) => sum + projected(id), 0) - b.candidate.get.reduce((sum, id) => sum + projected(id), 0));
        return aFairness - bFairness;
      })
      .slice(0, Math.min(LANE_PRICING_LIMIT_PER_OPPONENT, lanePricesRemaining));

    for (const { candidate } of scored) {
      lanePricesRemaining -= 1;
      const priced = priceTrade(ctx, {
        userRosterId: userTeam.rosterId,
        partnerRosterId: opp.rosterId,
        give: candidate.give,
        get: candidate.get,
        traits: { toughness: 5, dealAppetite: 5, fandomTeam: null, fandomLevel: 5 },
      });
      if (!priced.available || !priced.you || !priced.them) continue;

      const youGain = roundTradeDelta(priced.you.valueDelta ?? 0);
      const themGain = roundTradeDelta(priced.them.valueDelta ?? 0);
      const strict = youGain > 0 && starterImpactBand(themGain) === 'upgrade';
      const fallback =
        youGain > 0 &&
        themGain >= -0.5 &&
        priced.verdict !== 'Overpay' &&
        (priced.acceptance?.probability ?? 0) >= 30;
      if (!strict && !fallback) continue;

      const lane = {
        kind: 'trade',
        leagueId: String(league.id),
        headline: `${names(candidate.get)} for ${names(candidate.give)}`,
        detail: `Send ${names(candidate.give)}, get ${names(candidate.get)}`,
        givePlayerId: candidate.give[0],
        getPlayerId: candidate.get[0],
        givePlayerIds: candidate.give,
        getPlayerIds: candidate.get,
        partnerRosterId: opp.rosterId,
        partnerGain: themGain,
        valueGain: youGain,
        framing: strict ? 'both_upgrade' : 'near_fair_you_win',
        verdict: priced.verdict,
        valueGap: priced.valueGap,
        acceptanceProbability: priced.acceptance?.probability ?? null,
        acceptanceReasons: laneAcceptReasons({
          opp,
          give: candidate.give,
          get: candidate.get,
          priced: { ...priced, volatilityReason: candidate.volatilityReason },
          catalog,
          framing: strict ? 'both_upgrade' : 'near_fair_you_win',
        }),
        pricedAt: Date.now(),
        titleOddsBefore: priced.you.titleBefore,
        titleOddsAfter: priced.you.titleAfter,
        score:
          (strict ? 100 : 0) +
          youGain +
          themGain +
          Math.max(-10, Math.min(10, titleOddsDelta({
            titleOddsBefore: priced.you.titleBefore,
            titleOddsAfter: priced.you.titleAfter,
          }) * 100)),
      };
      if (!tradeLaneMatchesPricedResult(lane, priced)) continue;
      (strict ? strictLanes : fallbackLanes).push(lane);
    }
  }

  const bestPerOpponent = new Map();
  for (const lane of rankTradeLanes([...strictLanes, ...fallbackLanes])) {
    if (!bestPerOpponent.has(lane.partnerRosterId)) bestPerOpponent.set(lane.partnerRosterId, lane);
  }

  movers.push(
    ...rankTradeLanes([...bestPerOpponent.values()])
      .slice(0, 4)
      .map(({ score, acceptanceReasons = [], ...lane }, index) => ({
        ...lane,
        acceptanceReason:
          acceptanceReasons[index % Math.max(1, acceptanceReasons.length)] ??
          lane.acceptanceReason,
      })),
  );

  return movers;
}

function simulateFutures({ league, teams, distByRoster, scheduleWeeks, week, distForWeek = null, seed = 1 }) {
  const rng = mulberry32(seed);
  const regularWeeks = league.regularSeasonWeeks ?? 14;
  // Can't seat more playoff teams than exist — a small league clinches everyone.
  const playoffTeams = Math.min(league.playoffTeams ?? 6, teams.length);
  const remaining = (scheduleWeeks ?? []).filter(
    (w) => w.week >= week && w.week <= regularWeeks,
  );

  const rosterIds = teams.map((t) => t.rosterId);
  const strength = new Map(
    rosterIds.map((id) => [id, Math.max(1, distByRoster.get(id)?.mean ?? 1)]),
  );

  const playoffCounts = new Map(rosterIds.map((id) => [id, 0]));
  const finalsCounts = new Map(rosterIds.map((id) => [id, 0]));
  const titleCounts = new Map(rosterIds.map((id) => [id, 0]));
  const winSums = new Map(rosterIds.map((id) => [id, 0]));

  // Weighted draw (by strength) from a pool — the bracket stand-in.
  const drawByStrength = (pool) => {
    const total = pool.reduce((sum, id) => sum + strength.get(id), 0);
    let draw = rng() * total;
    for (const id of pool) {
      draw -= strength.get(id);
      if (draw <= 0) return id;
    }
    return pool[pool.length - 1];
  };

  for (let sim = 0; sim < FUTURES_SIMS; sim += 1) {
    const wins = new Map(teams.map((t) => [t.rosterId, t.record.wins]));
    const pf = new Map(teams.map((t) => [t.rosterId, t.pointsFor]));

    for (const weekEntry of remaining) {
      const byMatchup = new Map();
      weekEntry.matchups.forEach((m) => {
        if (m.matchupId == null) return;
        const list = byMatchup.get(m.matchupId) ?? [];
        list.push(m);
        byMatchup.set(m.matchupId, list);
      });

      byMatchup.forEach((pair) => {
        if (pair.length !== 2) return;
        const [a, b] = pair;
        const distA = distForWeek
          ? distForWeek(a.rosterId, weekEntry.week)
          : distByRoster.get(a.rosterId);
        const distB = distForWeek
          ? distForWeek(b.rosterId, weekEntry.week)
          : distByRoster.get(b.rosterId);
        if (!distA || !distB) return;
        const scoreA = Math.max(0, distA.mean + distA.sigma * gaussian(rng));
        const scoreB = Math.max(0, distB.mean + distB.sigma * gaussian(rng));
        pf.set(a.rosterId, (pf.get(a.rosterId) ?? 0) + scoreA);
        pf.set(b.rosterId, (pf.get(b.rosterId) ?? 0) + scoreB);
        wins.set(a.rosterId, (wins.get(a.rosterId) ?? 0) + (scoreA > scoreB ? 1 : 0));
        wins.set(b.rosterId, (wins.get(b.rosterId) ?? 0) + (scoreB > scoreA ? 1 : 0));
      });
    }

    rosterIds.forEach((id) => winSums.set(id, winSums.get(id) + (wins.get(id) ?? 0)));

    const standings = [...rosterIds].sort(
      (x, y) => (wins.get(y) - wins.get(x)) || (pf.get(y) - pf.get(x)),
    );
    const playoff = standings.slice(0, playoffTeams);
    playoff.forEach((id) => playoffCounts.set(id, playoffCounts.get(id) + 1));

    // Reach the final: draw two finalists by strength (no replacement). This
    // keeps the league's finals probabilities summing to exactly 2 of N — so
    // when only two teams make the final, they can't all be favorites.
    const finalist1 = drawByStrength(playoff);
    finalsCounts.set(finalist1, finalsCounts.get(finalist1) + 1);
    const rest = playoff.filter((id) => id !== finalist1);
    let champion = finalist1;
    if (rest.length > 0) {
      const finalist2 = drawByStrength(rest);
      finalsCounts.set(finalist2, finalsCounts.get(finalist2) + 1);
      // Championship game: the stronger finalist is favored.
      const s1 = strength.get(finalist1);
      const s2 = strength.get(finalist2);
      champion = rng() < s1 / (s1 + s2) ? finalist1 : finalist2;
    }
    titleCounts.set(champion, titleCounts.get(champion) + 1);
  }

  const totalGames = (league.regularSeasonWeeks ?? 14);

  return teams.map((t) => {
    const playoffProb = playoffCounts.get(t.rosterId) / FUTURES_SIMS;
    const finalsProb = finalsCounts.get(t.rosterId) / FUTURES_SIMS;
    const titleProb = titleCounts.get(t.rosterId) / FUTURES_SIMS;
    const projWins = Math.round(winSums.get(t.rosterId) / FUTURES_SIMS);
    const projLosses = Math.max(0, totalGames - projWins);

    return {
      rosterId: t.rosterId,
      projWins,
      projLosses,
      projRecord: `${projWins}-${projLosses}`,
      teamName: t.teamName,
      record: t.record,
      playoffProb: Number((playoffProb * 100).toFixed(1)),
      // Everyone makes a small league's playoffs — that's clinched, not a price.
      playoffClinched: playoffProb >= 0.999,
      playoffOdds: probToAmerican(playoffProb),
      finalsProb: Number((finalsProb * 100).toFixed(1)),
      finalsOdds: probToAmerican(finalsProb),
      titleProb: Number((titleProb * 100).toFixed(1)),
      championOdds: probToAmerican(titleProb),
      isUser: t.isUser,
    };
  });
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
export function priceTrade(ctx, { userRosterId, partnerRosterId, give = [], get = [], traits = {} }) {
  const active = getActiveProjections();
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

  const seed = parseInt(
    computeInputsHash({
      projectionVersion: active.version,
      teams,
      week,
      overlay: overlay ?? null,
    }).slice(0, 8),
    16,
  );

  // Trades are rest-of-season decisions, so value players by their season
  // mean (null week), NOT this week's projection. A guy projected a point
  // higher in Week 1 shouldn't sway a trade — that was the right call.
  const baseDist = new Map(
    teams.map((t) => [t.rosterId, bestLineupDistribution(t.players, slotLabels, projectionMap, catalog, null)]),
  );
  const currentStarterDist = new Map(
    teams.map((t) => [t.rosterId, teamDistribution(t.starters, projectionMap, catalog, week)]),
  );
  const weekDistCache = new Map();
  const distForWeek = (rosterId, w) => {
    const key = `${rosterId}|${w}`;
    let dist = weekDistCache.get(key);
    if (!dist) {
      dist = teamDistribution(
        teams.find((t) => t.rosterId === rosterId)?.starters ?? [],
        projectionMap,
        catalog,
        w,
      );
      weekDistCache.set(key, dist);
    }
    return dist;
  };

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
  const userAfter = userImpact.after;
  const partnerAfter = partnerImpact.after;

  const futuresBefore = simulateFutures({
    league,
    teams,
    distByRoster: currentStarterDist,
    scheduleWeeks,
    week,
    distForWeek,
    seed,
  });
  const afterDist = new Map(currentStarterDist);
  afterDist.set(userRosterId, userAfter);
  afterDist.set(partnerRosterId, partnerAfter);
  const futuresAfter = simulateFutures({ league, teams, distByRoster: afterDist, scheduleWeeks, week, seed });

  const find = (futures, rosterId) => futures.find((f) => f.rosterId === rosterId);
  const yourBefore = find(futuresBefore, userRosterId);
  const yourAfter = find(futuresAfter, userRosterId);
  const theirBefore = find(futuresBefore, partnerRosterId);
  const theirAfter = find(futuresAfter, partnerRosterId);

  const yourValueDelta = userImpact.delta;
  const theirValueDelta = partnerImpact.delta;

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
    reasons.push(`It leaves them with no ${partnerHole} to start — they'd need one back in the deal.`);
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
  const titleGain = (yourAfter?.titleProb ?? 0) - (yourBefore?.titleProb ?? 0);
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
      titleAfter: yourAfter?.championOdds ?? 0,
      titleProbBefore: yourBefore?.titleProb ?? 0,
      titleProbAfter: yourAfter?.titleProb ?? 0,
      valueDelta: yourValueDelta,
      depthBefore,
      depthAfter,
    },
    them: {
      teamName: partner.teamName,
      titleBefore: theirBefore?.championOdds ?? 0,
      titleAfter: theirAfter?.championOdds ?? 0,
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
