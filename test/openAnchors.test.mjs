import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMovePp,
  latestSnapshot,
  seasonOpen,
  titleMovement,
  weekMovement,
  weekOpen,
} from '../src/utils/openAnchors.ts';

/**
 * Movement is only meaningful against an anchor, and there are two anchors that
 * are easy to mix up: the first price of THIS WEEK, which resets weekly and is
 * what the board measures against, and the first price of the SEASON, which
 * never resets and is what the ticket and the futures Open column measure
 * against. Reading the wrong one produces numbers that look fine and are wrong.
 */

const entry = (computedAt, week, opts = {}) => ({
  computedAt,
  week,
  trigger: opts.trigger,
  lines: opts.lines,
  titleOdds: opts.titleOdds,
  titleProb: opts.titleProb,
});

const line = (matchupId, a, b) => ({
  matchupId,
  sides: {
    '1': { moneyline: a.ml, winProbability: a.p },
    '2': { moneyline: b.ml, winProbability: b.p },
  },
});

const HISTORY = [
  entry(100, 1, { trigger: 'line opened', titleOdds: { '1': 900, '2': -110 }, titleProb: { '1': 10, '2': 47.6 } }),
  entry(200, 1, { titleOdds: { '1': 800, '2': -120 }, titleProb: { '1': 11.1, '2': 54.5 } }),
  entry(300, 2, { trigger: 'weekly roll', lines: [line(7, { ml: -120, p: 55 }, { ml: 120, p: 45 })] }),
  entry(400, 2, { lines: [line(7, { ml: -146, p: 59 }, { ml: 146, p: 41 })] }),
  entry(500, 2, { lines: [line(7, { ml: -160, p: 61 }, { ml: 160, p: 39 })], titleOdds: { '1': 475, '2': -130 }, titleProb: { '1': 17.4, '2': 56.5 } }),
];

test('the week open is the first price of that week, not of the season', () => {
  assert.equal(weekOpen(HISTORY, 2).computedAt, 300);
  assert.equal(weekOpen(HISTORY, 1).computedAt, 100);
  assert.equal(weekOpen(HISTORY, 9), null, 'a week with no snapshot has no open');
});

test('the season open is the first price ever, and never resets', () => {
  assert.equal(seasonOpen(HISTORY).computedAt, 100);
  assert.equal(latestSnapshot(HISTORY).computedAt, 500);
});

test('order decides an open, not the trigger label', () => {
  /* A league whose history was trimmed, or that predates the trigger
     vocabulary, still has an earliest entry — and that is what an open is.
     Requiring trigger === 'weekly roll' would leave those leagues with no
     anchor and therefore no movement anywhere. */
  const untagged = [entry(10, 3, { lines: [line(1, { ml: -110, p: 52 }, { ml: 110, p: 48 })] })];
  assert.equal(weekOpen(untagged, 3).computedAt, 10);
  assert.equal(seasonOpen(untagged).computedAt, 10);
});

test('history that is not in order still resolves correctly', () => {
  const shuffled = [HISTORY[4], HISTORY[0], HISTORY[3], HISTORY[1], HISTORY[2]];
  assert.equal(seasonOpen(shuffled).computedAt, 100);
  assert.equal(weekOpen(shuffled, 2).computedAt, 300);
  assert.equal(latestSnapshot(shuffled).computedAt, 500);
});

test('board movement measures against this week open', () => {
  const moves = weekMovement(HISTORY, 2);
  const home = moves.find((move) => move.rosterId === '1');

  /* 55% at the open, 61% now. Six percentage points, not "eleven percent". */
  assert.equal(home.openWinProbability, 55);
  assert.equal(home.nowWinProbability, 61);
  assert.ok(Math.abs(home.movePp - 6) < 1e-9);
  assert.equal(home.openMoneyline, -120);
  assert.equal(home.nowMoneyline, -160);

  /* Both sides move, and they move opposite ways. */
  const away = moves.find((move) => move.rosterId === '2');
  assert.ok(Math.abs(away.movePp + 6) < 1e-9);
});

test('no open means no movement, not zero movement', () => {
  /* Zero is a claim that the line has not moved. Absent is a different
     statement and the only honest one when there is nothing to compare to. */
  assert.deepEqual(weekMovement(HISTORY, 9), []);
  assert.deepEqual(weekMovement([HISTORY[2]], 2), [], 'a single snapshot is an open with no "now"');
  assert.deepEqual(titleMovement([HISTORY[0]]), []);
});

test('title movement runs season open to now, skipping the weekly reset', () => {
  const moves = titleMovement(HISTORY);
  const you = moves.find((move) => move.rosterId === '1');

  assert.equal(you.openOdds, 900, 'must anchor to the season open, not week 2');
  assert.equal(you.nowOdds, 475);
  assert.ok(Math.abs(you.movePp - 7.4) < 1e-9, `expected +7.4pp, got ${you.movePp}`);
});

test('a team absent from the opening book is omitted, not anchored to today', () => {
  const withNewcomer = [
    entry(10, 1, { titleOdds: { '1': 500 }, titleProb: { '1': 16 } }),
    entry(20, 2, { titleOdds: { '1': 400, '9': 2000 }, titleProb: { '1': 20, '9': 4 } }),
  ];
  const moves = titleMovement(withNewcomer);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].rosterId, '1');
});

test('movement is percentage points, and a flat line prints nothing', () => {
  assert.equal(formatMovePp(2.14), '+2.1');
  assert.equal(formatMovePp(-0.83), '−0.8');

  /* Nine rows of "0.0" is noise that hides the two rows that moved. */
  assert.equal(formatMovePp(0.01), null);
  assert.equal(formatMovePp(0), null);
  assert.equal(formatMovePp(null), null);
});

test('history stored as probability still yields an open price', async () => {
  const { americanFromPercent } = await import('../src/utils/openAnchors.ts');

  /* Snapshots recorded before prices were persisted carry titleProb and no
     titleOdds. Leaving those leagues with a blank Open column would hide real
     history because of the shape it happens to be stored in. Percent to
     American odds is the same conversion the board runs on every live number. */
  const probOnly = [
    { computedAt: 1, week: 1, titleProb: { '1': 10, '2': 60 } },
    { computedAt: 2, week: 2, titleProb: { '1': 17.4, '2': 55 } },
  ];
  const moves = titleMovement(probOnly);
  const you = moves.find((m) => m.rosterId === '1');

  assert.equal(you.openOdds, americanFromPercent(10), 'open price not derived');
  assert.equal(you.nowOdds, americanFromPercent(17.4));
  assert.ok(Math.abs(you.movePp - 7.4) < 1e-9);

  /* +900 at 10%, and a favourite goes negative. Round-trips through the same
     no-vig scale the live board uses. */
  assert.equal(americanFromPercent(10), 900);
  assert.equal(americanFromPercent(50), -100);
  assert.equal(americanFromPercent(60), -150);
});

test('a stored price always beats a derived one', async () => {
  /* If both exist they must agree, and the recorded number is the truth. A
     derived value silently overriding a stored one would quietly rewrite what
     the sim actually quoted. */
  const both = [
    { computedAt: 1, week: 1, titleOdds: { '1': 850 }, titleProb: { '1': 10 } },
    { computedAt: 2, week: 2, titleOdds: { '1': 475 }, titleProb: { '1': 17.4 } },
  ];
  const you = titleMovement(both)[0];
  assert.equal(you.openOdds, 850, 'the stored open price was overwritten by a derived one');
  assert.equal(you.nowOdds, 475);
});
