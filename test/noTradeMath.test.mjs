import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('TradePage keeps the Deals module free of inline odds math and retired scan UI', async () => {
  const source = await fs.readFile(path.resolve('src/pages/TradePage.tsx'), 'utf8');
  assert.doesNotMatch(source, /impliedProbability\(/);
  assert.doesNotMatch(source, /Scan the market/);
  assert.doesNotMatch(source, /Why this trade\?/);
  assert.match(source, /Pick a manager above to see the book\\'s deals\./);
});

test('no-trade-math guard stays branded and scoped to display-only odds pairs', async () => {
  const source = await fs.readFile(path.resolve('src/utils/noTradeMath.ts'), 'utf8');
  assert.match(source, /unique symbol/);
  assert.match(source, /TradeDisplayDelta/);
  assert.match(source, /oddsPairDelta\(before: number, after: number\)/);
});
