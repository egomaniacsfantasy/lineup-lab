import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  EVEN_MONEY_PROBABILITY,
  americanFromProbability,
  conflictingLeg,
  legKey,
  moneylineLeg,
  parlayPrice,
  parlayProbability,
  removeLeg,
  spreadLeg,
  toggleLeg,
  totalLeg,
} from '../src/utils/parlay.ts';

const game = (matchupId, matchupLabel) => ({ matchupId, matchupLabel });

const sonicMoneyline = moneylineLeg({
  ...game(7101, 'Sonic and Knuckles vs Adam’s Astounding Team'),
  selection: 'a',
  teamName: 'Sonic and Knuckles',
  price: -113,
});
const adamMoneyline = moneylineLeg({
  ...game(7101, 'Sonic and Knuckles vs Adam’s Astounding Team'),
  selection: 'b',
  teamName: 'Adam’s Astounding Team',
  price: 113,
});
const sonicSpread = spreadLeg({
  ...game(7101, 'Sonic and Knuckles vs Adam’s Astounding Team'),
  selection: 'a',
  teamName: 'Sonic and Knuckles',
  line: '-2.9',
});
const sonicOver = totalLeg({ ...game(7101, 'Sonic vs Adam'), selection: 'over', total: 239.5 });
const zeusMoneyline = moneylineLeg({
  ...game(7102, 'Zeus’s Bolts vs Waiver Wire Warriors'),
  selection: 'a',
  teamName: 'Zeus’s Bolts',
  price: -186,
});
const zeusSpread = spreadLeg({
  ...game(7102, 'Zeus’s Bolts vs Waiver Wire Warriors'),
  selection: 'a',
  teamName: 'Zeus’s Bolts',
  line: '-9.4',
});

test('a spread and a total are even money, because the line is the middle', () => {
  assert.equal(sonicSpread.probability, EVEN_MONEY_PROBABILITY);
  assert.equal(sonicOver.probability, EVEN_MONEY_PROBABILITY);
  /* +100 and never -100, which is the house convention everywhere else. */
  assert.equal(sonicSpread.price, 100);
  assert.equal(sonicOver.price, 100);
});

test('a moneyline leg is worth exactly what its own quoted price says', () => {
  /* The slip has to survive being checked by hand against the cards. */
  assert.ok(Math.abs(sonicMoneyline.probability - 113 / 213) < 1e-9);
  assert.equal(americanFromProbability(sonicMoneyline.probability), -113);
  assert.equal(americanFromProbability(adamMoneyline.probability), 113);
});

test('two even-money legs from different games pay +300, not a book’s +260', () => {
  const legs = [sonicSpread, zeusSpread];
  assert.equal(parlayProbability(legs), 0.25);
  assert.equal(parlayPrice(legs), 300);

  /* Four of them: 6.25%, which is +1500 fair. A book paying +1200 on this is
     the difference this product exists to show. */
  const four = [
    sonicSpread,
    zeusSpread,
    spreadLeg({ ...game(7103, 'C vs D'), selection: 'a', teamName: 'C', line: '-1.0' }),
    spreadLeg({ ...game(7104, 'E vs F'), selection: 'b', teamName: 'F', line: '+1.0' }),
  ];
  assert.equal(parlayProbability(four), 0.0625);
  assert.equal(parlayPrice(four), 1500);
});

test('one leg prices as itself, and an empty slip has no price at all', () => {
  assert.equal(parlayPrice([sonicMoneyline]), -113);
  assert.equal(parlayPrice([]), null);
  assert.equal(parlayProbability([]), null);
});

test('a favourite-heavy parlay is still a favourite', () => {
  const legs = [zeusMoneyline, moneylineLeg({ ...game(7105, 'G vs H'), selection: 'a', teamName: 'G', price: -400 })];
  const price = parlayPrice(legs);
  assert.ok(price < 0, `two favourites priced ${price}, which is not a favourite`);
  /* 65.03% x 80% = 52.03%, so a shade odds-on. */
  assert.ok(price > -120 && price < -100, `expected a shade odds-on, got ${price}`);
});

test('a long parlay stays a finite number instead of running to infinity', () => {
  const legs = Array.from({ length: 40 }, (_, index) =>
    spreadLeg({ ...game(8000 + index, `game ${index}`), selection: 'a', teamName: `T${index}`, line: '-1.0' }),
  );
  const price = parlayPrice(legs);
  assert.ok(Number.isFinite(price), `a 40-leg slip priced ${price}`);
  assert.ok(price > 0);
});

test('tapping the same selection twice takes it back off', () => {
  const once = toggleLeg([], sonicMoneyline);
  assert.equal(once.length, 1);
  assert.deepEqual(toggleLeg(once, sonicMoneyline), []);
});

