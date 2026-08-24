import assert from 'node:assert/strict';
import test from 'node:test';
import { leagueRecords, NO_RECORD_YET } from '../src/utils/leagueRecords.ts';

/**
 * A record book written in prices. Every league already knows its high score;
 * none of them has "the longest shot that ever came in", because none of them
 * keeps what it quoted.
 *
 * Records start at our install date and grow. Nothing is backfilled or
 * inferred from a season we were not pricing: a record book that quietly
 * starts with fiction is worth less than an empty one, because an empty one
 * becomes true the moment the first game finishes.
 */

const side = (p) => ({ moneyline: 0, winProbability: p });

const HISTORY = [
  { computedAt: 1, week: 1, lines: [{ matchupId: 10, sides: { '1': side(22), '2': side(78) } }] },
  { computedAt: 2, week: 2, lines: [{ matchupId: 20, sides: { '1': side(91), '2': side(9) } }] },
];

const GAMES = [
  /* The 22% dog wins: the longest shot so far. */
  { week: 1, matchupId: 10, rosterId: '1', opponentRosterId: '2', points: 120, opponentPoints: 110 },
  { week: 1, matchupId: 10, rosterId: '2', opponentRosterId: '1', points: 110, opponentPoints: 120 },
  /* The 91% favourite loses: the worst beat so far. */
  { week: 2, matchupId: 20, rosterId: '1', opponentRosterId: '2', points: 99, opponentPoints: 140 },
  { week: 2, matchupId: 20, rosterId: '2', opponentRosterId: '1', points: 140, opponentPoints: 99 },
];

const nameFor = (id) => ({ '1': 'Zeus', '2': 'Hera' })[id] ?? null;

test('the longest shot is the smallest closing price that still won', () => {
  const records = leagueRecords(HISTORY, GAMES, nameFor);
  const shot = records.find((r) => r.id === 'longest-shot');

  /* Two upsets in this fixture: a 22% dog in week 1 and a 9% dog in week 2.
     The record is the LONGEST shot, so it has to be the 9% one — the first
     version of this test expected the week 1 winner and the code was right. */
  assert.equal(shot.holder, 'Hera');
  assert.match(shot.value, /^\+\d+$/, 'a longshot record is a price');
  assert.match(shot.detail, /Week 2/);
  assert.match(shot.detail, /priced at 9\.0%/);
});

test('the worst beat is the highest closing price that lost', () => {
  const records = leagueRecords(HISTORY, GAMES, nameFor);
  const beat = records.find((r) => r.id === 'worst-beat');
  assert.equal(beat.holder, 'Zeus', '91% and lost');
  assert.equal(beat.value, '91.0%');
  assert.match(beat.detail, /lost 99\.0 to 140\.0/);
});

test('the high score does not need a stored price', () => {
  /* Scores are on the scoreboard whether or not we were pricing that week. */
  const records = leagueRecords([], GAMES, nameFor);
  const high = records.find((r) => r.id === 'highest-score');
  assert.equal(high.holder, 'Hera');
  assert.equal(high.value, '140.0');

  /* But the priced records genuinely cannot be known without history. */
  assert.equal(records.find((r) => r.id === 'longest-shot').holder, null);
  assert.equal(records.find((r) => r.id === 'worst-beat').holder, null);
});

test('an empty league yields records with no holders, not invented ones', () => {
  const records = leagueRecords([], [], nameFor);
  assert.equal(records.length, 3);
  for (const record of records) {
    assert.equal(record.holder, null);
    assert.equal(record.value, null);
    assert.equal(record.detail, null);
    assert.ok(record.label, 'the record is still named, so the book reads as a book');
  }
  assert.equal(NO_RECORD_YET, 'No holder yet');
});

test('a team that cannot be named is skipped, never shown as an id', () => {
  const records = leagueRecords(HISTORY, GAMES, () => null);
  for (const record of records) {
    assert.equal(record.holder, null);
    assert.equal(record.value, null, 'a value without a holder is a record nobody holds');
  }
});
