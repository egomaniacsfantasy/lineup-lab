import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeEffectiveWeek } from '../server/engine/engine.js';

// A trade must value EVERY player from the same week. If any traded player has already
// played the current week (his current-week grid row was trimmed), the whole trade is
// evaluated from next week, so the two sides are never compared across mismatched weeks
// (e.g. a Thursday-night Josh Allen already done for week 2 vs a Lamar Jackson who has
// not played yet). tradeEffectiveWeek returns that aligned start = max over all players
// of each one's next-startable week.

const WEEK = 2;
// Grid WITH the current week present -> has NOT played yet this week.
const notPlayed = { playerId: 'lamar', mean: 22, weekly: { 2: 22, 3: 21, 4: 20 } };
// Grid MISSING the current week (row trimmed at kickoff) -> already played.
const played = { playerId: 'allen', mean: 24, weekly: { 3: 24, 4: 23 } };
// No grid at all (snapshot fallback) -> unknown, assume not played.
const noGrid = { playerId: 'snap', mean: 15, weekly: {} };

const map = new Map([
  ['lamar', notPlayed],
  ['allen', played],
  ['snap', noGrid],
]);

test('a player already done for the week pushes the trade to next week', () => {
  // Allen (played) + Lamar (not played) -> both valued from week 3.
  assert.equal(tradeEffectiveWeek(['allen', 'lamar'], map, WEEK), 3);
});

test('nobody has played yet -> trade is effective this week', () => {
  assert.equal(tradeEffectiveWeek(['lamar'], map, WEEK), WEEK);
});

test('both players already played -> next week', () => {
  const both = new Map([['allen', played], ['allen2', { ...played, playerId: 'allen2' }]]);
  assert.equal(tradeEffectiveWeek(['allen', 'allen2'], both, WEEK), 3);
});

test('an empty/snapshot grid tells us nothing -> assume not played (this week)', () => {
  assert.equal(tradeEffectiveWeek(['snap'], map, WEEK), WEEK);
});

test('the aligned week is the MAX across every traded player', () => {
  // Even with two not-played players, one already-played player aligns all to next week.
  assert.equal(tradeEffectiveWeek(['lamar', 'snap', 'allen'], map, WEEK), 3);
});

test('a player on his BYE this week has not played: the trade still goes live this week', () => {
  // Rice (bye week 2) has no week-2 row, exactly like a player who already played.
  // His catalog byeWeek tells the two apart (user 2026-10-07: this-week win% never moved).
  const rice = { playerId: 'rice', mean: 15, weekly: { 3: 15, 4: 15 } };
  const m = new Map([['rice', rice], ['lamar', notPlayed], ['allen', played]]);
  const catalog = { rice: { byeWeek: 2 }, lamar: { byeWeek: 9 }, allen: { byeWeek: 7 } };
  assert.equal(tradeEffectiveWeek(['rice', 'lamar'], m, WEEK, catalog), WEEK);
  // Without the catalog it is read as "already played" (the old behavior).
  assert.equal(tradeEffectiveWeek(['rice', 'lamar'], m, WEEK), 3);
  // A real "already played" player still holds the deal to next week.
  assert.equal(tradeEffectiveWeek(['rice', 'allen'], m, WEEK, catalog), 3);
});
