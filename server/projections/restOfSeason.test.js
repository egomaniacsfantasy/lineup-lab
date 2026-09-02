import assert from 'node:assert/strict';
import test from 'node:test';

import { elapsedPoints, restOfSeasonPoints } from './restOfSeason.js';

// A player with 3 weeks of 10 pts each (weeks 1-3), full-season total 30.
const weekly = { '1': 10, '2': 10, '3': 10 };

test('off-season (currentWeek null): nothing elapsed, rest = full', () => {
  assert.equal(elapsedPoints(weekly, null, false), 0);
  assert.equal(restOfSeasonPoints(30, weekly, null, false), 30);
});

test('mid-season, team NOT final this week: past weeks drop, current week kept', () => {
  // currentWeek 2, team not final -> only week 1 elapsed (10); week 2 still counts.
  assert.equal(elapsedPoints(weekly, 2, false), 10);
  assert.equal(restOfSeasonPoints(30, weekly, 2, false), 20);
});

test('current week, team IS final (e.g. Thursday game done): current week also drops', () => {
  // currentWeek 2, team final -> weeks 1 AND 2 elapsed (20); a week ahead of peers.
  assert.equal(elapsedPoints(weekly, 2, true), 20);
  assert.equal(restOfSeasonPoints(30, weekly, 2, true), 10);
});

test('per-team is the whole point: same week, final vs not-final differ', () => {
  assert.notEqual(
    restOfSeasonPoints(30, weekly, 2, true),
    restOfSeasonPoints(30, weekly, 2, false),
  );
});

test('null full total stays null; never negative', () => {
  assert.equal(restOfSeasonPoints(null, weekly, 2, false), null);
  // A season total smaller than elapsed (rare rounding) floors at 0.
  assert.equal(restOfSeasonPoints(5, weekly, 4, false), 0);
});

test('non-numeric week keys are ignored', () => {
  assert.equal(elapsedPoints({ '1': 10, foo: 99 }, 5, false), 10);
});
