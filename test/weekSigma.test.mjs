import assert from 'node:assert/strict';
import test from 'node:test';
import { teamDistribution } from '../server/engine/engine.js';
import { closedFormWinProb, livePlayerScore } from '../server/engine/liveWinProb.js';

/**
 * A player's spread for a week comes from THAT week's floor/ceiling.
 *
 * The defect: the weekly sigma was the season-average sigma x (weekMean / seasonMean).
 * Carson Wentz (MIN, week 9 2026) was a one-game fill-in: 13.2 projected in week 9 and
 * 0 in every other remaining week, so his season mean was ~1.5 and the ratio ~9x.
 * His sigma read 107.6, and the live win% priced a 13-point lead with only him left
 * at 54%.
 */

const Z80 = 1.2815515594;
const weekZeros = { 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0 };
const wentz = {
  mean: 13.2 / 9,
  stdev: 11.9,
  weekly: { 9: 13.2, ...weekZeros },
  weeklyCI: { 9: { floor: 1.33, ceiling: 28.86 } },
};

test('week sigma uses that week floor/ceiling, not the season-mean ratio', () => {
  const map = new Map([['wentz', wentz]]);
  const d = teamDistribution(['wentz'], map, { wentz: { position: 'QB' } }, 9);
  assert.equal(d.mean, 13.2);
  const expected = (28.86 - 1.33) / (2 * Z80);
  assert.ok(Math.abs(d.sigma - expected) < 0.01, `sigma ${d.sigma} vs ${expected}`);
});

test('no per-week CI: rescale is capped at 2x', () => {
  const noCi = { ...wentz, weeklyCI: {} };
  const map = new Map([['w', noCi]]);
  const d = teamDistribution(['w'], map, { w: { position: 'QB' } }, 9);
  assert.ok(Math.abs(d.sigma - 11.9 * 2) < 0.01, `sigma ${d.sigma}`);
});

test('the week 9 live matchup: 13.1-pt lead, Wentz at halftime -> clear favourite', () => {
  const map = new Map([['wentz', wentz]]);
  const sigma = teamDistribution(['wentz'], map, { wentz: { position: 'QB' } }, 9).sigma;
  const live = livePlayerScore(13.2, sigma, 1, 0.5);
  const opp = { mean: 120.5 + live.mean, variance: live.variance };
  const you = { mean: 134.6, variance: 0 };
  const wp = closedFormWinProb(you, opp);
  assert.ok(wp > 0.75 && wp < 0.85, `win% ${wp}`);
});
