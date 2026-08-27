import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const TRADE_PAGE = 'src/pages/TradePage.tsx';

/**
 * "Price this trade" must never do nothing.
 *
 * Andre reported building a trade, pressing the button and getting no
 * response at all. There were three ways to reach that, and the screen looked
 * identical in all of them:
 *
 *   1. The pricing request rejected. Its .catch discarded the error, so
 *      `result` stayed null — and null is neither priced nor unavailable, so
 *      the panel below rendered nothing.
 *   2. The season-impact request failed. Its error had exactly one home, the
 *      analyzer panel, which lives INSIDE the block that only renders once
 *      both calls have succeeded. The explanation was gated behind the thing
 *      it was explaining.
 *   3. Pricing succeeded and the analysis did not. Neither branch matched, so
 *      again: nothing.
 *
 * In every case the loader flashed and the screen went back to how it was,
 * which is indistinguishable from a dead button.
 */

async function source() {
  return fs.readFile(path.resolve(TRADE_PAGE), 'utf8');
}

test('the pricing error is kept, not thrown away', async () => {
  const text = await source();

  /* The exact shape of the bug: a catch that swallows. */
  assert.doesNotMatch(
    text,
    /priceTrade\([\s\S]{0,400}?\.catch\(\(\) => \{\}\)/,
    'the pricing failure is being discarded again',
  );
  assert.match(text, /setPriceError\(/, 'nothing records why pricing failed');
});

test('a failure renders outside the success branch', async () => {
  const text = await source();

  /* The whole point. A message that only appears once everything worked
     cannot report that something did not work. */
  const verdictStart = text.indexOf('{verdictReady &&');
  const failureStart = text.indexOf('trade-cc__failure');
  assert.ok(verdictStart > 0, 'the verdict block moved or was renamed');
  assert.ok(failureStart > verdictStart, 'the failure state is gone');

  /* It is its own branch of the same ternary, not nested inside the verdict
     section: the branch is introduced after the verdict block closes. */
  assert.match(text, /\) : priceError \|\| analysisError \? \(/);
});

test('every failure has a way back', async () => {
  const text = await source();
  assert.match(text, /trade-cc__failure-retry/);
  assert.match(text, /onClick=\{\(\) => void runPricing\(\)\}[\s\S]{0,200}Try again/);
});

test('the heading agrees with the sentence under it', async () => {
  const text = await source();
  /* "This trade did not price" over "the trade priced, but..." is the app
     contradicting itself in two adjacent lines. */
  assert.match(
    text,
    /priceError \? 'This trade did not price\.' : 'Only half of this ran\.'/,
  );
});

test('an unavailable result never tells you to do what you just did', async () => {
  const text = await source();

  /* The fallback printed "pick at least one player on each side" for every
     reason except missing projections — including the reasons that only
     arise with both sides already full, which is the only way to reach it by
     pressing the button. */
  assert.match(
    text,
    /give\.length === 0 \|\| getIds\.length === 0\s*\n?\s*\? 'Pick at least one player on each side/,
    'the empty-sides message is shown regardless of whether the sides are empty',
  );
  assert.match(text, /This trade could not be priced/);
});

test('the failure state is reachable in the design scene', async () => {
  /* It was not, which is why this went unnoticed: the fixture answers every
     request successfully, so no amount of clicking around the design pages
     could produce the state a real league reaches on a timeout. */
  const fixtures = await fs.readFile(path.resolve('src/dev/designFixtures.ts'), 'utf8');
  assert.match(fixtures, /failTrade/);
  /* Read at import, not on first use: the builder rewrites the query string
     from its own state on mount, so a lazily-read switch is already gone by
     the time the request it governs is made. */
  assert.match(fixtures, /const failTradeMode: string \| null =/);
});
