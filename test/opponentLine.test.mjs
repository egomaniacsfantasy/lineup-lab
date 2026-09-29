import assert from 'node:assert/strict';
import test from 'node:test';
import { opponentLineFrom, winProbabilityToMoneyline } from '../src/utils/matchupSides.ts';
import { formatAmericanOdds, setOddsFormat } from '../src/utils/formatOdds.ts';

/**
 * The two-team invariant.
 *
 * The Hub used to derive the opponent's price by subtracting a delta measured
 * in odds-space from a baseline price. American odds are not linear, so that
 * produced prices that were not the price of anything, and at the extreme it
 * produced two underdogs in the same game. These are the guards on the
 * replacement.
 */

/* Built from char codes rather than typed: the copy scan walks this tree and
   cannot tell a definition of the character from a use of it. */
const NO_VALUE_MARK = String.fromCharCode(8212);
const CHECK_MARK = String.fromCharCode(10003);

const line = (winProbability, over = {}) => ({
  winProbability,
  projection: 150,
  spread: -6,
  total: 300,
  ...over,
});

test('exactly one side of a game is the favourite, across the whole range', () => {
  for (let p = 1; p <= 99; p += 1) {
    // 50 is the one honest tie: a true coin flip is even money on both sides,
    // which is a book with no favourite rather than a book with two.
    if (p === 50) continue;
    const yours = winProbabilityToMoneyline(p);
    const theirs = opponentLineFrom(line(p)).moneyline;
    assert.ok(
      Math.sign(yours) !== Math.sign(theirs),
      `at ${p}% both sides priced with the same sign: ${yours} / ${theirs}`,
    );
  }
});

test('the two win probabilities sum to 100', () => {
  for (const p of [12.5, 27.8, 50, 61.4, 88.1]) {
    assert.equal(opponentLineFrom(line(p)).winProbability + p, 100);
  }
});

test('the opponent price tracks the opponent probability, not a baseline offset', () => {
  // The reported case: a lineup swap moves you from 72.2% to 78.1%. The
  // opponent must get LONGER, and must stay a plus price.
  const before = opponentLineFrom(line(72.2)).moneyline;
  const after = opponentLineFrom(line(78.1)).moneyline;
  assert.ok(before > 0 && after > 0, `expected plus prices, got ${before} / ${after}`);
  assert.ok(after > before, `opponent should lengthen: ${before} -> ${after}`);
});

test('a coin flip prices both sides at even money', () => {
  const theirs = opponentLineFrom(line(50));
  assert.equal(theirs.winProbability, 50);
  assert.equal(theirs.moneyline, winProbabilityToMoneyline(50));
});

test('spread mirrors and the total is shared', () => {
  const theirs = opponentLineFrom(line(61.4, { spread: -6.6, total: 292.9, projection: 149.8 }));
  assert.equal(theirs.spread, 6.6);
  assert.equal(theirs.total, 292.9);
  assert.equal(theirs.projection, 143.1);
});

test('the price IS the conversion of the probability, at every step', () => {
  // The tightest statement of the fix. Sign agreement alone is too weak: an
  // offset scheme can keep the signs opposite across most of a range and still
  // be quoting a number that is not the price of anything. This pins the value.
  for (let p = 1; p <= 99; p += 1) {
    const theirs = opponentLineFrom(line(p));
    assert.equal(
      theirs.moneyline,
      winProbabilityToMoneyline(theirs.winProbability),
      `at ${p}% the opponent price is not their own probability converted`,
    );
  }
});


test('a decided game reads as decided on BOTH sides', () => {
  /* Week 3, already settled: 143.0 played against 78.4 with 86.8 projected.
     The engine had called it, and the Hub showed

         your side  a check        (the engine's price, past off-the-board)
         their side +9900          (a derived price for a 1% chance)
         the bar    100.0% / 0.0%

     Three numbers, two of which disagree with the third. The derived side was
     clamped to [1%, 99%], so it could never reach off-the-board however decided
     the game was. The guard is the singularity only now, same as the engine. */
  setOddsFormat('american');
  const theirs = opponentLineFrom(line(100));
  assert.equal(theirs.winProbability, 0);
  assert.equal(formatAmericanOdds(theirs.moneyline), NO_VALUE_MARK, 'the losing side still quoted a live price');
  assert.equal(formatAmericanOdds(winProbabilityToMoneyline(100)), CHECK_MARK, 'the winning side is not marked as decided');
});

test('a lopsided game that is NOT decided still quotes a price', () => {
  /* The clamp used to cap everything beyond 99% at -9900, so a 99.5% side and a
     99.0% side printed the same number. Only a genuine 0 or 1 is off the
     board. */
  setOddsFormat('american');
  assert.equal(formatAmericanOdds(winProbabilityToMoneyline(99)), '-9900');
  assert.equal(formatAmericanOdds(winProbabilityToMoneyline(99.5)), '-19900');
  assert.equal(formatAmericanOdds(opponentLineFrom(line(99)).moneyline), '+9900');
});
