import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { sameTrades, tradePage } from '../src/utils/tradeRotation.ts';

const MATCHUP = 'src/pages/MatchupPage.tsx';

test('a refresh never leaves the same trade on screen', () => {
  /**
   * The rule Andre asked for, and the reason it is pages rather than steps.
   *
   * Advancing by one would keep two of the three trades exactly where they
   * were. You press refresh because you did not want what you were looking
   * at, and being shown most of it again reads as a broken control.
   */
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'];

  const first = tradePage(pool, 0, 3);
  const second = tradePage(pool, 1, 3);

  assert.deepEqual(first.visible, ['a', 'b', 'c']);
  assert.deepEqual(second.visible, ['d', 'e', 'f']);

  const overlap = first.visible.filter((trade) => second.visible.includes(trade));
  assert.deepEqual(overlap, [], `refresh kept ${overlap.join(', ')} on screen`);
});

test('paging past the end wraps rather than emptying the rail', () => {
  const pool = ['a', 'b', 'c', 'd'];
  const wrapped = tradePage(pool, 2, 3);

  /* Two pages here: [a b c] and [d]. The third press returns to the top. */
  assert.equal(wrapped.pages, 2);
  assert.equal(wrapped.page, 0);
  assert.deepEqual(wrapped.visible, ['a', 'b', 'c']);
});

test('a pool too small to rotate says so instead of pretending', () => {
  /* This is what decides whether the button rotates locally or goes back to
     the engine. Getting it wrong means a button that redraws the identical
     three trades, which is the exact failure being fixed. */
  assert.equal(tradePage(['a', 'b'], 0, 3).exhausted, true);
  assert.equal(tradePage(['a', 'b', 'c'], 0, 3).exhausted, true);
  assert.equal(tradePage(['a', 'b', 'c', 'd'], 0, 3).exhausted, false);
  assert.equal(tradePage([], 0, 3).exhausted, true);
});

test('an empty pool is empty, not a crash', () => {
  const empty = tradePage([], 3, 3);
  assert.deepEqual(empty.visible, []);
  assert.equal(empty.pages, 0);
});

test('sameTrades compares by key, in order', () => {
  assert.equal(sameTrades(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameTrades(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameTrades(['a'], ['a', 'b']), false);
});

test('the refresh sits on the trades, not on the start/sit call', async () => {
  const source = await fs.readFile(path.resolve(MATCHUP), 'utf8');

  /* A start/sit answer moves when projections move, not when you ask again,
     so the button there mostly redrew the same two names and taught people
     the control did nothing. */
  const head = source.slice(
    source.indexOf('matchup-page__module--rail-call'),
    source.indexOf('matchup-page__rail-call-swap'),
  );
  assert.ok(head.length > 0, 'the rail-call module moved or was renamed');
  assert.doesNotMatch(head, /matchup-page__market-refresh/, 'the rescan is back on start/sit');

  assert.match(source, /matchup-page__adds-refresh/, 'the trades have no refresh');
  assert.match(source, /aria-label="Show different trades"/);
});

test('start/sit reprices on a timer, and only when someone is looking', async () => {
  const source = await fs.readFile(path.resolve(MATCHUP), 'utf8');

  assert.match(source, /const BACKGROUND_SCAN_MS = 10 \* 60 \* 1000;/);
  assert.match(source, /window\.setInterval\(tick, BACKGROUND_SCAN_MS\)/);
  /* A Hub left open in a background tab overnight has nobody to stay current
     for, and every tick is a real request. */
  assert.match(source, /document\.visibilityState !== 'visible'/);
  assert.match(source, /window\.clearInterval\(timer\)/);
});

test('the card is a filled control on the season bar, not a caption', async () => {
  const source = await fs.readFile(path.resolve(MATCHUP), 'utf8');
  const css = await fs.readFile(path.resolve('src/pages/MatchupPage.css'), 'utf8');

  /* It was a hairline pill between the spread and the total, at the same
     weight as the captions either side of it, and early users could not find
     it. The ones who did liked what was behind it, so the problem was that
     nothing said there was anything behind it. */
  /* The rendered label, not any mention of it: the comment above the button
     quotes the old wording to explain why it changed. */
  assert.doesNotMatch(source, />\s*Share your card\s*</, 'the old label is back');
  assert.match(source, />\s*Your card\s*</);
  assert.match(source, /<SeasonBand\s+action=\{/, 'the card is not on the season bar');

  const rule = css.slice(css.indexOf('.matchup-page__share {'));
  assert.match(rule.slice(0, 400), /background: var\(--amber\)/, 'the card button is unfilled again');
});
