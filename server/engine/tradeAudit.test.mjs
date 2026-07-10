/**
 * Trade-analyzer correctness audit. Builds a synthetic 4-team league and runs
 * the REAL analyzeTrade / simulateSeason, asserting invariants that MUST hold if
 * the logic is sound. Run: `node server/engine/tradeAudit.test.mjs`
 *
 * The critical one is P1: an empty trade must produce EXACTLY zero deltas for
 * every team (proves common-random-numbers cancels sim noise).
 */
import { analyzeTrade, simulateSeason, computeInputsHash } from './engine.js';

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'];
const ROSTER_POSITIONS = [...SLOTS, 'BN', 'BN'];
const REG_WEEKS = 14;

// ---- Build players -------------------------------------------------------
const catalog = {};
const projections = [];
let uid = 0;
function P(position, ppg) {
  const id = `p${uid++}`;
  catalog[id] = { position, name: `${position}${id}` };
  projections.push({ playerId: id, mean: ppg, stdev: ppg * 0.35, weekly: {}, weeklyCI: {} });
  return id;
}

// Four teams, 12 players each. Team strength decreasing T1>T2>T3>T4 via a scale.
function buildTeam(rosterId, teamName, isUser, scale) {
  const players = [
    P('QB', 20 * scale),
    P('RB', 18 * scale), P('RB', 14 * scale), P('RB', 8 * scale),
    P('WR', 17 * scale), P('WR', 13 * scale), P('WR', 9 * scale),
    P('TE', 11 * scale), P('TE', 5 * scale),
    P('K', 9 * scale),
    P('DEF', 8 * scale),
    P('WR', 7 * scale),
  ];
  // starters = first 10 by our construction (roughly optimal); only used for the seed hash.
  return {
    rosterId, teamName, isUser,
    players,
    starters: players.slice(0, 10),
    record: { wins: 0, losses: 0, ties: 0 },
    pointsFor: 0, pointsAgainst: 0,
  };
}

const teams = [
  buildTeam(1, 'You', true, 1.05),
  buildTeam(2, 'Rival', false, 1.0),
  buildTeam(3, 'Mid', false, 0.9),
  buildTeam(4, 'Basement', false, 0.8),
];

// ---- Schedule: 14 weeks, 2 matchups/week, rotate the 3 perfect matchings ---
const MATCHINGS = [
  [[1, 2], [3, 4]],
  [[1, 3], [2, 4]],
  [[1, 4], [2, 3]],
];
const scheduleWeeks = [];
for (let w = 1; w <= REG_WEEKS; w += 1) {
  const m = MATCHINGS[w % 3];
  const matchups = [];
  m.forEach((pair, pi) => {
    const matchupId = w * 10 + pi;
    pair.forEach((rid) => matchups.push({ rosterId: rid, matchupId, starters: [] }));
  });
  scheduleWeeks.push({ week: w, matchups });
}

function makeCtx(playoffTeams) {
  return {
    league: {
      rosterPositions: ROSTER_POSITIONS,
      regularSeasonWeeks: REG_WEEKS,
      playoffWeekStart: REG_WEEKS + 1,
      playoffTeams,
    },
    teams,
    week: 1,
    catalog,
    scheduleWeeks,
    overlay: null,
    projections: { version: 'audit-v1', projections },
  };
}

// ---- Assertions ----------------------------------------------------------
let failures = 0;
function check(name, pass, detail = '') {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) failures += 1;
}
const approx = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;

