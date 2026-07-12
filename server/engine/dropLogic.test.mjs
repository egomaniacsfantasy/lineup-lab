/**
 * Drop-logic harness (value-over-replacement). The roster-limit drop chooser
 * values every player by POINTS OVER REPLACEMENT and drops the lowest. There is
 * no special K/DEF rule and no feasibility protection: a sole K/DEF is dropped
 * only if it is genuinely the least valuable asset, because the season sim
 * streams a replacement for any emptied required slot. Run: `node server/engine/dropLogic.test.mjs`
 */
import { chooseDrops, replacementLevels } from './engine.js';

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'];
const WEEKS = [8, 9, 10, 11, 12, 13, 14];

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

const QB1 = P('QB', 22, 'Stud QB');
const RB1 = P('RB', 20, 'Stud RB1');
const RB2 = P('RB', 15, 'RB2');
const RB3 = P('RB', 11, 'RB3 flex');
const RBscrub = P('RB', 4, 'Scrub RB');       // below replacement -> 0 VOR
const WR1 = P('WR', 19, 'Stud WR');
const WR2 = P('WR', 16, 'WR2');
const WR3 = P('WR', 13, 'WR3 flex');
const WR4elite = P('WR', 15, 'Surplus good WR');
const WRscrub = P('WR', 6, 'Deep bench WR');   // at replacement -> ~0 VOR
const TE1 = P('TE', 12, 'TE1');
const K1 = P('K', 9, 'Sole Kicker');
const K2 = P('K', 8.5, 'Backup Kicker');
const DEF1 = P('DEF', 8, 'Sole Defense');
const DEF2 = P('DEF', 7.5, 'Backup Defense');

for (const [id, p] of projections) projectionMap.set(id, p);

// No free agents in this synthetic universe, so replacement falls back to the
// per-position defaults (RB/WR 6, TE 5, K 7, DEF 6, QB 12).
const replacementFor = replacementLevels([{ players: [...projectionMap.keys()] }], projectionMap, catalog);

function drop(roster, n, droppable = roster) {
  return chooseDrops(roster, droppable, n, SLOTS, projectionMap, catalog, WEEKS, replacementFor).map(String);
}
const nm = (id) => catalog[id]?.name ?? id;

const tests = [];
function scenario(name, roster, n, expectDropOneOf, expectKeep = []) {
  const dropped = drop(roster, n);
  const okDrop = dropped.every((d) => expectDropOneOf.map(String).includes(d));
  const okKeep = expectKeep.every((k) => !dropped.includes(String(k)));
  tests.push({ name, droppedNames: dropped.map(nm), pass: okDrop && okKeep });
}

// 1. A worthless scrub (at/below replacement) is dropped before anything of value.
scenario('1. Scrubs present -> drop a worthless scrub, keep the studs & sole K/DEF',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, DEF1, WRscrub, RBscrub, WR4elite], 1,
  [WRscrub, RBscrub], [K1, DEF1, WR1, RB1, WR4elite]);

// 2. Backup kicker vs worthless scrub -> the scrub (0 VOR) goes first.
scenario('2. Backup K + worthless bench WR -> drop the 0-VOR scrub first',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, K2, DEF1, WRscrub], 1,
  [WRscrub], [K1, K2, DEF1, WR1, RB1]);

// 3. Backup K vs a GOOD bench WR (both never start) -> drop the backup K.
//    (Good WR has high VOR; the near-replacement backup kicker has low VOR.)
scenario('3. Backup K vs good bench WR -> drop the backup K',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, K2, DEF1, WR4elite], 1,
  [K2], [WR4elite, K1, DEF1]);

// 4. Stud WR + scrub -> drop the scrub, never the stud.
scenario('4. Stud WR + scrub -> drop the scrub',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, DEF1, WR4elite, RBscrub], 1,
  [RBscrub], [WR1, WR4elite]);

// 5. Drop 2 -> the two lowest-VOR holds.
scenario('5. Deep roster, drop 2 -> two lowest-VOR',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, K2, DEF1, DEF2, WRscrub, RBscrub], 2,
  [K2, DEF2, WRscrub, RBscrub], [K1, DEF1, WR1, RB1]);

// 6. Sole DEF + scrub -> drop the scrub (sole DEF has positive VOR).
scenario('6. Sole DEF + scrub -> drop the scrub',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, DEF1, RBscrub], 1,
  [RBscrub], [DEF1, K1]);

// 7. NEW VOR behavior: no worthless scrub anywhere, must drop 1. The sole kicker
//    is the lowest-VOR asset, so it's dropped (the sim streams a replacement) —
//    keeping a higher-value bench skill player. No protection, by design.
scenario('7. No scrubs, must drop 1 -> the low-VOR sole kicker goes, keep the good WR',
  [QB1, RB1, RB2, WR1, WR2, TE1, RB3, WR3, K1, DEF1, WR4elite], 1,
  [K1, DEF1], [WR4elite, WR1, RB1]);

let allPass = true;
console.log('\n=== Drop-logic harness (value over replacement) ===\n');
for (const t of tests) {
  const flag = t.pass ? 'PASS' : 'FAIL';
  if (!t.pass) allPass = false;
  console.log(`[${flag}] ${t.name}\n        dropped: ${t.droppedNames.join(', ')}`);
}
console.log(`\n${allPass ? 'ALL SCENARIOS PASS' : 'SOME SCENARIOS FAILED'}\n`);
process.exit(allPass ? 0 : 1);
