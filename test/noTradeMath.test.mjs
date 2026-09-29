import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('the Trades page keeps the finder free of inline odds math and retired scan UI', async () => {
  /* The finder is the ticket in TradeFinder; the page mounts it beside the
     builder. Both surfaces are scanned, since the retired scan UI could come
     back through either. */
  const page = await fs.readFile(path.resolve('src/pages/TradePage.tsx'), 'utf8');
  const finder = await fs.readFile(path.resolve('src/components/trade/TradeFinder.tsx'), 'utf8');
  for (const source of [page, finder]) {
    assert.doesNotMatch(source, /impliedProbability\(/);
    assert.doesNotMatch(source, /Scan the market/);
    assert.doesNotMatch(source, /Why this trade\?/);
  }
  assert.match(page, /<TradeFinder\b/);
  /* The finder's empty state says what was asked and offers a way out,
     rather than an instruction to pick a manager. */
  assert.match(finder, /The book found nothing for that ask/);
  assert.match(finder, /trade-finder__loosen/);
});

test('no-trade-math guard stays branded and scoped to display-only odds pairs', async () => {
  const source = await fs.readFile(path.resolve('src/utils/noTradeMath.ts'), 'utf8');
  assert.match(source, /unique symbol/);
  assert.match(source, /TradeDisplayDelta/);
  assert.match(source, /oddsPairDelta\(before: number, after: number\)/);
});
