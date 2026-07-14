import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('TradePage routes display-only odds deltas through the no-trade-math guard', async () => {
  const source = await fs.readFile(path.resolve('src/pages/TradePage.tsx'), 'utf8');
  assert.match(source, /from '\.\.\/utils\/noTradeMath'/);
  assert.match(source, /oddsPairDelta\(lane\.titleOddsBefore, lane\.titleOddsAfter\)/);
  assert.doesNotMatch(source, /impliedProbability\(/);
});

test('no-trade-math guard stays branded and scoped to display-only odds pairs', async () => {
  const source = await fs.readFile(path.resolve('src/utils/noTradeMath.ts'), 'utf8');
  assert.match(source, /unique symbol/);
  assert.match(source, /TradeDisplayDelta/);
  assert.match(source, /oddsPairDelta\(before: number, after: number\)/);
});
