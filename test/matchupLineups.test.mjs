import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLineup, pairLineups } from '../src/utils/matchupLineups.ts';
import { teamsFor } from '../src/utils/boardSides.ts';

/**
 * The board's detail view is two lineups read against each other, so every
 * guard here is about a player ending up under the wrong name, the wrong
 * slot, or the wrong number - the three ways a side-by-side lineup lies.
 */

const players = {
  a1: { name: 'Jalen Hurts', team: 'PHI', position: 'QB', injuryStatus: null },
  a2: { name: 'Bijan Robinson', team: 'ATL', position: 'RB', injuryStatus: null },
  a3: { name: 'Trey McBride', team: 'ARI', position: 'TE', injuryStatus: 'Questionable' },
  a4: { name: 'Jaxon Smith-Njigba', team: 'SEA', position: 'WR', injuryStatus: null },
};

const labels = ['QB', 'RB', 'TE'];

test('slot labels come from the league by index, and a lineup longer than the list spills to FLEX', () => {
  const lineup = buildLineup({
    starters: ['a1', 'a2', 'a3', 'a4'],
    labels,
    players,
    means: {},
  });

  assert.deepEqual(
    lineup.map((entry) => entry.slot),
    ['QB', 'RB', 'TE', 'FLEX'],
  );
  assert.deepEqual(
    lineup.map((entry) => entry.name),
    ['Jalen Hurts', 'Bijan Robinson', 'Trey McBride', 'Jaxon Smith-Njigba'],
  );
});

test('an unset slot is empty, not a player projected to score nothing', () => {
  for (const emptyId of ['', '0', '-1']) {
    const [entry] = buildLineup({ starters: [emptyId], labels, players, means: {} });
    assert.equal(entry.playerId, null, `${emptyId} was treated as a real player id`);
    assert.equal(
      entry.projection,
      null,
      `an empty ${emptyId} slot produced a number, which the board would print as a projection`,
    );
  }
});

test('the engine mean is the number, and the provider is only a fallback', () => {
  const [withMean] = buildLineup({
    starters: ['a1'],
    labels,
    players,
    means: { a1: { mean: 22.4 } },
    fallback: { a1: 18.0 },
  });
  assert.equal(withMean.projection, 22.4);

  const [withoutMean] = buildLineup({
    starters: ['a1'],
    labels,
    players,
    means: {},
    fallback: { a1: 18.0 },
  });
  assert.equal(withoutMean.projection, 18);
});

test('a player nobody priced has no number rather than a zero', () => {
  const [entry] = buildLineup({ starters: ['a1'], labels, players, means: {} });
  assert.equal(
    entry.projection,
    null,
    'an unpriced starter came back as a number, so the board would print a projection nobody made',
  );
});

test('a player the catalog has never heard of still renders in the slot', () => {
  const [entry] = buildLineup({ starters: ['zzz'], labels, players, means: {} });
  assert.equal(entry.playerId, 'zzz');
  assert.equal(entry.slot, 'QB');
  assert.match(entry.name, /zzz/);
});

test('the injury tag survives the trip, because it is why a starter is priced low', () => {
  const [entry] = buildLineup({
    starters: ['a3'],
    labels: ['TE'],
    players,
    means: { a3: { mean: 4.1 } },
  });
  assert.equal(entry.injuryStatus, 'Questionable');
});

const entry = (over = {}) => ({
  slot: 'QB',
  playerId: 'x',
  name: 'X',
  position: 'QB',
  team: 'PHI',
  injuryStatus: null,
  projection: 10,
  ...over,
});

test('the slot edge goes to the higher projection, and to nobody on a tie', () => {
  const [higherLeft] = pairLineups([entry({ projection: 14 })], [entry({ projection: 9 })]);
  assert.equal(higherLeft.edge, 'left');

  const [higherRight] = pairLineups([entry({ projection: 9 })], [entry({ projection: 14 })]);
  assert.equal(higherRight.edge, 'right');

  const [tied] = pairLineups([entry({ projection: 12 })], [entry({ projection: 12 })]);
  assert.equal(tied.edge, null);
});

test('an edge over an unknown is not an edge', () => {
  const [againstNull] = pairLineups([entry({ projection: 14 })], [entry({ projection: null })]);
  assert.equal(
    againstNull.edge,
    null,
    'a slot was marked stronger than a slot with no number in it',
  );

  const [againstMissing] = pairLineups([entry({ projection: 14 })], []);
  assert.equal(againstMissing.edge, null);
});

test('a lineup shorter than the other still renders every row of the longer one', () => {
  const rows = pairLineups(
    [entry({ slot: 'QB' }), entry({ slot: 'RB' }), entry({ slot: 'TE' })],
    [entry({ slot: 'QB' })],
  );
  assert.equal(rows.length, 3, 'the pairing truncated to the shorter lineup');
  assert.equal(rows[1].left?.slot, 'RB');
  assert.equal(rows[1].right, null);
  assert.equal(rows[1].slot, 'RB', 'a row with only a left side lost its slot label');

  const mirrored = pairLineups([entry({ slot: 'QB' })], [entry({ slot: 'QB' }), entry({ slot: 'RB' })]);
  assert.equal(mirrored.length, 2);
  assert.equal(mirrored[1].left, null);
  assert.equal(mirrored[1].slot, 'RB');
});

/**
 * The seating guard.
 *
 * teamsFor sorts the favourite to the left, so on any game where team B is
 * favoured the two teams swap seats. Every number already follows the team
 * across that swap; the lineups have to as well, or one team's players
 * appear under the other team's name - which is the same defect the spread
 * shipped with, in a form that is much harder to spot because the numbers
 * still look plausible.
 */
test('a lineup follows its team across the seating swap', () => {
  const teamAStarters = [entry({ name: 'A player' })];
  const teamBStarters = [entry({ name: 'B player' })];

  const bIsFavourite = {
    teamA: 'Underdogs',
    teamARecord: '3-9',
    teamAOdds: 240,
    teamAWinProb: 29.4,
    teamAStarters,
    teamB: 'Chalk',
    teamBRecord: '9-3',
    teamBOdds: -300,
    teamBWinProb: 70.6,
    teamBStarters,
    isUserGame: false,
  };

  const { left, right } = teamsFor(bIsFavourite);
  assert.equal(left.name, 'Chalk', 'the fixture no longer swaps seats, so it proves nothing');
  assert.equal(
    left.starters?.[0].name,
    'B player',
    "the left seat is showing the other team's lineup",
  );
  assert.equal(right.starters?.[0].name, 'A player');
});
