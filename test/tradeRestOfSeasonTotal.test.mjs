// The trade slip shows rest-of-season TOTALS, not per-game sums: a player with
// one game left is worth that one game, and a player with none is worth 0
// (Christian Kirk read "20.9 a game" with no games left, 2026-10-27).
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutlooks, outlookTotals, restOfSeasonTotal } from '../src/utils/tradeFinderQuery.ts';
import { netTotalWords } from '../src/utils/tradeSlip.ts';

const row = (playerId, weekly, extra = {}) => ({ playerId, position: 'WR', mean: 0, seasonTotal: null, weekly, ...extra });

test('one game left counts once, not per remaining week', () => {
  assert.equal(restOfSeasonTotal(row('a', { 9: 15 }), 8), 15);
});

test('no games left is 0, even with a stale per-game mean', () => {
  assert.equal(restOfSeasonTotal(row('k', {}, { mean: 20.9 }), 8), 0);
});

test('byes and out-weeks add nothing; the rest sums', () => {
  assert.equal(restOfSeasonTotal(row('b', { 9: 10, 10: 0, 12: 11 }), 8), 21);
});

test('outlook totals feed the slip', () => {
  const totals = outlookTotals(buildOutlooks([row('a', { 9: 15 }), row('b', { 9: 10, 12: 11 })], 8));
  assert.deepEqual(totals, { a: { mean: 15 }, b: { mean: 21 } });
});

test('the net line reads in rest-of-season points', () => {
  assert.equal(netTotalWords(180, 302), 'You send 122 more points over the rest of the season.');
  assert.equal(netTotalWords(302, 180), 'You get 122 more points over the rest of the season.');
  assert.equal(netTotalWords(100, 100.3), 'Even over the rest of the season.');
  assert.equal(netTotalWords(null, 5), null);
});