// ===== P0: whole-league sim invariants (simulateSeason directly) ==========
{
  const ctx = makeCtx(2); // top-2 make playoffs -> real seeding/bracket test
  const seed = parseInt(computeInputsHash({ projectionVersion: 'audit-v1', teams, week: 1, overlay: null }).slice(0, 8), 16);
  const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
  const res = simulateSeason({
    league: ctx.league, teams, scheduleWeeks, week: 1, projectionMap, catalog, slotLabels: SLOTS, seed,
  });
  const sum = (f) => res.reduce((a, r) => a + f(r), 0);
  check('P0a champions sum to ~100%', approx(sum((r) => r.titleProb), 100), `(got ${sum((r) => r.titleProb).toFixed(1)})`);
  check('P0b playoff prob sums to ~200% (2 slots)', approx(sum((r) => r.playoffProb), 200, 1.0), `(got ${sum((r) => r.playoffProb).toFixed(1)})`);
  check('P0c avg seeds sum to 10 (1+2+3+4)', approx(sum((r) => r.avgSeed), 10, 0.2), `(got ${sum((r) => r.avgSeed).toFixed(2)})`);
  check('P0d every titleProb in [0,100]', res.every((r) => r.titleProb >= 0 && r.titleProb <= 100));
  check('P0e stronger team (You) has higher title% than Basement', res.find((r) => r.rosterId === 1).titleProb > res.find((r) => r.rosterId === 4).titleProb,
    `(You ${res.find((r) => r.rosterId === 1).titleProb}% vs Basement ${res.find((r) => r.rosterId === 4).titleProb}%)`);
  check('P0f expWins <= regular weeks', res.every((r) => r.expWins <= REG_WEEKS + 0.01));
}

// ===== P1: EMPTY TRADE -> EXACTLY ZERO DELTAS (the CRN proof) ==============
{
  const r = analyzeTrade(makeCtx(2), { partnerRosterId: 2, give: [], get: [] });
  const zero = (d) => d.titleProb === 0 && d.playoffProb === 0 && d.avgSeed === 0 && d.expWins === 0;
  check('P1 empty trade -> you delta exactly 0', r.available && zero(r.you.delta), JSON.stringify(r.you.delta));
  check('P1 empty trade -> partner delta exactly 0', r.available && zero(r.partner.delta), JSON.stringify(r.partner.delta));
}

// ===== P2: determinism -> two identical calls give identical output ========
{
  const a = analyzeTrade(makeCtx(2), { partnerRosterId: 2, give: [teams[0].players[3]], get: [teams[1].players[3]] });
  const b = analyzeTrade(makeCtx(2), { partnerRosterId: 2, give: [teams[0].players[3]], get: [teams[1].players[3]] });
  check('P2 deterministic (same inputs -> same deltas)',
    JSON.stringify(a.you.delta) === JSON.stringify(b.you.delta) && JSON.stringify(a.partner.delta) === JSON.stringify(b.partner.delta));
}

// ===== P3: FAVORABLE trade -> you gain, partner loses =====================
// You give your worst RB (8*1.05=8.4) and get Rival's BEST RB (18*1.0=18).
{
  const myWorstRb = teams[0].players[3];   // RB 8.4
  const theirBestRb = teams[1].players[1]; // RB 18
  const r = analyzeTrade(makeCtx(2), { partnerRosterId: 2, give: [myWorstRb], get: [theirBestRb] });
  check('P3a you gain expected wins', r.you.delta.expWins > 0, `(Δ expWins ${r.you.delta.expWins})`);
  check('P3b you gain/keep title%', r.you.delta.titleProb >= 0, `(Δ title ${r.you.delta.titleProb})`);
  check('P3c partner loses expected wins', r.partner.delta.expWins < 0, `(Δ expWins ${r.partner.delta.expWins})`);
  check('P3d partner loses title%', r.partner.delta.titleProb <= 0, `(Δ title ${r.partner.delta.titleProb})`);
}

// ===== P4: UNFAVORABLE trade -> you lose ==================================
{
  const myBestRb = teams[0].players[1];    // RB 18.9
  const theirWorstRb = teams[1].players[3]; // RB 8
  const r = analyzeTrade(makeCtx(2), { partnerRosterId: 2, give: [myBestRb], get: [theirWorstRb] });
  check('P4a you lose expected wins', r.you.delta.expWins < 0, `(Δ expWins ${r.you.delta.expWins})`);
  check('P4b you lose title%', r.you.delta.titleProb <= 0, `(Δ title ${r.you.delta.titleProb})`);
}

// ===== P5: symmetry -> giving X for Y is the mirror of giving Y for X ======
{
  const x = teams[0].players[1]; // your RB 18.9
  const y = teams[1].players[1]; // their RB 18
  const fwd = analyzeTrade(makeCtx(2), { partnerRosterId: 2, give: [x], get: [y] });
  // From the partner's seat: they give y, get x. Their you-delta should equal fwd.partner delta.
  check('P5 both sides accounted (you gain <-> partner loses roughly mirror on expWins)',
    Math.sign(fwd.you.delta.expWins) === -Math.sign(fwd.partner.delta.expWins) || (fwd.you.delta.expWins === 0 && fwd.partner.delta.expWins === 0),
    `(you ${fwd.you.delta.expWins}, partner ${fwd.partner.delta.expWins})`);
}

