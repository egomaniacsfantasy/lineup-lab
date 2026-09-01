import assert from 'node:assert/strict';
import test from 'node:test';

import { actualAppliedTotal, playersPointsForSide } from './espnProvider.js';

// ESPN stats[] entry shape: statSourceId 0 = actual, 1 = projected;
// statSplitTypeId 1 = a single scoring period.
function stat(period, sourceId, applied, splitTypeId = 1) {
  return { scoringPeriodId: period, statSourceId: sourceId, statSplitTypeId: splitTypeId, appliedTotal: applied };
}

// Minimal ESPN player. Position/team ids don't need to resolve — with an empty
// crosswalk resolvePlayer falls back to the synthetic `espn-<id>` key, which is
// all these assertions need.
function espnPlayer(id, fullName, stats) {
  return { id, fullName, defaultPositionId: 1, proTeamId: 0, stats };
}

function entry(player, appliedStatTotal) {
  return { playerPoolEntry: { player, ...(appliedStatTotal != null ? { appliedStatTotal } : {}) } };
}

const emptyCrosswalk = { byNamePos: new Map(), defByTeam: new Map() };

test('actualAppliedTotal picks the actual single-week total, ignores projected and other weeks', () => {
  const p = espnPlayer(1, 'Real Player', [
    stat(5, 1, 20.0),   // projected for wk5 — ignore
    stat(5, 0, 12.3),   // actual for wk5   — take this
    stat(4, 0, 9.0),    // actual for wk4   — wrong week
  ]);
  assert.equal(actualAppliedTotal(p, 5), 12.3);
  assert.equal(actualAppliedTotal(p, 4), 9.0);
  assert.equal(actualAppliedTotal(p, 6), null); // nothing published yet
});

test('actualAppliedTotal skips season-to-date splits (statSplitTypeId != 1)', () => {
  const p = espnPlayer(2, 'Season Split', [
    stat(5, 0, 88.0, 0), // season cumulative — not a single week
  ]);
  assert.equal(actualAppliedTotal(p, 5), null);
});

test('playersPointsForSide keys by resolved id, prefers actual stats, falls back to appliedStatTotal', () => {
  const roster = {
    entries: [
      entry(espnPlayer(1, 'Stats Player', [stat(5, 1, 20.0), stat(5, 0, 12.3)])),
      entry(espnPlayer(2, 'Fallback Player', []), 7.7),          // no stats -> use entry total
      entry(espnPlayer(3, 'Not Yet Playing', [stat(4, 0, 9.0)])), // only wk4 -> omitted for wk5
      { playerPoolEntry: {} },                                     // no player -> skipped
    ],
  };
  const out = playersPointsForSide(roster, 5, emptyCrosswalk, {});
  assert.equal(out['espn-1'], 12.3);
  assert.equal(out['espn-2'], 7.7);
  assert.ok(!('espn-3' in out));
  assert.equal(Object.keys(out).length, 2);
});

test('playersPointsForSide is empty (a live no-op) when the roster has no published points', () => {
  assert.deepEqual(playersPointsForSide(null, 5, emptyCrosswalk, {}), {});
  assert.deepEqual(playersPointsForSide({ entries: [] }, 5, emptyCrosswalk, {}), {});
  const preGame = { entries: [entry(espnPlayer(1, 'Pre Game', [stat(5, 1, 18.0)]))] }; // projected only
  assert.deepEqual(playersPointsForSide(preGame, 5, emptyCrosswalk, {}), {});
});
