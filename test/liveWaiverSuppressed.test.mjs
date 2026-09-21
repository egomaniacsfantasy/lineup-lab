import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLiveOverlay } from '../server/live/liveEngine.js';

// In live mode the app drops WAIVER claims: their win% gain is priced on the static
// pre-game sim, so mid-game it reads as a phantom gain, and a waiver add can't change a
// week already being played. Trades and start/sit swaps are kept.

const pricing = {
  available: true,
  lines: [{ matchupId: 1, sides: { 1: { winProbability: 48.2 }, 2: { winProbability: 51.8 } } }],
  futures: [{ rosterId: 1, isUser: true }],
  userSwaps: [{ slotIndex: 0, starterId: 'a', benchId: 'b', deltaWinProb: 3 }],
  movers: [
    { kind: 'waiver', headline: 'Claim Juwan Johnson off waivers', playerId: 'jj' },
    { kind: 'trade', headline: 'Trade X for Y', playerId: 'x' },
  ],
};
const overlay = { at: 1, week: 2, sides: { 1: { 1: { winProbability: 30 } } }, futures: [{ rosterId: 1 }], players: {} };

test('live overlay removes waiver movers but keeps trades', () => {
  const out = mergeLiveOverlay(pricing, overlay);
  const kinds = out.movers.map((m) => m.kind);
  assert.ok(!kinds.includes('waiver'), 'waiver claims must be dropped in live mode');
  assert.ok(kinds.includes('trade'), 'trade movers stay');
});

test('live overlay leaves start/sit swaps intact', () => {
  const out = mergeLiveOverlay(pricing, overlay);
  assert.equal(out.userSwaps.length, 1, 'userSwaps (start/sit) are not dropped');
});

test('non-live (no overlay) keeps waiver movers', () => {
  const out = mergeLiveOverlay(pricing, null);
  assert.ok(out.movers.some((m) => m.kind === 'waiver'), 'off-live, waiver claims still surface');
});
