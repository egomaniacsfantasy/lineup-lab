// A week missing from a player's weekly grid is a certain 0 (bye or depth-chart
// drop), no matter how few weeks remain. Regression for 2026-10-27: the rule used to
// require >= 10 grid rows, so mid-season (fewer than 10 weeks left) a bye fell back
// to the player's average.
import test from 'node:test';
import assert from 'node:assert/strict';
import { teamDistribution } from '../server/engine/engine.js';

const catalog = { p1: { position: 'WR' } };
const projectionMap = new Map([
  ['p1', { playerId: 'p1', mean: 11, stdev: 4, weekly: { 9: 10, 10: 12, 12: 11 } }],
]);

test('a projected week uses its own grid value', () => {
  assert.equal(teamDistribution(['p1'], projectionMap, catalog, 9).mean, 10);
});

test('a week missing from a short grid (bye) is 0, not the average', () => {
  const d = teamDistribution(['p1'], projectionMap, catalog, 11);
  assert.equal(d.mean, 0);
  assert.equal(d.sigma, 0);
});