/**
 * The rule that matters.
 *
 * Andre named three: no over AND under, no both sides of a moneyline, no both
 * sides of a spread. All three are real, and all three are covered by the
 * broader one - because the pairs he did not name are the dangerous ones. A
 * moneyline and a spread on the SAME game are not just correlated, they are
 * nearly the same bet, and multiplying them misprices by a factor of two.
 */
for (const [name, first, second] of [
  ['both sides of a moneyline', sonicMoneyline, adamMoneyline],
  ['a moneyline and a spread on one game', sonicMoneyline, sonicSpread],
  ['a spread and a total on one game', sonicSpread, sonicOver],
  ['a total and a moneyline on one game', sonicOver, sonicMoneyline],
]) {
  test(`a slip cannot hold ${name}`, () => {
    const slip = toggleLeg(toggleLeg([], first), second);
    assert.equal(slip.length, 1, `${name} both survived onto the slip`);
    assert.equal(legKey(slip[0]), legKey(second), 'the newer tap did not win');
    assert.equal(
      new Set(slip.map((leg) => leg.matchupId)).size,
      slip.length,
      'a game appears twice on the slip',
    );
  });
}

test('replacing one game leaves the others alone', () => {
  const slip = toggleLeg(toggleLeg(toggleLeg([], zeusMoneyline), sonicMoneyline), sonicSpread);
  assert.deepEqual(
    slip.map((leg) => legKey(leg)),
    [legKey(zeusMoneyline), legKey(sonicSpread)],
  );
});

test('the slip says what a tap would cost before it costs it', () => {
  const slip = toggleLeg([], sonicMoneyline);
  assert.equal(conflictingLeg(slip, sonicSpread)?.label, 'Sonic and Knuckles');
  /* The same selection is a toggle, not a conflict. */
  assert.equal(conflictingLeg(slip, sonicMoneyline), null);
  /* A different game is never a conflict. */
  assert.equal(conflictingLeg(slip, zeusSpread), null);
});

test('a leg can be taken off by key', () => {
  const slip = toggleLeg(toggleLeg([], sonicMoneyline), zeusSpread);
  assert.deepEqual(
    removeLeg(slip, legKey(sonicMoneyline)).map((leg) => legKey(leg)),
    [legKey(zeusSpread)],
  );
});

/**
 * Comments off before scanning.
 *
 * The guard below bans the vocabulary of a stake, and the files it guards
 * explain at length that they do not have one - "there is no stake, no payout
 * and no balance" is the sentence that documents the rule and the sentence
 * that trips it. Scanning the code rather than the prose is the fix; scanning
 * the prose too would only teach the next person to stop writing it down.
 */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

test('no money anywhere in the slip', async () => {
  const sources = await Promise.all(
    [
      'src/utils/parlay.ts',
      'src/components/league/BetSlip.tsx',
      'src/components/league/BetSlip.css',
      'src/hooks/useBetSlip.ts',
      'src/utils/slipText.ts',
    ].map(async (file) => [file, await fs.readFile(path.resolve(file), 'utf8')]),
  );

  for (const [file, raw] of sources) {
    const code = withoutComments(raw);
    /* The stripper has to actually strip, or this test quietly turns into a
       scan of a file with its comments still in it. Every one of these files
       opens with a block comment, and none should survive. */
    assert.ok(raw.includes('/*'), `${file} has no comments, so this check proves nothing`);
    assert.doesNotMatch(code, /\/\*/, `${file}: comments were not stripped`);

    /* A stake turns a settle-it-with-your-friends slip into a gambling
       product. The ticket module carries the same guard for the same reason.
       The dollar pattern ignores template placeholders: `${x}` is everywhere
       in a TSX file and means nothing, `$20` is the thing that must never
       appear. */
    for (const pattern of [
      /\$(?!\{)/,
      /\bwager\b/i,
      /\bstake\b/i,
      /\bpayout\b/i,
      /\bto win\b/i,
      /\bbankroll\b/i,
    ]) {
      assert.doesNotMatch(code, pattern, `${file} mentions money: ${pattern}`);
    }
  }
});

test('the frontend states the assumption it is making, and names the way out', async () => {
  const [source, memo] = await Promise.all([
    fs.readFile(path.resolve('src/utils/parlay.ts'), 'utf8'),
    fs.readFile(path.resolve('docs/parlay-engine-memo.md'), 'utf8'),
  ]);
  /* Multiplying probabilities is a modelling assumption, not arithmetic, and
     an unstated one is how a wrong price outlives the person who wrote it. */
  assert.match(source, /independen/i);
  assert.match(source, /parlay-engine-memo/);
  assert.match(memo, /POST \/api\/league\/:leagueId\/parlay/);
});
