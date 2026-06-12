/**
 * Olympus pricing engine (server-side).
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
  return p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

function gaussian() {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function playerDistribution(playerId, projectionMap, catalogEntry) {
  const projection = projectionMap.get(playerId);

  // OUT/IR starters cost projection zero (surfaced via flags).
  const status = (catalogEntry?.injuryStatus ?? '').toLowerCase();
  if (status === 'out' || status === 'ir' || catalogEntry?.status === 'Inactive') {
    return { mean: 0, stdev: 0, unpriced: false, zeroed: true };
  }

  if (!projection) {
    return { mean: 0, stdev: 0, unpriced: true, zeroed: false };
  }

  return { mean: projection.mean, stdev: projection.stdev, unpriced: false, zeroed: false };
}

function teamDistribution(starterIds, projectionMap, catalog) {
  let mean = 0;
  let variance = 0;
  const unpriced = [];
  const zeroed = [];

  for (const id of starterIds) {
    const dist = playerDistribution(id, projectionMap, catalog[id]);
    mean += dist.mean;
    variance += dist.stdev * dist.stdev;
    if (dist.unpriced) unpriced.push(id);
    if (dist.zeroed) zeroed.push(id);
  }

  return { mean, sigma: Math.sqrt(variance), unpriced, zeroed };
}

/** 10k-sim win probability between two team distributions. */
function simulateWinProb(a, b) {
  let wins = 0;
  for (let i = 0; i < SIMS; i += 1) {
    const scoreA = Math.max(0, a.mean + a.sigma * gaussian());
    const scoreB = Math.max(0, b.mean + b.sigma * gaussian());
    if (scoreA > scoreB) wins += 1;
    else if (scoreA === scoreB) wins += 0.5;
  }
  return wins / SIMS;
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

export function computeInputsHash({ projectionVersion, teams, week }) {
  const payload = JSON.stringify({
    projectionVersion,
    week,
    starters: teams.map((t) => [t.rosterId, t.starters]),
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

/**
 * Price one league: matchup lines, user swap deltas, season futures.
 * @param {object} ctx { league, teams, matchups, week, catalog, scheduleWeeks }
 */
export function priceLeague(ctx) {
  const active = getActiveProjections();

  if (!active) {
    return { available: false, reason: 'no_projections' };
  }

  const projectionMap = new Map(active.projections.map((p) => [p.playerId, p]));
  const { league, teams, matchups, week, catalog, scheduleWeeks } = ctx;

  const inputsHash = computeInputsHash({
    projectionVersion: active.version,
    teams,
    week,
  });

  // ── matchup lines ──
  const teamsByRoster = new Map(teams.map((t) => [t.rosterId, t]));
  const distByRoster = new Map(
    teams.map((t) => [t.rosterId, teamDistribution(t.starters, projectionMap, catalog)]),
  );

  const byMatchup = new Map();
  matchups.forEach((m) => {
    if (m.matchupId == null) return;
    const list = byMatchup.get(m.matchupId) ?? [];
    list.push(m);
    byMatchup.set(m.matchupId, list);
  });

  const lines = [];
  byMatchup.forEach((pair, matchupId) => {
    if (pair.length !== 2) return;
    const [a, b] = pair;
    const distA = distByRoster.get(a.rosterId);
    const distB = distByRoster.get(b.rosterId);
    const winProbA = simulateWinProb(distA, distB);

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
    const slotLabels = (league.rosterPositions ?? []).filter(
      (p) => !['BN', 'IR', 'TAXI'].includes(p),
    );
    const userMatchup = matchups.find((m) => m.rosterId === userTeam.rosterId);
    const oppMatchup = userMatchup
      ? matchups.find(
          (m) => m.matchupId === userMatchup.matchupId && m.rosterId !== userTeam.rosterId,
        )
      : null;

    if (userMatchup && oppMatchup) {
      const baseDist = distByRoster.get(userTeam.rosterId);
      const oppDist = distByRoster.get(oppMatchup.rosterId);
      const baseWinProb = normalCdf(
        (baseDist.mean - oppDist.mean) /
          Math.sqrt(baseDist.sigma ** 2 + oppDist.sigma ** 2 || 1),
      );
      const bench = userTeam.players.filter((id) => !userMatchup.starters.includes(id));

      userMatchup.starters.forEach((starterId, slotIndex) => {
        const slotLabel = slotLabels[slotIndex] ?? 'FLEX';
        const starterDist = playerDistribution(starterId, projectionMap, catalog[starterId]);

        bench.forEach((benchId) => {
          const benchPosition = catalog[benchId]?.position;
          if (!benchPosition || !slotAllows(slotLabel, benchPosition)) return; // illegal swap: impossible by construction

          const benchDist = playerDistribution(benchId, projectionMap, catalog[benchId]);
          if (benchDist.unpriced && starterDist.unpriced) return;

          const newMean = baseDist.mean - starterDist.mean + benchDist.mean;
          const newVar =
            baseDist.sigma ** 2 - starterDist.stdev ** 2 + benchDist.stdev ** 2;
          const newWinProb = normalCdf(
            (newMean - oppDist.mean) / Math.sqrt(Math.max(1, newVar + oppDist.sigma ** 2)),
          );

          userSwaps.push({
            slotIndex,
            slotLabel,
            starterId,
            benchId,
            starterMean: Number(starterDist.mean.toFixed(1)),
            benchMean: Number(benchDist.mean.toFixed(1)),
            deltaWinProb: Number(((newWinProb - baseWinProb) * 100).toFixed(1)),
            resultingWinProb: Number((newWinProb * 100).toFixed(1)),
            resultingMoneyline: probToAmerican(newWinProb),
            resultingProjection: Number(newMean.toFixed(1)),
          });
        });
      });
    }

    playerMeans = Object.fromEntries(
      userTeam.players.map((id) => {
        const dist = playerDistribution(id, projectionMap, catalog[id]);
        return [id, { mean: Number(dist.mean.toFixed(1)), stdev: Number(dist.stdev.toFixed(1)), unpriced: dist.unpriced, zeroed: dist.zeroed, derived: projectionMap.get(id)?.derived ?? false }];
      }),
    );
  }

  // ── season futures: simulate the remaining schedule ──
  const futures = simulateFutures({ league, teams, distByRoster, scheduleWeeks, week });

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

  // ── off-season market movers: real FA claim + trade lane, priced ──
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
    draftWrapped,
    movers,
  };
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

/** Re-run the futures sim with the user's team mean shifted by delta. */
function titleOddsWithUserDelta({ league, teams, distByRoster, scheduleWeeks, week }, userRosterId, deltaMean) {
  const shifted = new Map(distByRoster);
  const base = distByRoster.get(userRosterId);
  if (base) {
    shifted.set(userRosterId, { ...base, mean: Math.max(1, base.mean + deltaMean) });
  }
  const futures = simulateFutures({ league, teams, distByRoster: shifted, scheduleWeeks, week });
  return futures.find((f) => f.rosterId === userRosterId) ?? null;
}

/**
 * Off-season market movers, priced in title-odds movement:
 *  1. best free-agent claim that upgrades a user starter slot
 *  2. best mutually-positive 1-for-1 trade lane against a real roster
 */
function computeMovers(ctx) {
  const { league, teams, matchups, projections, projectionMap, distByRoster, scheduleWeeks, week, catalog } = ctx;
  const userTeam = teams.find((t) => t.isUser);
  if (!userTeam) return [];

  const baseFutures = simulateFutures({ league, teams, distByRoster, scheduleWeeks, week });
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
    for (const starter of starterMeans) {
      const allowed = FLEX_ELIGIBILITY[starter.slot] ?? [starter.slot];
      if (!allowed.includes(candidate.position)) continue;
      const delta = candidate.mean - starter.mean;
      if (delta <= 0.5) continue;
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
      detail: `Slots ${bestClaim.candidate.position}, +${bestClaim.delta.toFixed(1)} proj over ${catalog[bestClaim.starter.id]?.name ?? 'current starter'}`,
      playerId: bestClaim.candidate.playerId,
      titleOddsBefore: baseUser.championOdds,
      titleOddsAfter: after?.championOdds ?? baseUser.championOdds,
    });
  }

  // 2) mutual-need 1-for-1 trade lane
  const benchOf = (team) => {
    const teamStarters = new Set(
      (matchups.find((m) => m.rosterId === team.rosterId)?.starters?.length
        ? matchups.find((m) => m.rosterId === team.rosterId).starters
        : team.starters),
    );
    return team.players.filter((id) => !teamStarters.has(id) && projectionMap.has(id));
  };
  const startersOf = (team) => {
    const ids = matchups.find((m) => m.rosterId === team.rosterId)?.starters?.length
      ? matchups.find((m) => m.rosterId === team.rosterId).starters
      : team.starters;
    return ids.map((id, i) => ({ id, slot: slotLabels[i] ?? 'FLEX', mean: projectionMap.get(id)?.mean ?? 0 }));
  };

  const userBench = benchOf(userTeam);
  const userStarters = startersOf(userTeam);
  let bestTrade = null;

  for (const opp of teams) {
    if (opp.rosterId === userTeam.rosterId) continue;
    const oppBench = benchOf(opp);
    const oppStarters = startersOf(opp);

    for (const giveId of userBench) {
      const give = projectionMap.get(giveId);
      const oppWeakest = oppStarters
        .filter((st) => (FLEX_ELIGIBILITY[st.slot] ?? [st.slot]).includes(give.position))
        .sort((a, b) => a.mean - b.mean)[0];
      const oppGain = oppWeakest ? give.mean - oppWeakest.mean : -1;
      if (oppGain <= 0.5) continue;

      for (const getId of oppBench) {
        const get = projectionMap.get(getId);
        const userWeakest = userStarters
          .filter((st) => (FLEX_ELIGIBILITY[st.slot] ?? [st.slot]).includes(get.position))
          .sort((a, b) => a.mean - b.mean)[0];
        const userGain = userWeakest ? get.mean - userWeakest.mean : -1;
        if (userGain <= 0.5) continue;

        const score = userGain + oppGain;
        if (!bestTrade || score > bestTrade.score) {
          bestTrade = { opp, give, get, userGain, oppGain, score };
        }
      }
    }
  }

  if (bestTrade) {
    const after = titleOddsWithUserDelta(ctx, userTeam.rosterId, bestTrade.userGain);
    movers.push({
      kind: 'trade',
      headline: `Trade lane: ${bestTrade.opp.teamName} want ${bestTrade.give.position}`,
      detail: `${bestTrade.give.name} for ${bestTrade.get.name} prices at`,
      titleOddsBefore: baseUser.championOdds,
      titleOddsAfter: after?.championOdds ?? baseUser.championOdds,
    });
  }

  return movers;
}

function simulateFutures({ league, teams, distByRoster, scheduleWeeks, week }) {
  const regularWeeks = league.regularSeasonWeeks ?? 14;
  const playoffTeams = league.playoffTeams ?? 6;
  const remaining = (scheduleWeeks ?? []).filter(
    (w) => w.week >= week && w.week <= regularWeeks,
  );

  const rosterIds = teams.map((t) => t.rosterId);
  const strength = new Map(
    rosterIds.map((id) => [id, Math.max(1, distByRoster.get(id)?.mean ?? 1)]),
  );

  const playoffCounts = new Map(rosterIds.map((id) => [id, 0]));
  const titleCounts = new Map(rosterIds.map((id) => [id, 0]));
  const winSums = new Map(rosterIds.map((id) => [id, 0]));

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
        const distA = distByRoster.get(a.rosterId);
        const distB = distByRoster.get(b.rosterId);
        if (!distA || !distB) return;
        const scoreA = Math.max(0, distA.mean + distA.sigma * gaussian());
        const scoreB = Math.max(0, distB.mean + distB.sigma * gaussian());
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

    // Title within the sim: strength-share draw among playoff teams.
    const totalStrength = playoff.reduce((sum, id) => sum + strength.get(id), 0);
    let draw = Math.random() * totalStrength;
    for (const id of playoff) {
      draw -= strength.get(id);
      if (draw <= 0) {
        titleCounts.set(id, titleCounts.get(id) + 1);
        break;
      }
    }
  }

  const totalGames = (league.regularSeasonWeeks ?? 14);

  return teams.map((t) => {
    const playoffProb = playoffCounts.get(t.rosterId) / FUTURES_SIMS;
    const titleProb = Math.max(0.005, titleCounts.get(t.rosterId) / FUTURES_SIMS);
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
      playoffOdds: probToAmerican(playoffProb),
      titleProb: Number((titleProb * 100).toFixed(1)),
      championOdds: probToAmerican(titleProb),
      finalsOdds: probToAmerican(Math.min(0.92, titleProb * 2.2)),
      isUser: t.isUser,
    };
  });
}

/** Cached league pricing keyed by the league id; recomputes when inputs change. */
export async function getLeaguePricing(ctxLoader, leagueId) {
  return cached(`pricing:${leagueId}`, 60_000, async () => {
    const ctx = await ctxLoader();
    return priceLeague(ctx);
  });
}
