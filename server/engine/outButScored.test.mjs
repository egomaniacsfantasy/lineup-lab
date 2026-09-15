/**
 * A player flagged OUT whose game is already FINAL with real points (hurt mid-game
 * after scoring, e.g. Zay Flowers 26) must count his actual banked points for the
 * current week, not be zeroed by the OUT flag. Run: `node server/engine/outButScored.test.mjs`
 */
import { teamDistribution } from './engine.js';

let failures = 0;
const check = (name, pass, detail = '') => { console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`); if (!pass) failures += 1; };

const catalog = {
  scored: { position: 'WR', name: 'Flowers', injuryStatus: 'Out' },   // OUT but already played
  outDnp: { position: 'WR', name: 'Benched', injuryStatus: 'Out' },   // OUT and did not play
  healthy: { position: 'WR', name: 'Healthy', injuryStatus: null },
};
const weekly = {}; for (let w = 1; w <= 18; w += 1) weekly[String(w)] = 12;
const pmap = new Map([
  ['scored', { playerId: 'scored', mean: 12, stdev: 5, weekly, lockedWeekly: { 1: 26, '1': 26 } }],
  ['outDnp', { playerId: 'outDnp', mean: 12, stdev: 5, weekly }],                 // no lock -> didn't play
  ['healthy', { playerId: 'healthy', mean: 12, stdev: 5, weekly, lockedWeekly: { 1: 26, '1': 26 } }],
]);

// OUT + final score locked -> counts the 26 (the bug: was returning 0).
const a = teamDistribution(['scored'], pmap, catalog, 1);
check('OUT player with a locked final score counts his ACTUAL (26), not 0', Math.abs(a.mean - 26) < 1e-9, `(got ${a.mean})`);
check('  ...and with zero variance (game is final)', a.sigma === 0, `(sigma ${a.sigma})`);

// OUT + no lock (did not play) -> still zeroed.
const b = teamDistribution(['outDnp'], pmap, catalog, 1);
check('OUT player who did NOT play is still zeroed', b.mean === 0, `(got ${b.mean})`);

// Healthy + lock -> counts the lock (unchanged behavior).
const c = teamDistribution(['healthy'], pmap, catalog, 1);
check('healthy locked player counts his actual (26)', Math.abs(c.mean - 26) < 1e-9, `(got ${c.mean})`);

// A FUTURE week for the OUT player is NOT locked -> he's correctly zeroed for weeks he'll miss.
const d = teamDistribution(['scored'], pmap, catalog, 5);
check('OUT player is zeroed for a FUTURE week he will miss (not locked)', d.mean === 0, `(got ${d.mean})`);

console.log(`\n${failures === 0 ? 'ALL OUT-BUT-SCORED INVARIANTS HOLD' : failures + ' INVARIANT(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
