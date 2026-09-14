/**
 * Week-alignment correctness for mid-week trades. When one player in a deal has
 * already played his current-week game (his current-week row is trimmed from the
 * grid) and another has not, the trade cannot process until next week, so BOTH
 * sides must be valued from the same week (target_start). This test builds real
 * per-week grids and asserts the fix holds. Run: `node server/engine/tradeWeekAlign.test.mjs`
 */
import { analyzeTrade, priceTrade, tradeEffectiveWeek, seasonTotalFrom } from './engine.js';

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'];
const ROSTER_POSITIONS = [...SLOTS, 'BN', 'BN'];
const REG_WEEKS = 14;

const catalog = {};
const projections = [];
let uid = 0;

// Build a player with a FLAT per-week grid. played=true drops week 1 (his team's
// week-1 game is done, so the pipeline trimmed that row); played=false keeps weeks 1..18.
function P(position, ppg, played = false) {
  const id = `p${uid++}`;
  catalog[id] = { position, name: `${position}${id}` };
  const weekly = {};
  const weeklyCI = {};
  for (let w = played ? 2 : 1; w <= 18; w += 1) {
    weekly[String(w)] = ppg;
    weeklyCI[String(w)] = { floor: ppg * 0.7, ceiling: ppg * 1.3 };
  }
  const seasonTotal = Object.values(weekly).reduce((s, v) => s + v, 0);
  projections.push({ playerId: id, position, mean: ppg, stdev: ppg * 0.35, weekly, weeklyCI, seasonTotal });
  return id;
}

// Two mirror-image contenders + two filler teams. You (T1) hold a PLAYED WR stud;
// Rival (T2) holds an UNPLAYED WR stud with identical weeks 2..18. Everything else mirrors.
function fillers(scale) {
  return [
    P('QB', 20 * scale), P('RB', 16 * scale), P('RB', 12 * scale),
    P('WR', 12 * scale), P('TE', 9 * scale), P('K', 8 * scale),
    P('DEF', 8 * scale), P('RB', 7 * scale), P('WR', 6 * scale), P('TE', 4 * scale),
  ];
}
const X = P('WR', 20, true);   // YOURS: played (weeks 2..18)
const Y = P('WR', 20, false);  // RIVAL'S: unplayed (weeks 1..18) — identical weeks 2..18
const X2 = P('WR', 20, true);  // a SECOND played WR, for the no-cascade check

function team(rosterId, teamName, isUser, studId, scale) {
  const players = [studId, ...fillers(scale)];
  return {
    rosterId, teamName, isUser, players,
    starters: players.slice(0, 10),
    record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0, pointsAgainst: 0,
  };
}
const teams = [
  team(1, 'You', true, X, 1.0),
  team(2, 'Rival', false, Y, 1.0),
  team(3, 'Mid', false, P('WR', 15, false), 0.9),
  team(4, 'Basement', false, P('WR', 15, false), 0.8),
];

const MATCHINGS = [[[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]]];
const scheduleWeeks = [];
for (let w = 1; w <= REG_WEEKS; w += 1) {
  const m = MATCHINGS[w % 3];
  const matchups = [];
  m.forEach((pair, pi) => pair.forEach((rid) => matchups.push({ rosterId: rid, matchupId: w * 10 + pi, starters: [] })));
  scheduleWeeks.push({ week: w, matchups });
}

function makeCtx(extra = {}) {
  return {
    league: { rosterPositions: ROSTER_POSITIONS, regularSeasonWeeks: REG_WEEKS, playoffWeekStart: REG_WEEKS + 1, playoffTeams: 2, lastScoredWeek: 0 },
    teams, week: 1, catalog, scheduleWeeks, overlay: null,
    projections: { version: 'align-v1', projections },
    ...extra,
  };
}

