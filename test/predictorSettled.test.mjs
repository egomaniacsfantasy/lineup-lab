import assert from 'node:assert/strict';
import test from 'node:test';
import { settledResults } from '../server/services/predictorSettled.js';

/**
 * Finished weeks that are not in the records yet reach the Predictor as
 * results, paired by matchup, at the score the provider reports.
 */

test('rows pair into games by matchup, in week order', () => {
  const prior = {
    9: [
      { matchupId: 2, rosterId: 3, points: 99.5 },
      { matchupId: 1, rosterId: 1, points: 120.1 },
      { matchupId: 2, rosterId: 4, points: 140 },
      { matchupId: 1, rosterId: 2, points: 88 },
    ],
    8: [
      { matchupId: 1, rosterId: 1, points: 70 },
      { matchupId: 1, rosterId: 4, points: 71 },
    ],
  };
  assert.deepEqual(settledResults(prior), [
    { week: 8, matchupId: 1, sides: [{ rosterId: '1', points: 70 }, { rosterId: '4', points: 71 }] },
    { week: 9, matchupId: 1, sides: [{ rosterId: '1', points: 120.1 }, { rosterId: '2', points: 88 }] },
    { week: 9, matchupId: 2, sides: [{ rosterId: '3', points: 99.5 }, { rosterId: '4', points: 140 }] },
  ]);
});

test('a bye, a half game and a missing score are left out', () => {
  const prior = {
    9: [
      { matchupId: null, rosterId: 5, points: 90 },
      { matchupId: 3, rosterId: 6, points: 100 },
      { matchupId: 4, rosterId: 7, points: 100 },
      { matchupId: 4, rosterId: 8 },
    ],
  };
  assert.deepEqual(settledResults(prior), []);
  assert.deepEqual(settledResults(undefined), []);
  assert.deepEqual(settledResults({}), []);
});