// ===== P6: uneven 2-for-1 -> drop chosen, lineup still legal ===============
{
  const give1 = teams[0].players[3]; // RB 8.4
  const get2 = [teams[1].players[1], teams[1].players[4]]; // their best RB + best WR
  const r = analyzeTrade(makeCtx(2), { partnerRosterId: 2, give: [give1], get: get2 });
  check('P6a 2-for-1 needs exactly 1 drop from you', r.dropsNeeded.you === 1, `(needed ${r.dropsNeeded.you})`);
  check('P6b your suggested drop is a real player, not one you gave away', r.drops.you.length === 1 && r.drops.you[0].playerId !== give1);
  check('P6c strong 2-for-1 improves your title%', r.you.delta.titleProb >= 0, `(Δ title ${r.you.delta.titleProb})`);
  check('P6d no infeasible-lineup warning', r.warnings.you == null);
}

// ===== P7: NO current-week double-count (the finding-4 fix) ===============
// Season fully scored (lastScoredWeek = regularWeeks) while displayWeek still
// points at the final week. `remaining` must be EMPTY, so expWins equals each
// team's actual record.wins EXACTLY — no phantom re-sim of an already-counted
// week. The OLD `w.week >= week` filter would re-simulate week 14 here.
{
  const finals = [
    { rosterId: 1, wins: 10 }, { rosterId: 2, wins: 9 },
    { rosterId: 3, wins: 6 }, { rosterId: 4, wins: 3 },
  ];
  const scoredTeams = teams.map((t, i) => ({
    ...t,
    record: { wins: finals[i].wins, losses: REG_WEEKS - finals[i].wins, ties: 0 },
    pointsFor: 1500 - i * 100,
  }));
  const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
  const res = simulateSeason({
    league: {
      rosterPositions: ROSTER_POSITIONS, regularSeasonWeeks: REG_WEEKS,
      playoffWeekStart: REG_WEEKS + 1, playoffTeams: 2, lastScoredWeek: REG_WEEKS,
    },
    teams: scoredTeams, scheduleWeeks, week: REG_WEEKS,
    projectionMap, catalog, slotLabels: SLOTS, seed: 123,
  });
  const byId = (id) => res.find((r) => r.rosterId === id);
  check('P7a season fully scored -> expWins == record.wins exactly (no phantom week)',
    finals.every((f) => byId(f.rosterId).expWins === f.wins),
    `(got ${res.map((r) => r.expWins).join(',')})`);
  check('P7b season fully scored -> top-2 records make playoffs (100/0)',
    byId(1).playoffProb === 100 && byId(2).playoffProb === 100 && byId(3).playoffProb === 0 && byId(4).playoffProb === 0);
}

// ===== P8: mid-season -> only unplayed weeks simulated =====================
// 5 weeks scored: expWins must be record.wins + something in [0, unplayed].
{
  const scoredTeams = teams.map((t, i) => ({
    ...t,
    record: { wins: [4, 3, 2, 1][i], losses: [1, 2, 3, 4][i], ties: 0 },
    pointsFor: 600 - i * 40,
  }));
  const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
  const res = simulateSeason({
    league: {
      rosterPositions: ROSTER_POSITIONS, regularSeasonWeeks: REG_WEEKS,
      playoffWeekStart: REG_WEEKS + 1, playoffTeams: 2, lastScoredWeek: 5,
    },
    teams: scoredTeams, scheduleWeeks, week: 6,
    projectionMap, catalog, slotLabels: SLOTS, seed: 7,
  });
  const unplayed = REG_WEEKS - 5;
  const base = [4, 3, 2, 1];
  check('P8 mid-season expWins in [record.wins, record.wins + unplayed]',
    res.every((r, i) => r.expWins >= base[i] - 0.01 && r.expWins <= base[i] + unplayed + 0.01),
    `(got ${res.map((r) => r.expWins).join(',')}, played 5, unplayed ${unplayed})`);
}

console.log(`\n${failures === 0 ? 'ALL INVARIANTS HOLD' : failures + ' INVARIANT(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
