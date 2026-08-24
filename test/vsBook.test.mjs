import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closingLine,
  closingSpread,
  covered,
  formatVsBook,
  vsBookRecords,
} from '../src/utils/vsBook.ts';

/**
 * "Does this team beat the number" is the one question only a book can ask.
 *
 * It has to be graded on the margin. A moneyline says who was favoured and a
 * final score says who won, so a record built from those two collapses back
 * into plain wins and losses and adds nothing to the table it sits in. Against
 * the closing spread, a 2-6 team can be 5-3 — and that gap is the column.
 */

const snap = (computedAt, week, sides) => ({
  computedAt,
  week,
  lines: [{ matchupId: 1, sides }],
});

const HISTORY = [
  snap(10, 3, { '1': { moneyline: -140, winProbability: 58, spread: -3.5 }, '2': { moneyline: 140, winProbability: 42, spread: 3.5 } }),
  /* The line moved before kickoff; the LAST price of the week is the close. */
  snap(20, 3, { '1': { moneyline: -180, winProbability: 64, spread: -6.5 }, '2': { moneyline: 180, winProbability: 36, spread: 6.5 } }),
];

const matchupIdFor = () => 1;

test('the close is the last price of the week, not the first', () => {
  assert.equal(closingLine(HISTORY, 3).computedAt, 20);
  assert.equal(closingSpread(HISTORY, 3, 1, '1'), -6.5);
  assert.equal(closingSpread(HISTORY, 3, 1, '2'), 6.5);
});

test('a favourite has to clear its own number, not merely win', () => {
  /* Laying 6.5 and winning by 3 is a win on the scoreboard and a loss against
     the number. That divergence is the whole reason this column exists. */
  assert.equal(covered(3, -6.5), 'fail');
  assert.equal(covered(10, -6.5), 'cover');
  assert.equal(covered(6.5, -6.5), 'push');
});

test('a dog covers by losing narrowly', () => {
  assert.equal(covered(-3, 6.5), 'cover');
  assert.equal(covered(-10, 6.5), 'fail');
  assert.equal(covered(2, 6.5), 'cover', 'winning outright always clears a plus number');
});

test('covering as a favourite and as a dog count the same', () => {
  /* Whether you were expected to win is already inside the spread. The only
     question left is whether you cleared it. */
  const results = [
    { week: 3, rosterId: '1', points: 110, opponentPoints: 100 },
    { week: 3, rosterId: '2', points: 100, opponentPoints: 110 },
  ];
  const records = vsBookRecords(HISTORY, results, matchupIdFor);
  const fav = records.find((r) => r.rosterId === '1');
  const dog = records.find((r) => r.rosterId === '2');

  /* Favourite laid 6.5 and won by 10: covered. Dog took 6.5 and lost by 10:
     did not. Both graded, one cover each way. */
  assert.equal(fav.covers, 1);
  assert.equal(fav.fails, 0);
  assert.equal(dog.covers, 0);
  assert.equal(dog.fails, 1);
});

test('vs Book genuinely disagrees with the scoreboard', () => {
  /* The favourite wins the game and loses against the number. If this ever
     starts agreeing with Record, the column has stopped measuring anything. */
  const results = [{ week: 3, rosterId: '1', points: 103, opponentPoints: 100 }];
  const record = vsBookRecords(HISTORY, results, matchupIdFor)[0];
  assert.equal(record.covers, 0, 'won by 3 laying 6.5 is not a cover');
  assert.equal(record.fails, 1);
});

test('no stored spread means no verdict, never a guess', () => {
  /* Snapshots taken before spreads were persisted have none. Falling back to
     who won would quietly turn this column into a copy of Record. */
  const old = [snap(10, 3, { '1': { moneyline: -140, winProbability: 58 } })];
  const results = [{ week: 3, rosterId: '1', points: 130, opponentPoints: 100 }];
  assert.deepEqual(vsBookRecords(old, results, matchupIdFor), []);
  assert.equal(closingSpread(old, 3, 1, '1'), null);
});

test('a team with nothing graded is omitted, not shown as 0-0', () => {
  /* 0-0 reads as "never beaten the number", which is a claim. Absent is the
     truth. */
  assert.equal(formatVsBook(null), null);
  assert.equal(formatVsBook({ rosterId: '1', covers: 0, fails: 0, pushes: 0, graded: 0 }), null);
  assert.equal(formatVsBook({ rosterId: '1', covers: 5, fails: 3, pushes: 0, graded: 8 }), '5-3');
  assert.equal(formatVsBook({ rosterId: '1', covers: 5, fails: 3, pushes: 1, graded: 9 }), '5-3-1');
});

test('a push is neither a cover nor a fail, and still counts as graded', () => {
  const results = [{ week: 3, rosterId: '1', points: 106.5, opponentPoints: 100 }];
  const record = vsBookRecords(HISTORY, results, matchupIdFor)[0];
  assert.equal(record.pushes, 1);
  assert.equal(record.covers, 0);
  assert.equal(record.fails, 0);
  assert.equal(record.graded, 1);
});
