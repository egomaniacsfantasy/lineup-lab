/**
 * The current week must be simulated on ACTUAL banked points for already-played players
 * (zero variance) plus normal projection variance for who's left -- independent of the
 * live scoreboard. Reproduces the real bug: down ~80 with only a DEF left, the Hub showed
 * a 69.8% win because played players' trimmed rows scored 0 instead of their real points.
 * Run: `node server/engine/currentWeekPin.test.mjs`
 */
import { pinPlayedCurrentWeek, simulateSeason, teamDistribution, computeInputsHash } from './engine.js';

let failures = 0;
const check = (name, pass, detail = '') => { console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`); if (!pass) failures += 1; };

const catalog = {}; const projections = [];
// played=true => weeks 2..18 in the grid (current-week row trimmed, like a finished game)
function mk(id, pos, ppg, played) {
  catalog[id] = { position: pos, name: id };
  const weekly = {}; const weeklyCI = {};
  for (let w = played ? 2 : 1; w <= 18; w += 1) { weekly[String(w)] = ppg; weeklyCI[String(w)] = { floor: ppg * 0.6, ceiling: ppg * 1.4 }; }
  projections.push({ playerId: id, position: pos, mean: ppg, stdev: ppg * 0.4, weekly, weeklyCI });
  return id;
}

// User: 7 finished players (~11 proj each) + a DEF still to play. Opponent: 8 finished players.
const userPlayed = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'].map((id) => mk(id, 'WR', 11, true));
const userDef = mk('uDEF', 'DEF', 5.8, false); // Broncos: Monday night, not yet played
const oppPlayed = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8'].map((id) => mk(id, 'WR', 20, true));

const userStarters = [...userPlayed, userDef];
const oppStarters = [...oppPlayed];

// ACTUAL current-week points from the league feed: user banked ~77, opponent ~158.
const ACTUAL = {};
userPlayed.forEach((id) => { ACTUAL[id] = 11; });   // 7 * 11 = 77
oppPlayed.forEach((id) => { ACTUAL[id] = 19.75; });  // 8 * 19.75 = 158
const matchups = [
  { rosterId: 1, matchupId: 1, playersPoints: Object.fromEntries(userPlayed.map((id) => [id, ACTUAL[id]])) },
  { rosterId: 2, matchupId: 1, playersPoints: Object.fromEntries(oppPlayed.map((id) => [id, ACTUAL[id]])) },
];

const pmap = new Map(projections.map((p) => [p.playerId, p]));

// ---- BEFORE the pin: the bug -- played players score 0, user looks favored ----
{
  const u = teamDistribution(userStarters, pmap, catalog, 1);
  const o = teamDistribution(oppStarters, pmap, catalog, 1);
  check('BUG REPRO: without pin user current-week mean is just the DEF (~5.8)', Math.abs(u.mean - 5.8) < 0.5, `(user ${u.mean.toFixed(1)})`);
  check('BUG REPRO: without pin opponent current-week mean is 0 (all trimmed)', o.mean === 0, `(opp ${o.mean})`);
}

// ---- APPLY the pin ----
pinPlayedCurrentWeek(pmap, matchups, 1);

// ---- AFTER the pin: reality ----
{
  const u = teamDistribution(userStarters, pmap, catalog, 1);
  const o = teamDistribution(oppStarters, pmap, catalog, 1);
  check('user current-week mean = banked 77 + DEF 5.8 (~82.8)', Math.abs(u.mean - 82.8) < 0.6, `(user ${u.mean.toFixed(1)})`);
  check('opponent current-week mean = banked ~158', Math.abs(o.mean - 158) < 0.6, `(opp ${o.mean.toFixed(1)})`);
  // Only the DEF (yet to play) carries variance; the 7 finished players are locked.
  const uPlayedOnly = teamDistribution(userPlayed, pmap, catalog, 1);
  check('finished players contribute ZERO variance (locked)', uPlayedOnly.sigma === 0, `(sigma ${uPlayedOnly.sigma})`);
  check('team still has SOME variance from the unplayed DEF', u.sigma > 0, `(sigma ${u.sigma.toFixed(2)})`);
  // Future weeks keep full variance (not flattened).
  const uFut = teamDistribution(userPlayed, pmap, catalog, 5);
  check('finished players keep FULL variance in future weeks', uFut.sigma > 0, `(wk5 sigma ${uFut.sigma.toFixed(2)})`);
}

// ---- End-to-end: the season sim's current-week win% must be ~0, not ~70% ----
{
  const REG = 3;
  const scheduleWeeks = [];
  for (let w = 1; w <= REG; w += 1) scheduleWeeks.push({ week: w, matchups: [{ rosterId: 1, matchupId: 1 }, { rosterId: 2, matchupId: 1 }] });
  const teams = [
    { rosterId: 1, teamName: 'You', isUser: true, players: userStarters, starters: userStarters, record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0, pointsAgainst: 0 },
    { rosterId: 2, teamName: 'Crusher', isUser: false, players: oppStarters, starters: oppStarters, record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0, pointsAgainst: 0 },
  ];
  const seed = parseInt(computeInputsHash({ projectionVersion: 'cwp', teams, week: 1, overlay: null }).slice(0, 8), 16);
  const league = { rosterPositions: [...userStarters.map(() => 'FLEX')], regularSeasonWeeks: REG, playoffWeekStart: REG + 1, playoffTeams: 2, lastScoredWeek: 0 };
  const res = simulateSeason({ league, teams, scheduleWeeks, week: 1, projectionMap: pmap, catalog, slotLabels: userStarters.map(() => 'FLEX'), seed });
  const you = res.find((r) => r.rosterId === 1);
  check('season sim: your current-week win% is ~0 (down ~75 with a DEF left)', you.weekWinProb < 2, `(weekWinProb ${you.weekWinProb}%)`);
}

console.log(`\n${failures === 0 ? 'ALL CURRENT-WEEK PIN INVARIANTS HOLD' : failures + ' INVARIANT(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
