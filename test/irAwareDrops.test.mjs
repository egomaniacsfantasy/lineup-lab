import assert from 'node:assert/strict';
import test from 'node:test';

import { planIrAwareDrops, replacementLevels } from '../server/engine/engine.js';

// Minimal RB-only world: 3 active RB slots, weeks 1-3.
const flat = (w1, w2, w3) => ({ weekly: { 1: w1, 2: w2, 3: w3 }, mean: (w1 + w2 + w3) / 3 });
const projectionMap = new Map([
  ['B', flat(10, 10, 10)],
  ['E', flat(12, 12, 12)],
  ['F', flat(8, 8, 8)],
  ['D', flat(0, 0, 15)], // stash: out weeks 1-2, returns week 3
  ['G', flat(9, 9, 9)],
]);
const catalog = {
  B: { position: 'RB' }, E: { position: 'RB' }, F: { position: 'RB' },
  D: { position: 'RB' }, G: { position: 'RB' },
};
const slotLabels = ['RB', 'RB', 'RB'];
const dropWeeks = [1, 2, 3];
const teamsForRepl = [{ players: ['B', 'D', 'E', 'F', 'G'], reserve: ['D'] }];
const replacementFor = replacementLevels(teamsForRepl, projectionMap, catalog);

const common = {
  maxRoster: 3, targetStart: 1, lastWeek: 3,
  slotLabels, projectionMap, catalog, dropWeeks, replacementFor,
};

test('IR stash defers the drop: no immediate drop, one drop at the return week', () => {
  // Manager: A,B active + D on IR (one open active slot). Trade give A, get E,F (2-for-1, +1 body).
  const team = { players: ['A', 'B', 'D'], reserve: ['D'] };
  const afterPlayers = ['B', 'D', 'E', 'F'];
  const droppableIds = ['B', 'D']; // original minus give(A); E,F not droppable
  const plan = planIrAwareDrops({ ...common, team, afterPlayers, droppableIds });

  assert.equal(plan.immediateDrops.length, 0, 'the freed IR slot absorbs the extra body now');
  assert.equal(plan.deferred.length, 1, 'exactly one deferred drop');
  assert.equal(plan.deferred[0].week, 3, 'the drop fires the week the stash returns');
  assert.equal(plan.deferred[0].triggerId, 'D', 'triggered by the returning stash');
  // finalPlayers keeps everyone now; the deferred drop lives in dropSchedule.
  assert.equal(plan.finalPlayers.length, 4);
  assert.equal(Object.keys(plan.dropSchedule).length, 1);
});

test('no IR stash: the drop is immediate (unchanged behavior)', () => {
  const team = { players: ['A', 'B', 'G'], reserve: [] };
  const afterPlayers = ['B', 'G', 'E', 'F']; // give A, get E,F -> 4 active for 3 slots
  const droppableIds = ['B', 'G'];
  const plan = planIrAwareDrops({ ...common, team, afterPlayers, droppableIds });

  assert.equal(plan.immediateDrops.length, 1, 'over the limit with no IR relief -> drop now');
  assert.equal(plan.deferred.length, 0);
});

test('two stashes returning the same week force two drops that week, none now', () => {
  // maxRoster 3; manager has 1 active (A) + C,D both on IR (two open active slots).
  // Give A, get E,F,H (1-for-3, +2) -> the two freed slots absorb both now.
  const projMap2 = new Map(projectionMap);
  projMap2.set('C', flat(0, 0, 14));
  projMap2.set('H', flat(7, 7, 7));
  const catalog2 = { ...catalog, C: { position: 'RB' }, H: { position: 'RB' } };
  const repl2 = replacementLevels(
    [{ players: ['C', 'D', 'E', 'F', 'H'], reserve: ['C', 'D'] }], projMap2, catalog2,
  );
  const team = { players: ['A', 'C', 'D'], reserve: ['C', 'D'] };
  const afterPlayers = ['C', 'D', 'E', 'F', 'H']; // give A, get E,F,H
  const droppableIds = ['C', 'D']; // original minus give(A)
  const plan = planIrAwareDrops({
    ...common, projectionMap: projMap2, catalog: catalog2, replacementFor: repl2,
    team, afterPlayers, droppableIds,
  });
  // active at start = 5 - 2 (C,D out) = 3 = maxRoster -> 0 immediate; both return wk3 -> +2 -> 2 drops.
  assert.equal(plan.immediateDrops.length, 0, 'both freed IR slots absorb the two extra bodies now');
  assert.equal(plan.deferred.length, 2, 'two drops when both stashes return');
  assert.ok(plan.deferred.every((d) => d.week === 3), 'both fire at the shared return week');
  assert.equal(plan.totalDrops, 2);
});
