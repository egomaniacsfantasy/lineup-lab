import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  availableWeeks,
  boardAsOf,
  compareToNow,
  receiptSentence,
} from '../src/utils/timeMachine.ts';

/**
 * The receipts feature. Every competitor recomputes and shows today's answer;
 * none keeps what it said last month, so none can be held to it. The entire
 * value here is that the old number is the OLD number — re-simulating the past
 * with today's projections would be an easier feature and a dishonest one.
 */

const HISTORY = [
  { computedAt: 10, week: 1, titleOdds: { '1': 900, '2': 400 }, titleProb: { '1': 10, '2': 20 } },
  { computedAt: 20, week: 3, titleOdds: { '1': 1100, '2': 350 }, titleProb: { '1': 8.3, '2': 22 } },
  /* Two snapshots in week 3: the later one is the close. */
  { computedAt: 30, week: 3, titleOdds: { '1': 1000, '2': 360 }, titleProb: { '1': 9.1, '2': 21.7 } },
  { computedAt: 40, week: 9, titleOdds: { '1': 475, '2': 500 }, titleProb: { '1': 17.4, '2': 16.7 } },
];

test('only weeks we actually priced are offered', () => {
  /* A season that began before we were pricing it has no early weeks, and
     interpolating them would fabricate the very receipts this exists to make
     trustworthy. */
  assert.deepEqual(availableWeeks(HISTORY), [1, 3, 9]);
  assert.deepEqual(availableWeeks([]), []);
  assert.deepEqual(
    availableWeeks([{ computedAt: 1, week: 4, lines: [] }]),
    [],
    'a snapshot with no futures is not a week the board can be shown for',
  );
});

test('as of a week means that week close, not its open', () => {
  /* "Where the market had you at the end of week 3" is the honest reading:
     that is the number that stood when the week finished. */
  const mark = boardAsOf(HISTORY, 3);
  assert.equal(mark.at, 30);
  assert.equal(mark.prob['1'], 9.1);
  assert.equal(mark.odds['1'], 1000);

  assert.equal(boardAsOf(HISTORY, 7), null, 'a week never priced has no board');
});

test('then against now produces the receipt', () => {
  const deltas = compareToNow(boardAsOf(HISTORY, 3), boardAsOf(HISTORY, 9));
  const you = deltas.find((d) => d.rosterId === '1');

  assert.equal(you.thenProb, 9.1);
  assert.equal(you.nowProb, 17.4);
  assert.equal(you.thenOdds, 1000);
  assert.equal(you.nowOdds, 475);
  assert.ok(Math.abs(you.movePp - 8.3) < 1e-9);

  /* And it runs the other way for a team that faded. */
  const them = deltas.find((d) => d.rosterId === '2');
  assert.ok(them.movePp < 0);
});

test('a team missing from one board is reported, not dropped', () => {
  /* "This team was not on the board in week 3" is itself a fact worth
     rendering. */
  const then = { week: 3, at: 30, odds: { '1': 1000 }, prob: { '1': 9.1 } };
  const now = { week: 9, at: 40, odds: { '1': 475, '9': 3000 }, prob: { '1': 17.4, '9': 3 } };
  const deltas = compareToNow(then, now);

  const newcomer = deltas.find((d) => d.rosterId === '9');
  assert.ok(newcomer, 'the newcomer was dropped');
  assert.equal(newcomer.thenProb, null);
  assert.equal(newcomer.movePp, null, 'no move can be claimed against a board it was not on');
});

test('the sentence is quotable and states the finding', () => {
  const deltas = compareToNow(boardAsOf(HISTORY, 3), boardAsOf(HISTORY, 9));
  const line = receiptSentence(deltas.find((d) => d.rosterId === '1'), "Zeus's Bolts", 3);

  assert.match(line, /was 9\.1% after Week 3/);
  assert.match(line, /Now 17\.4%, up 8\.3 percentage points/);

  /* Nothing to say when either side is missing. */
  assert.equal(receiptSentence(null, 'X', 3), null);
  assert.equal(
    receiptSentence({ rosterId: '9', thenProb: null, nowProb: 3, thenOdds: null, nowOdds: 3000, movePp: null }, 'X', 3),
    null,
  );
});

test('the past is read, never re-simulated', async () => {
  const source = await fs.readFile(path.resolve('src/utils/timeMachine.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  /* Checked with comments stripped: the note explaining that we must not
     re-simulate is not the same as re-simulating. The module may only read
     stored snapshots. */
  for (const banned of ['simulate', 'monteCarlo', 'interpolat']) {
    assert.doesNotMatch(code, new RegExp(banned, 'i'), `the time machine references "${banned}"`);
  }
});
