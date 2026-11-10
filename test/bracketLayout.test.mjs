import assert from 'node:assert/strict';
import test from 'node:test';
import { bracketRoundLabel, layoutBracket, standardSeedOrder } from '../src/utils/bracketLayout.ts';
import { picksOnBoard } from '../src/utils/predictorLocks.ts';

/**
 * Where things sit on the playoff bracket. Position only: who plays whom is
 * the engine's, and a slot can be picked only when the engine served it.
 */

const seeds = (n) => Array.from({ length: n }, (_, i) => ({ rosterId: `r${i + 1}`, seed: i + 1 }));
const matchup = (round, idx, a, b, winner = null) => ({
  round, idx, week: 15 + round,
  a: { rosterId: `r${a}`, seed: a }, b: { rosterId: `r${b}`, seed: b },
  winnerRosterId: winner ? `r${winner}` : null,
});
const shape = (layout) =>
  layout.rounds.map((round) => round.slots.map((slot) =>
    `${slot.kind}:${slot.sides.map((side) => side.seed ?? '?').join('v')}${slot.matchup ? '*' : ''}`));

test('the draw is the engine\'s standard order', () => {
  assert.deepEqual(standardSeedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(standardSeedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test('with no bracket yet, six teams still draw a full frame by seed', () => {
  const layout = layoutBracket(null, 6);
  assert.deepEqual(shape(layout), [
    ['bye:1', 'match:4v5', 'bye:2', 'match:3v6'],
    ['match:?v?', 'match:?v?'],
    ['match:?v?'],
  ]);
  assert.equal(layout.games, 5);
  assert.equal(layout.connected, true);
});

test('a served matchup is the only kind that can be picked', () => {
  const bracket = {
    seeds: seeds(6), playoffTeams: 6, reseed: false, champion: null,
    rounds: [{ round: 0, week: 15, matchups: [matchup(0, 1, 4, 5, 5), matchup(0, 3, 3, 6)] }],
  };
  const layout = layoutBracket(bracket, 6);
  assert.deepEqual(shape(layout), [
    ['bye:1', 'match:4v5*', 'bye:2', 'match:3v6*'],
    /* The bye team and the picked winner are carried across so the next
       round shows who is waiting, but neither slot is served, so neither
       can be picked: 1 v 5 is known and still has no star. */
    ['match:1v5', 'match:2v?'],
    ['match:?v?'],
  ]);
  assert.equal(layout.rounds[1].slots[0].sides[1].rosterId, 'r5');
});

test('a slot keeps its engine index, so a pick is sent under the right key', () => {
  const bracket = {
    seeds: seeds(6), playoffTeams: 6, reseed: false, champion: null,
    rounds: [
      { round: 0, week: 15, matchups: [matchup(0, 1, 4, 5, 4), matchup(0, 3, 3, 6, 3)] },
      { round: 1, week: 16, matchups: [matchup(1, 0, 1, 4), matchup(1, 1, 2, 3)] },
    ],
  };
  const layout = layoutBracket(bracket, 6);
  assert.deepEqual(layout.rounds[0].slots.map((slot) => slot.matchup?.idx ?? null), [null, 1, null, 3]);
  assert.deepEqual(layout.rounds[1].slots.map((slot) => slot.matchup?.idx), [0, 1]);
  assert.equal(layout.rounds[1].week, 16);
});

test('a reseeding bracket lists byes then games and claims no connectors', () => {
  const layout = layoutBracket(
    { seeds: seeds(6), playoffTeams: 6, reseed: true, champion: null,
      rounds: [{ round: 0, week: 15, matchups: [matchup(0, 0, 3, 6), matchup(0, 1, 4, 5)] }] },
    6,
  );
  assert.equal(layout.connected, false);
  assert.deepEqual(shape(layout), [
    ['bye:1', 'bye:2', 'match:3v6*', 'match:4v5*'],
    ['match:?v?', 'match:?v?'],
    ['match:?v?'],
  ]);
});

test('four teams is two rounds with no byes', () => {
  assert.deepEqual(shape(layoutBracket(null, 4)), [['match:1v4', 'match:2v3'], ['match:?v?']]);
});

test('rounds are named from the final backwards', () => {
  assert.deepEqual([0, 1, 2].map((round) => bracketRoundLabel(round, 3)), ['Quarterfinals', 'Semifinals', 'Final']);
  assert.deepEqual([0, 1].map((round) => bracketRoundLabel(round, 2)), ['Semifinals', 'Final']);
});

test('a saved call survives only while its game is on the board', () => {
  const board = [{ week: 9, matchupId: 1 }, { week: 10, matchupId: 1 }];
  const picks = [
    { week: 8, matchupId: 1, winnerRosterId: 'a' },   // played last week, same id as a live game
    { week: 9, matchupId: 1, winnerRosterId: 'b' },
    { week: 9, matchupId: 7, winnerRosterId: 'c' },   // no such game
  ];
  assert.deepEqual(picksOnBoard(picks, board), [picks[1]]);
  /* Nothing loaded yet is nothing to send, not everything. */
  assert.deepEqual(picksOnBoard(picks, []), []);
});
