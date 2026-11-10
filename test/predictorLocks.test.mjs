import assert from 'node:assert/strict';
import test from 'node:test';
import { decidedWinner, openPicks, picksToSend } from '../src/utils/predictorLocks.ts';

/**
 * A game the engine prices at 100.0 against 0.0 is over, and the Predictor
 * stops asking for it. These pin the three rules that makes safe: only a
 * settled price locks a game, a locked game cannot hold a user's call, and a
 * locked game is still sent so the bracket can open.
 */

const side = (rosterId, winProb) => ({ rosterId, winProb });

test('a game priced 100 against 0 is decided for the side at 100', () => {
  assert.equal(decidedWinner([side('3', 100), side('4', 0)]), '3');
  assert.equal(decidedWinner([side('3', 0), side('4', 100)]), '4');
});

test('a lopsided game that still prints a chance is left to call', () => {
  /* 99.9 prints as 99.9%, not 100.0%: somebody can still call the upset. */
  assert.equal(decidedWinner([side('3', 99.9), side('4', 0.1)]), null);
  assert.equal(decidedWinner([side('3', 61.4), side('4', 38.6)]), null);
});

test('half a price never locks a game', () => {
  assert.equal(decidedWinner([side('3', 100), side('4', undefined)]), null);
  assert.equal(decidedWinner([side('3', 100), side('4', null)]), null);
  /* Two sides that do not sum is a pricing fault, not a result. */
  assert.equal(decidedWinner([side('3', 100), side('4', 40)]), null);
  assert.equal(decidedWinner([side('3', 100)]), null);
});

const decided = [{ week: 8, matchupId: 802, winnerRosterId: '3' }];

test('a call saved against a decided game is dropped', () => {
  const picks = [
    { week: 8, matchupId: 802, winnerRosterId: '4' },
    { week: 8, matchupId: 801, winnerRosterId: '1', winnerPoints: 150 },
  ];
  assert.deepEqual(openPicks(picks, decided), [picks[1]]);
});

test('decided games are sent as plain picks beside the open calls', () => {
  const picks = [
    /* The stale upset call must not reach the engine as a second pick on
       the same matchup, least of all with the wrong winner. */
    { week: 8, matchupId: 802, winnerRosterId: '4', winnerPoints: 999 },
    { week: 9, matchupId: 901, winnerRosterId: '1' },
  ];
  assert.deepEqual(picksToSend(picks, decided), [
    { week: 8, matchupId: 802, winnerRosterId: '3' },
    { week: 9, matchupId: 901, winnerRosterId: '1' },
  ]);
});

test('with nothing decided the picks pass through untouched', () => {
  const picks = [{ week: 9, matchupId: 901, winnerRosterId: '1', loserPoints: 88 }];
  assert.deepEqual(openPicks(picks, []), picks);
  assert.deepEqual(picksToSend(picks, []), picks);
});
