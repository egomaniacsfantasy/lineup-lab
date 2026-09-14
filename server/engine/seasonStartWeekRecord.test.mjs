/**
 * The futures sim must count the current-week result EXACTLY ONCE, driven by the actual
 * record (wins+losses+ties) -- not by the provider's lastScoredWeek flag, which can advance
 * to the in-progress week while the win/loss record is still 0-0 (Sleeper settles ~a day
 * later). In that window the old max(displayWeek, lastScored+1) start jumped past the current
 * week, so a loss was neither recorded nor simulated and a team's title odds could RISE after
 * it had actually lost. Run: `node server/engine/seasonStartWeekRecord.test.mjs`
 */
import { simulateSeason, computeInputsHash } from './engine.js';

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'];
const catalog = {}; const projections = []; let uid = 0;
const P = (pos, ppg) => {
  const id = `p${uid++}`; catalog[id] = { position: pos, name: id };
  const weekly = {}; const weeklyCI = {};
  for (let w = 1; w <= 18; w += 1) { weekly[String(w)] = ppg; weeklyCI[String(w)] = { floor: ppg * 0.6, ceiling: ppg * 1.4 }; }
  projections.push({ playerId: id, position: pos, mean: ppg, stdev: ppg * 0.4, weekly, weeklyCI });
  return id;
};
const mkTeam = (rid, isUser, scale) => {
  const players = [P('QB', 20 * scale), P('RB', 16 * scale), P('RB', 12 * scale), P('WR', 15 * scale),
    P('WR', 11 * scale), P('TE', 9 * scale), P('K', 8 * scale), P('DEF', 8 * scale), P('RB', 7 * scale), P('WR', 6 * scale)];
  return { rosterId: rid, teamName: `T${rid}`, isUser, players, starters: players.slice(0, 10), record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0, pointsAgainst: 0 };
};
const scales = [1.05, 1.04, 1.0, 0.98, 0.96, 0.94, 0.92, 0.9];
const teams = scales.map((s, i) => mkTeam(i + 1, i === 0, s));
const REG = 14;
const scheduleWeeks = [];
for (let w = 1; w <= REG; w += 1) {
  const ms = []; const order = teams.map((t) => t.rosterId);
  const rot = [order[0], ...order.slice(1).map((_, i) => order[1 + ((i + (w - 1)) % (order.length - 1))])];
  for (let i = 0; i < rot.length; i += 2) { ms.push({ rosterId: rot[i], matchupId: w * 100 + i }); ms.push({ rosterId: rot[i + 1], matchupId: w * 100 + i }); }
  scheduleWeeks.push({ week: w, matchups: ms });
}
const seed = parseInt(computeInputsHash({ projectionVersion: 'ssw', teams, week: 1, overlay: null }).slice(0, 8), 16);

// Title% for T1 with its week-1 pinned to `userWk1` (per starter), at a given lastScoredWeek.
function title(lastScoredWeek, userWk1) {
  const pmap = new Map(projections.map((p) => [p.playerId, p]));
  if (userWk1 != null) for (const id of teams[0].starters) pmap.set(id, { ...pmap.get(id), lockedWeekly: { 1: userWk1, '1': userWk1 } });
  const league = { rosterPositions: [...SLOTS, 'BN', 'BN'], regularSeasonWeeks: REG, playoffWeekStart: REG + 1, playoffTeams: 4, lastScoredWeek };
  const res = simulateSeason({ league, teams, scheduleWeeks, week: 1, projectionMap: pmap, catalog, slotLabels: SLOTS, seed });
  return res.find((r) => r.rosterId === 1).titleProb;
}

let failures = 0;
const check = (name, pass, detail = '') => { console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`); if (!pass) failures += 1; };

const loseSim = title(0, 0.1);      // week 1 in remaining, T1 loses
const winSim = title(0, 40);        // week 1 in remaining, T1 wins
const loseDesync = title(1, 0.1);   // lastScoredWeek=1 but record still 0-0 (the desync)

check('losing week 1 lowers title vs winning it', loseSim < winSim - 1, `(lose ${loseSim.toFixed(1)} vs win ${winSim.toFixed(1)})`);
check('DESYNC FIXED: lastScoredWeek=1 with a 0-0 record still counts the loss',
  Math.abs(loseDesync - loseSim) < 0.6, `(desync ${loseDesync.toFixed(1)} vs simulated ${loseSim.toFixed(1)})`);
check('a lost week does NOT inflate title above the win case', loseDesync < winSim - 1, `(desync ${loseDesync.toFixed(1)} vs win ${winSim.toFixed(1)})`);

console.log(`\n${failures === 0 ? 'ALL START-WEEK/RECORD INVARIANTS HOLD' : failures + ' INVARIANT(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
