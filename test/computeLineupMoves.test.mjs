import assert from 'node:assert/strict';
import test from 'node:test';

import { computeLineupMoves } from '../server/engine/engine.js';

// Current lineup: a good WR benched, a worse WR starting; QB already right.
const rosterSlots = [
  { id: 'qb', espnId: 101, name: 'QB One', lineupSlotId: 0 },   // QB slot, stays
  { id: 'wrA', espnId: 102, name: 'WR Start', lineupSlotId: 4 },  // starting WR
  { id: 'wrB', espnId: 103, name: 'WR Bench', lineupSlotId: 20 }, // benched WR (better)
  { id: 'ir', espnId: 104, name: 'Hurt Guy', lineupSlotId: 21 },  // IR -- must be untouched
];
// Optimal wants QB One (QB), WR Bench (WR); WR Start sits.
const optimal = [
  { slot: 'QB', playerId: 'qb' },
  { slot: 'WR', playerId: 'wrB' },
];

test('produces the bench/start moves and leaves QB + IR alone', () => {
  const { moves, readable } = computeLineupMoves(rosterSlots, optimal);
  // wrB (bench 20 -> WR 4) and wrA (WR 4 -> bench 20). QB and IR untouched.
  assert.equal(moves.length, 2);
  const byPid = new Map(moves.map((m) => [m.playerId, m]));
  assert.deepEqual(byPid.get(103), { playerId: 103, type: 'LINEUP', fromLineupSlotId: 20, toLineupSlotId: 4 });
  assert.deepEqual(byPid.get(102), { playerId: 102, type: 'LINEUP', fromLineupSlotId: 4, toLineupSlotId: 20 });
  assert.ok(!moves.some((m) => m.playerId === 101), 'QB already correct -> no move');
  assert.ok(!moves.some((m) => m.playerId === 104), 'IR player is never moved');
  assert.equal(readable.find((r) => r.playerId === 102).benched, true);
});

test('a locked player is not moved (game kicked off)', () => {
  const { moves } = computeLineupMoves(rosterSlots, optimal, new Set(['wrA']));
  // wrA can't move out, so wrB also has nowhere legal to land in this tiny set...
  // wrB still moves to WR4 (that slot is vacated only conceptually); ESPN would
  // reject a half-move, but the guard's job is just to never emit a locked player.
  assert.ok(!moves.some((m) => m.playerId === 102), 'locked wrA is not in the moves');
});

test('already-optimal roster yields no moves', () => {
  const already = [
    { id: 'qb', espnId: 101, name: 'QB One', lineupSlotId: 0 },
    { id: 'wrB', espnId: 103, name: 'WR Bench', lineupSlotId: 4 },
  ];
  const { moves } = computeLineupMoves(already, [
    { slot: 'QB', playerId: 'qb' },
    { slot: 'WR', playerId: 'wrB' },
  ]);
  assert.equal(moves.length, 0);
});
