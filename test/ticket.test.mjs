import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildTicket, formatMultiplier, ticketSentence } from '../src/utils/ticket.ts';

/**
 * The ticket is a receipt: a price quoted before any of this happened, shown
 * against the price now. The reference mock for it rendered "$100" as a stake
 * and "$174 CASH-OUT VALUE", which is exactly what this product must never
 * show. Nobody is betting anything, and a dollar figure is the whole
 * difference between a sportsbook-themed product and one that looks like it
 * takes bets.
 */

const HISTORY = [
  { computedAt: 1, week: 1, titleOdds: { '3': 900 }, titleProb: { '3': 10 } },
  { computedAt: 2, week: 4, titleOdds: { '3': 600 }, titleProb: { '3': 14 } },
  { computedAt: 3, week: 9, titleOdds: { '3': 475 }, titleProb: { '3': 17.4 } },
];

test('the ticket anchors to the season open and marks it to today', () => {
  const ticket = buildTicket(HISTORY, 3);
  assert.equal(ticket.openOdds, 900, 'must quote the season open, not a later week');
  assert.equal(ticket.nowOdds, 475);
  assert.equal(ticket.openProb, 10);
  assert.equal(ticket.nowProb, 17.4);
  assert.ok(Math.abs(ticket.movePp - 7.4) < 1e-9);
  assert.equal(ticket.direction, 'up');
});

test('the multiplier is the honest version of a cash-out', () => {
  /* 10% to 17.4% is 1.74x. That ratio is exactly what changed — the
     probability — so it needs no currency to mean something. */
  const ticket = buildTicket(HISTORY, 3);
  assert.ok(Math.abs(ticket.multiplier - 1.74) < 1e-9);
  assert.equal(formatMultiplier(ticket.multiplier), '1.74x');
});

test('a position that got worse reads the same way, quieter', () => {
  const fading = [
    { computedAt: 1, week: 1, titleOdds: { '3': 300 }, titleProb: { '3': 25 } },
    { computedAt: 2, week: 9, titleOdds: { '3': 900 }, titleProb: { '3': 10 } },
  ];
  const ticket = buildTicket(fading, '3');
  assert.equal(ticket.direction, 'down');
  assert.equal(formatMultiplier(ticket.multiplier), '0.40x');
  assert.ok(ticket.movePp < 0);
});

test('nothing honest to show means null, not a placeholder', () => {
  /* A ticket is a receipt. A fabricated one is worse than none. */
  assert.equal(buildTicket(HISTORY, null), null);
  assert.equal(buildTicket(HISTORY, 99), null, 'a team absent from the opening book has no ticket');
  assert.equal(buildTicket([HISTORY[0]], 3), null, 'an open with no "now" is not a position');
  assert.equal(
    buildTicket(
      [
        { computedAt: 1, week: 1, titleOdds: { '3': 900 } },
        { computedAt: 2, week: 9, titleOdds: { '3': 475 } },
      ],
      3,
    ),
    null,
    'no stored probabilities means no multiplier',
  );
  assert.equal(
    buildTicket(
      [
        { computedAt: 1, week: 1, titleOdds: { '3': 100000 }, titleProb: { '3': 0 } },
        { computedAt: 2, week: 9, titleOdds: { '3': 475 }, titleProb: { '3': 17.4 } },
      ],
      3,
    ),
    null,
    'a zero open would divide to infinity and still render as a number',
  );
});

test('the ticket module contains no money anywhere', async () => {
  const source = await fs.readFile(path.resolve('src/utils/ticket.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  /* Checked against the code with comments stripped, because the comment
     explaining that we must not render dollars is not the same as rendering
     them.

     A bare $ is not the test: template literals are full of ${...}. What is
     banned is a dollar sign used as a currency symbol, so the pattern is a $
     that is not opening an interpolation. */
  assert.doesNotMatch(code, /\$(?!\{)/, 'the ticket renders a dollar sign');

  for (const banned of ['cash', 'payout', 'stake', 'wager', 'bankroll', 'units']) {
    assert.doesNotMatch(code, new RegExp(banned, 'i'), `the ticket references "${banned}"`);
  }
});

test('the sentence is about the position, not about the manager', () => {
  const up = ticketSentence(buildTicket(HISTORY, 3), "Zeus's Bolts");
  assert.match(up, /opened at 10\.0% to win it all and is now 17\.4%/);
  assert.match(up, /worth 1\.74x what it opened at/);

  /* It gets screenshotted into a group chat, where gloating ages badly and a
     factual line does not. */
  for (const word of ['crushing', 'lucky', 'unlucky', 'deserve', 'choke']) {
    assert.doesNotMatch(up, new RegExp(word, 'i'));
  }
});

test('the season line is one point per week, not one per snapshot', () => {
  /**
   * What made the first chart useless.
   *
   * History is sampled several times a day. Plotted raw, a ticket six days
   * old produced a jagged line with a shape, and a shape reads as a trend
   * whether or not the season has produced one. Collapsing to the price each
   * week closed at is the difference between a season and intraday noise.
   */
  const sameWeekManyTimes = [
    { computedAt: 10, week: 1, titleProb: { 1: 8.0, 2: 20 } },
    { computedAt: 20, week: 1, titleProb: { 1: 9.4, 2: 20 } },
    { computedAt: 30, week: 1, titleProb: { 1: 8.2, 2: 20 } },
    { computedAt: 40, week: 1, titleProb: { 1: 9.9, 2: 20 } },
    { computedAt: 50, week: 2, titleProb: { 1: 10.5, 2: 20 } },
    { computedAt: 60, week: 2, titleProb: { 1: 11.1, 2: 20 } },
    { computedAt: 70, week: 3, titleProb: { 1: 12.1, 2: 20 } },
  ];

  const ticket = buildTicket(sameWeekManyTimes, 1);
  assert.ok(ticket, 'no ticket built');

  assert.deepEqual(
    ticket.series.map((point) => point.week),
    [1, 2, 3],
    'the series still carries one point per snapshot',
  );
  /* The close, not the open or an average: week 1 saw 8.0 first and 9.9 last. */
  assert.equal(ticket.series[0].prob, 9.9, 'the weekly point is not the week close');
  assert.equal(ticket.series[2].prob, 12.1);
});

test('the season line refuses to draw a trend out of two points', async () => {
  const source = await fs.readFile(
    path.resolve('src/components/league/YourTicket.tsx'),
    'utf8',
  );
  /* Two points and a slope is a line the season has not produced yet, on a
     card whose whole claim is that its numbers are a receipt. */
  assert.match(source, /points\.length < 3/);
});
