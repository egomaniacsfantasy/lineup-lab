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

import { autoSendCandidates } from '../server/engine/tradeWatch.js';

test('auto-send picks: best first, no resends, one pending offer per manager, weekly cap', () => {
  const now = Date.now();
  const day = 24 * 60 * 60_000;
  const offer = (id, partnerRosterId, youDelta) => ({ id, partnerRosterId, partnerName: `T${partnerRosterId}`, youDelta, sent: null });
  const entry = {
    settings: { autoCap: 3 },
    suggestions: [offer('a', 1, 3.0), offer('b', 1, 2.5), offer('c', 2, 2.0), offer('d', 3, 1.5), offer('e', 5, 1.2)],
    sent: [
      { offerId: 'd', partnerRosterId: 3, state: 'declined', mode: 'auto', at: now - 2 * day }, // declined: never re-pitch
      { offerId: 'x', partnerRosterId: 2, state: 'pending', mode: 'manual', at: now - day },    // manager 2 has one out
      { offerId: 'y', partnerRosterId: 9, state: 'expired', mode: 'auto', at: now - 8 * day },  // outside the 7-day window
    ],
  };
  const { offers, remaining, used } = autoSendCandidates(entry, now);
  assert.deepEqual(offers.map((o) => o.id), ['a', 'e'], 'a (best for mgr 1); b skipped (same mgr); c (mgr 2 busy); d (declined)');
  assert.equal(used, 1, 'only auto offers inside 7 days count');
  assert.equal(remaining, 2);
  assert.equal(autoSendCandidates({ ...entry, settings: { autoCap: null } }, now).remaining, Infinity, 'blank cap = unlimited');
});

import { incomingOffers, recommendIncoming } from '../server/engine/tradeWatch.js';

test('incoming offers: live ones only (ESPN leaves withdrawn originals reading PENDING)', () => {
  const now = Date.now();
  const future = now + 86_400_000;
  const activity = [
    // Team 2 offers me (team 4) two-for-one: live.
    { id: 'live', type: 'TRADE_PROPOSAL', status: 'PENDING', teamId: 2, expirationDate: future, items: [
      { playerId: 11, type: 'TRADE', fromTeamId: 2, toTeamId: 4 },
      { playerId: 12, type: 'TRADE', fromTeamId: 2, toTeamId: 4 },
      { playerId: 40, type: 'TRADE', fromTeamId: 4, toTeamId: 2 },
    ] },
    // Team 3 offered, then withdrew: original still says PENDING.
    { id: 'gone', type: 'TRADE_PROPOSAL', status: 'PENDING', teamId: 3, expirationDate: future, items: [
      { playerId: 13, type: 'TRADE', fromTeamId: 3, toTeamId: 4 }, { playerId: 41, type: 'TRADE', fromTeamId: 4, toTeamId: 3 },
    ] },
    { id: 'gone-cancel', type: 'TRADE_PROPOSAL', status: 'CANCELED', teamId: 3, relatedTransactionId: 'gone', items: [] },
    // Team 5 offered and I already declined.
    { id: 'answered', type: 'TRADE_PROPOSAL', status: 'PENDING', teamId: 5, expirationDate: future, items: [
      { playerId: 14, type: 'TRADE', fromTeamId: 5, toTeamId: 4 }, { playerId: 42, type: 'TRADE', fromTeamId: 4, toTeamId: 5 },
    ] },
    { id: 'answered-no', type: 'TRADE_DECLINE', status: 'EXECUTED', teamId: 4, relatedTransactionId: 'answered', items: [] },
    // Expired, my own offer, and a trade between two other teams: none are mine to answer.
    { id: 'old', type: 'TRADE_PROPOSAL', status: 'PENDING', teamId: 6, expirationDate: now - 1000, items: [{ playerId: 15, type: 'TRADE', fromTeamId: 6, toTeamId: 4 }] },
    { id: 'mine', type: 'TRADE_PROPOSAL', status: 'PENDING', teamId: 4, expirationDate: future, items: [{ playerId: 43, type: 'TRADE', fromTeamId: 4, toTeamId: 7 }] },
    { id: 'others', type: 'TRADE_PROPOSAL', status: 'PENDING', teamId: 7, expirationDate: future, items: [{ playerId: 16, type: 'TRADE', fromTeamId: 7, toTeamId: 8 }] },
  ];
  const got = incomingOffers(activity, 4, now);
  assert.deepEqual(got.map((o) => o.id), ['live']);
  assert.deepEqual(got[0].getEspn, [11, 12]);
  assert.deepEqual(got[0].giveEspn, [40]);
  assert.equal(got[0].fromTeamId, 2);
});

test('incoming recommendation: same X + protected rules as the sender', () => {
  const rules = { minYouDelta: 1, protect: ['p-star'] };
  assert.equal(recommendIncoming({ youDelta: 2.4, givePlayerIds: ['p-bench'] }, rules).action, 'accept');
  assert.equal(recommendIncoming({ youDelta: 0.5, givePlayerIds: ['p-bench'] }, rules).reason, 'below_min');
  assert.equal(recommendIncoming({ youDelta: -1.2, givePlayerIds: ['p-bench'] }, rules).reason, 'hurts_me');
  assert.equal(recommendIncoming({ youDelta: 9, givePlayerIds: ['p-star'] }, rules).reason, 'protected', 'never gives a protected player');
});
