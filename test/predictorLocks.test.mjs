import assert from 'node:assert/strict';
import test from 'node:test';
import { decidedWinner, finalResult, firstOpenWeek, openPicks, picksToSend, withDecided } from '../src/utils/predictorLocks.ts';

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

test('a week already settled into the records is not open to call', () => {
  const team = (wins, losses, ties = 0) => ({ record: { wins, losses, ties } });
  /* Mid-week: nine games played, week 10 in progress. */
  assert.equal(firstOpenWeek(10, [team(5, 4), team(4, 5)]), 10);
  /* The provider has scored week 10 but still calls it the current week. */
  assert.equal(firstOpenWeek(10, [team(6, 4), team(4, 6)]), 11);
  assert.equal(firstOpenWeek(10, [team(5, 4, 1), team(4, 5, 1)]), 11);
  /* No records at all (preseason, or a provider that sent none). */
  assert.equal(firstOpenWeek(1, [{ record: null }, {}]), 1);
});

test('a finished game names its winner at the real score, and a tie names nobody', () => {
  assert.deepEqual(
    finalResult([{ rosterId: '1', points: 101.2 }, { rosterId: '2', points: 130.4 }]),
    { winnerRosterId: '2', winnerPoints: 130.4, loserPoints: 101.2 },
  );
  assert.equal(finalResult([{ rosterId: '1', points: 100 }, { rosterId: '2', points: 100 }]), null);
  assert.equal(finalResult([{ rosterId: '1', points: 100 }]), null);
});

test('a final is sent with its score, so the engine credits what was scored', () => {
  const final = [{ week: 9, matchupId: 4, winnerRosterId: '2', winnerPoints: 130.4, loserPoints: 101.2 }];
  assert.deepEqual(picksToSend([], final), final);
});

test('decided games are in the standings before any call is made', () => {
  const rows = [
    { rosterId: '1', record: { wins: 5, losses: 3, ties: 0 }, pointsFor: 900 },
    { rosterId: '2', record: { wins: 4, losses: 4, ties: 0 }, pointsFor: 880 },
    { rosterId: '3', record: { wins: 2, losses: 6, ties: 0 }, pointsFor: null },
  ];
  const decidedGames = [
    { week: 9, matchupId: 4, winnerRosterId: '2', winnerPoints: 130.5, loserPoints: 101 },
    /* Out of reach but not over: a win and a loss, no score to add. */
    { week: 10, matchupId: 7, winnerRosterId: '1' },
  ];
  const sides = (game) => (game.matchupId === 4 ? ['1', '2'] : ['1', '3']);
  assert.deepEqual(withDecided(rows, decidedGames, sides), [
    { rosterId: '1', record: { wins: 6, losses: 4, ties: 0 }, pointsFor: 1001 },
    { rosterId: '2', record: { wins: 5, losses: 4, ties: 0 }, pointsFor: 1010.5 },
    { rosterId: '3', record: { wins: 2, losses: 7, ties: 0 }, pointsFor: null },
  ]);
});
