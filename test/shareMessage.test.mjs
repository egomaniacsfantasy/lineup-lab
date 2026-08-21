import assert from 'node:assert/strict';
import test from 'node:test';
import { hubShareMessage, tradeShareMessage } from '../src/utils/shareMessage.ts';

/**
 * The caption is posted under the user's name, next to a card that already
 * shows the numbers. Two ways it can go wrong: it can say something the card
 * contradicts, or it can read like the product wrote it. Both make it get
 * deleted before it is sent.
 */

const league = { team: 'AVLA', leagueName: 'Egomaniacs Dynasty' };

test('the caption never quotes a number the card is not showing', () => {
  const message = hubShareMessage({ ...league, titleOdds: '+1226', rank: 7, of: 10 });
  assert.match(message, /\+1226/);
  assert.match(message, /7th of 10/);
  assert.match(message, /Egomaniacs Dynasty/);
});

test('an unpriced league does not invent a price', () => {
  const message = hubShareMessage({ ...league, titleOdds: null, rank: null, of: null });
  assert.doesNotMatch(message, /\+|\d+(st|nd|rd|th)/, `invented something: ${message}`);
  assert.match(message, /oddsgods\.net/);
});

test('the favourite and the basement do not get the same sentence', () => {
  const first = hubShareMessage({ ...league, titleOdds: '+261', rank: 1, of: 10 });
  const last = hubShareMessage({ ...league, titleOdds: '+4000', rank: 10, of: 10 });
  assert.notEqual(first, last);
  /* Being the favourite is the one case where bragging is the honest read. */
  assert.match(first, /Shortest price/);
  assert.doesNotMatch(last, /Shortest price/);
});

test('every card carries the address, because that is the point', () => {
  const cases = [
    hubShareMessage({ ...league, titleOdds: '+261', rank: 1, of: 12 }),
    hubShareMessage({ ...league, titleOdds: '+900', rank: 6, of: 12 }),
    hubShareMessage({ ...league, titleOdds: '+4000', rank: 12, of: 12 }),
  ];
  cases.forEach((message) => assert.match(message, /oddsgods\.net/));
});

test('the trade caption names both sides and both prices', () => {
  const message = tradeShareMessage({
    you: 'AVLA',
    them: 'lukewilliams340',
    youGet: ['Jayden Daniels'],
    theyGet: ['Drake Maye'],
    verdict: 'Fair deal',
    yourTitleDelta: '+0.2%',
    theirTitleDelta: '-0.6%',
    bothGain: false,
  });
  assert.match(message, /AVLA/);
  assert.match(message, /lukewilliams340/);
  assert.match(message, /Jayden Daniels/);
  assert.match(message, /Drake Maye/);
  assert.match(message, /\+0\.2%/);
  assert.match(message, /-0\.6%/);
  /* Acceptance is a private read and never travels with the card. */
  assert.doesNotMatch(message, /accept/i);
});

test('a trade only claims both sides gain when both sides gain', () => {
  const base = {
    you: 'AVLA', them: 'luke', youGet: ['A'], theyGet: ['B'], verdict: 'Fair deal',
  };
  const both = tradeShareMessage({
    ...base, yourTitleDelta: '+5.1%', theirTitleDelta: '+4.6%', bothGain: true,
  });
  const oneSided = tradeShareMessage({
    ...base, yourTitleDelta: '+5.1%', theirTitleDelta: '-4.6%', bothGain: false,
  });
  assert.match(both, /both better off/);
  assert.doesNotMatch(oneSided, /both better off/);
});

test('multi-player sides read as a sentence, not an array', () => {
  const message = tradeShareMessage({
    you: 'AVLA', them: 'luke',
    youGet: ['J. Chase', 'T. McBride'],
    theyGet: ['J. Jacobs', 'P. Nacua', 'D. Smith'],
    verdict: 'Steal', yourTitleDelta: '+5.1%', theirTitleDelta: '+1.2%', bothGain: true,
  });
  assert.match(message, /J\. Chase and T\. McBride/);
  assert.match(message, /J\. Jacobs, P\. Nacua and D\. Smith/);
  assert.doesNotMatch(message, /[[\]]/, 'an array leaked into the caption');
});

test('a saved card is named so two of them can be told apart', async () => {
  const { shareFilename } = await import('../src/utils/shareMessage.ts');
  assert.equal(shareFilename('AVLA', 1), 'avla-odds-gods-week-1.png');
  assert.equal(shareFilename("Zeus's Bolts", 8), 'zeus-s-bolts-odds-gods-week-8.png');
  assert.equal(shareFilename('avla', 1, 'trade'), 'avla-odds-gods-trade-week-1.png');
  /* Two cards from the same person in different weeks must not collide, which
     is the whole reason the old constant filename was a problem. */
  assert.notEqual(shareFilename('AVLA', 1), shareFilename('AVLA', 2));
  assert.doesNotMatch(shareFilename('Ré/Mï  Ünicode!!', 3), /[^a-z0-9.-]/);
});

test('a headline reads both sides, not just yours', async () => {
  const { tradeCardHeadline } = await import('../src/utils/tradeVerdict.ts');
  /* The case that prompted this: both managers gain on both metrics and the
     old one-sided verdict called it "Fair", the least interesting true thing
     about it. */
  assert.equal(tradeCardHeadline(0.6, 1.1), 'Both sides win');
  assert.equal(tradeCardHeadline(5.2, -1.0), 'Steal');
  assert.equal(tradeCardHeadline(-2.0, 3.0), 'Overpay');
  assert.equal(tradeCardHeadline(0.2, -0.4), 'Fair deal');
  /* A gain for you at the partner's expense is never "both sides win". */
  assert.notEqual(tradeCardHeadline(4.5, -3.0), 'Both sides win');
});