let failures = 0;
const check = (name, pass, detail = '') => { console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`); if (!pass) failures += 1; };
const approx = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;

const pmap = new Map(projections.map((p) => [p.playerId, p]));

// ===== A: target_start from the grid =====================================
check('A1 unplayed-only trade -> target_start = current week (1)', tradeEffectiveWeek([Y], pmap, 1) === 1, `(got ${tradeEffectiveWeek([Y], pmap, 1)})`);
check('A2 played player -> target_start = next week (2)', tradeEffectiveWeek([X], pmap, 1) === 2, `(got ${tradeEffectiveWeek([X], pmap, 1)})`);
check('A3 mixed (played + unplayed) -> max = 2', tradeEffectiveWeek([X, Y], pmap, 1) === 2, `(got ${tradeEffectiveWeek([X, Y], pmap, 1)})`);
check('A4 TWO played players -> 2, NOT cascaded to 3', tradeEffectiveWeek([X, X2], pmap, 1) === 2, `(got ${tradeEffectiveWeek([X, X2], pmap, 1)})`);

// ===== B: the raw asymmetry the fix corrects =============================
check('B1 raw seasonTotal is asymmetric (Y carries an extra week 1)', pmap.get(Y).seasonTotal > pmap.get(X).seasonTotal,
  `(X ${pmap.get(X).seasonTotal}, Y ${pmap.get(Y).seasonTotal})`);
check('B2 aligned window (weeks>=2) makes them EQUAL', seasonTotalFrom(pmap.get(X), 2) === seasonTotalFrom(pmap.get(Y), 2),
  `(X ${seasonTotalFrom(pmap.get(X), 2)}, Y ${seasonTotalFrom(pmap.get(Y), 2)})`);

// ===== C: the sim is FAIR (equal weeks-2..18 swap -> ~zero delta) ========
// You give played X, get unplayed Y. Identical from week 2 on, so from target_start
// the rosters match -> deltas must be ~0. The OLD behavior (swap at week 1) would hand
// you Y's week-1 points that you can't actually play -> a spurious positive delta.
{
  const r = analyzeTrade(makeCtx(), { partnerRosterId: 2, give: [X], get: [Y] });
  check('C1 analyzeTrade available', r.available);
  check('C2 your expWins delta ~ 0 (no phantom week-1 gain)', approx(r.you.delta.expWins, 0, 0.2), `(Δ ${r.you.delta.expWins})`);
  check('C3 your playoff% delta ~ 0', approx(r.you.delta.playoffProb, 0, 1.5), `(Δ ${r.you.delta.playoffProb})`);
  check('C4 your title% delta ~ 0', approx(r.you.delta.titleProb, 0, 1.5), `(Δ ${r.you.delta.titleProb})`);
  check('C5 your week-1 win% delta ~ 0 (trade cannot change this week)', approx(r.you.delta.weekWinProb, 0, 1.5), `(Δ ${r.you.delta.weekWinProb})`);
}

// ===== D: the value gap is FAIR (aligned window) =========================
{
  const r = priceTrade(makeCtx(), { userRosterId: 1, partnerRosterId: 2, give: [X], get: [Y] });
  check('D1 priceTrade available', r.available);
  check('D2 value gap ~ 0 (both valued weeks>=2, not raw seasonTotal)', approx(r.valueGap ?? 0, 0, 1), `(gap ${r.valueGap})`);
}

// ===== E: the PIN (already-played player -> real score in current week) ==
// With a live matchup feed giving played X a huge week-1 score, YOUR pre-trade
// current-week win% should jump (X locked to reality) vs. no feed (X counts 0 as a
// trimmed/absent week).
{
  const noFeed = analyzeTrade(makeCtx(), { partnerRosterId: 2, give: [X], get: [Y] });
  const withFeed = analyzeTrade(makeCtx({ matchups: [{ playersPoints: { [X]: 200 } }] }), { partnerRosterId: 2, give: [X], get: [Y] });
  check('E1 pin lifts your current-week win% when your played stud actually scored big',
    withFeed.you.before.weekWinProb > noFeed.you.before.weekWinProb + 2,
    `(no-feed ${noFeed.you.before.weekWinProb}, with-feed ${withFeed.you.before.weekWinProb})`);
}

console.log(`\n${failures === 0 ? 'ALL WEEK-ALIGN INVARIANTS HOLD' : failures + ' INVARIANT(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
