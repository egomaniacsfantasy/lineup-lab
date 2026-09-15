// playerDistribution's out/ir/inactive zero is a FALLBACK, not a blanket. When the
// player has an injury-aware weekly grid for the week, the grid wins -- so a player
// carrying an "IR" designation who is due back (grid: 0 while out, real once he returns)
// is never stranded at 0.0 all season. The blanket zero fires only when there is no
// grid value to trust. Exercised through the exported teamDistribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { teamDistribution } from '../server/engine/engine.js';

test('IR player WITH a week grid uses the grid, not a blanket zero', () => {
  const projectionMap = new Map([
    // Grid: out weeks 2-3 (0), back week 8 (14.0).
    ['ajb', { mean: 14, stdev: 5, weekly: { 2: 0, 3: 0, 8: 14 } }],
  ]);
  const catalog = { ajb: { name: 'A.J. Brown', team: 'NE', injuryStatus: 'IR' } };

  const wk2 = teamDistribution(['ajb'], projectionMap, catalog, 2);
  assert.equal(wk2.mean, 0, 'week 2 uses the grid zero');
  assert.equal(wk2.zeroed.length, 0, 'grid zero is not the blanket out-flag zero');

  const wk8 = teamDistribution(['ajb'], projectionMap, catalog, 8);
  assert.equal(wk8.mean, 14, 'week 8 projects his return from the grid, not 0');
});

test('Questionable player projects his grid value (never zeroed)', () => {
  const projectionMap = new Map([['zay', { mean: 15, stdev: 6, weekly: { 2: 15.09 } }]]);
  const catalog = { zay: { name: 'Zay Flowers', team: 'BAL', injuryStatus: 'Questionable' } };
  const wk2 = teamDistribution(['zay'], projectionMap, catalog, 2);
  assert.equal(Number(wk2.mean.toFixed(2)), 15.09);
  assert.equal(wk2.zeroed.length, 0);
});

test('out player with NO grid value for the week still falls back to zero', () => {
  const projectionMap = new Map([['x', { mean: 10, stdev: 4 }]]); // no weekly grid
  const catalog = { x: { name: 'No Grid Guy', team: 'KC', injuryStatus: 'Out' } };
  const wk2 = teamDistribution(['x'], projectionMap, catalog, 2);
  assert.equal(wk2.mean, 0);
  assert.equal(wk2.zeroed.length, 1, 'fallback blanket zero, flagged zeroed');
});

test('healthy player with a grid is unaffected', () => {
  const projectionMap = new Map([['h', { mean: 12, stdev: 4, weekly: { 2: 12 } }]]);
  const catalog = { h: { name: 'Healthy', team: 'DET', injuryStatus: null } };
  const wk2 = teamDistribution(['h'], projectionMap, catalog, 2);
  assert.equal(wk2.mean, 12);
  assert.equal(wk2.zeroed.length, 0);
});
