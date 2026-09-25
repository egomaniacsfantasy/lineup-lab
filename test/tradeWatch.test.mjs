import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyOffer } from '../server/engine/tradeWatch.js';

// Shapes from the real ESPN capture (league 2107153357, 2026-09-23): we are team
// 4, proposing to team 1. ESPN marks the proposer's own side ACCEPTED at once.
const ID = '8db543e8-b287-400c-92be-9eef764299c3';
const record = {
  espnTransactionId: ID,
  partnerRosterId: 1,
  give: [{ id: 'mine' }],
  get: [{ id: 'theirs' }],
  expiresAt: Date.now() + 2 * 24 * 60 * 60_000,
};
const proposal = { id: ID, type: 'TRADE_PROPOSAL', status: 'PENDING', teamActions: { 4: 'ACCEPTED' } };
const rosterBefore = new Map([['mine', { teamId: 4 }], ['theirs', { teamId: 1 }]]);

test('freshly proposed: our own ACCEPTED side is not an acceptance', () => {
  assert.equal(classifyOffer(record, [proposal], rosterBefore, 4).state, 'pending');
});

test('our CANCEL transaction (captured shape) closes it as canceled', () => {
  const cancel = { id: 'x', type: 'TRADE_PROPOSAL', status: 'CANCELED', relatedTransactionId: ID };
  assert.equal(classifyOffer(record, [proposal, cancel], rosterBefore, 4).state, 'canceled');
});

test('partner accepts: a related TRADE_ACCEPT or their teamActions flip', () => {
  const accept = { id: 'y', type: 'TRADE_ACCEPT', status: 'PENDING', relatedTransactionId: ID };
  assert.equal(classifyOffer(record, [proposal, accept], rosterBefore, 4).state, 'accepted');
  const flipped = { ...proposal, teamActions: { 4: 'ACCEPTED', 1: 'ACCEPTED' } };
  assert.equal(classifyOffer(record, [flipped], rosterBefore, 4).state, 'accepted');
});

test('partner declines or the league vetoes', () => {
  const decline = { id: 'z', type: 'TRADE_DECLINE', status: 'EXECUTED', relatedTransactionId: ID };
  assert.equal(classifyOffer(record, [proposal, decline], rosterBefore, 4).state, 'declined');
  const veto = { id: 'v', type: 'TRADE_VETO', status: 'EXECUTED', relatedTransactionId: ID };
  assert.equal(classifyOffer(record, [proposal, veto], rosterBefore, 4).state, 'declined');
});

test('rosters moved = processed, even if the feed shows nothing', () => {
  const rosterAfter = new Map([['mine', { teamId: 1 }], ['theirs', { teamId: 4 }]]);
  assert.equal(classifyOffer(record, [], rosterAfter, 4).state, 'processed');
});

test('past expiry with no acceptance = expired; invisible but unexpired stays pending', () => {
  const old = { ...record, expiresAt: Date.now() - 2 * 60 * 60_000 };
  assert.equal(classifyOffer(old, [], rosterBefore, 4).state, 'expired');
  assert.equal(classifyOffer(record, [], rosterBefore, 4).state, 'pending');
});
