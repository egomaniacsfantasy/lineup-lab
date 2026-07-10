/**
 * Drop-logic blind-spot harness. Constructs rosters that stress the trade
 * analyzer's roster-limit drop chooser and asserts it NEVER makes an illogical
 * drop (sole kicker, sole defense, a stud over a scrub, a bench WR over a
 * backup kicker). Run: `node server/engine/dropLogic.test.mjs`
 */
import { chooseDrops, canFieldLineup } from './engine.js';

// Odds Frauds lineup: QB, RB, RB, WR, WR, TE, FLEX, FLEX, K, DEF (+ bench).
const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'];
const WEEKS = [8, 9, 10, 11, 12, 13, 14]; // rest-of-season sample

// Synthetic player factory: id, position, per-week mean points.
let uid = 0;
const catalog = {};
const projections = [];
function P(position, ppg, name) {
  const id = `p${uid++}`;
  catalog[id] = { position, name: name ?? `${position}-${ppg}` };
  projections.push([id, { mean: ppg, stdev: ppg * 0.4 }]);
  return id;
}
const projectionMap = new Map();
// (populated after all players built)

function drop(roster, n, droppable = roster) {
  return chooseDrops(roster, droppable, n, SLOTS, projectionMap, catalog, WEEKS);
}
const nm = (id) => catalog[id]?.name ?? id;

// ---- Build a shared player pool ----------------------------------------
const QB1 = P('QB', 22, 'Stud QB');
const RB1 = P('RB', 20, 'Stud RB1');
const RB2 = P('RB', 15, 'RB2');
const RB3 = P('RB', 11, 'RB3 flex');
const RBscrub = P('RB', 4, 'Scrub RB');
const WR1 = P('WR', 19, 'Stud WR (Jefferson)');
const WR2 = P('WR', 16, 'WR2');
const WR3 = P('WR', 13, 'WR3 flex');
const WR4elite = P('WR', 15, 'Surplus good WR');
const WRscrub = P('WR', 6, 'Deep bench WR');
const TE1 = P('TE', 12, 'TE1');
const K1 = P('K', 9, 'Sole Kicker');
const K2 = P('K', 8.5, 'Backup Kicker');
const DEF1 = P('DEF', 8, 'Sole Defense');
const DEF2 = P('DEF', 7.5, 'Backup Defense');

for (const [id, p] of projections) projectionMap.set(id, p);

// ---- Scenarios ----------------------------------------------------------
const tests = [];
function scenario(name, roster, n, expectDropOneOf, expectKeep = []) {
  const dropped = drop(roster, n).map(String);
  const droppedNames = dropped.map(nm);
  const okDrop = dropped.every((d) => expectDropOneOf.map(String).includes(d));
  const okKeep = expectKeep.every((k) => !dropped.includes(String(k)));
  const stillLegal = canFieldLineup(roster.filter((id) => !dropped.includes(String(id))), SLOTS, catalog);
  const pass = okDrop && okKeep && stillLegal;
  tests.push({ name, droppedNames, stillLegal, pass });
}

// 1. Realistic bench + sole K + sole DEF, drop 1 -> must protect sole K/DEF.
scenario(
  '1. Starters + bench (sole K, sole DEF), drop 1 -> protect K & DEF',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, DEF1, WRscrub, RBscrub, WR4elite],
  1,
  [WRscrub, RBscrub], // a weak bench piece
  [K1, DEF1, WR1, RB1, WR4elite],
);

// 2. Backup kicker present -> drop the backup K, keep everything useful.
scenario(
  '2. Starters + backup K + bench WR, drop 1',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, K2, DEF1, WRscrub],
  1,
  [K2, WRscrub], // ideally K2 (streamable) — WRscrub acceptable but we assert K2 preferred below
  [K1, DEF1, WR1, RB1],
);

// 3. THE key case: backup K vs bench WR, both never start -> drop backup K.
scenario(
  '3. Backup K vs good bench WR (both surplus), drop 1 -> drop the K',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, K2, DEF1, WR4elite],
  1,
  [K2],
  [WR4elite, K1, DEF1],
);

// 4. Redundancy paradox: surplus elite WR must NOT be dropped over a scrub.
scenario(
  '4. Stud WR + scrub on bench, drop 1 -> drop the scrub (not the stud)',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, DEF1, WR4elite, RBscrub],
  1,
  [RBscrub],
  [WR1, WR4elite],
);

// 5. Drop 2, must keep a legal lineup and shed the two weakest holds.
scenario(
  '5. Deep roster, drop 2 -> two weakest, lineup still legal',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, K2, DEF1, DEF2, WRscrub, RBscrub],
  2,
  [K2, DEF2, WRscrub, RBscrub],
  [K1, DEF1, WR1, RB1],
);

// 6. Only one DEF, drop 1 with a scrub present -> drop scrub, protect sole DEF.
scenario(
  '6. Sole DEF + scrub, drop 1 -> scrub, DEF protected',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, DEF1, RBscrub],
  1,
  [RBscrub],
  [DEF1, K1],
);

// 7. Infeasible trade: you gave away your ONLY kicker -> no legal lineup
//    possible; the analyzer must flag this (canFieldLineup === false).
{
  const rosterNoK = [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, DEF1, WRscrub];
  const legal = canFieldLineup(rosterNoK, SLOTS, catalog);
  const pass = legal === false;
  tests.push({
    name: '7. Traded away last kicker -> analyzer must warn (no legal lineup)',
    droppedNames: [`canFieldLineup=${legal}`],
    stillLegal: legal,
    pass,
  });
}

// ---- Report -------------------------------------------------------------
let allPass = true;
console.log('\n=== Drop-logic blind-spot harness ===\n');
for (const t of tests) {
  const flag = t.pass ? 'PASS' : 'FAIL';
  if (!t.pass) allPass = false;
  console.log(`[${flag}] ${t.name}`);
  console.log(`        dropped: ${t.droppedNames.join(', ')}  | lineup still legal: ${t.stillLegal}`);
}
console.log(`\n${allPass ? 'ALL SCENARIOS PASS' : 'SOME SCENARIOS FAILED'}\n`);
process.exit(allPass ? 0 : 1);
