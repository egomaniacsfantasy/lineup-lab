import assert from 'node:assert/strict';
import test from 'node:test';
import { showLineupPlayerPosition } from '../src/utils/lineupRow.ts';

test('FLEX starters render exactly one position indicator', () => {
  assert.equal(showLineupPlayerPosition('FLX', 'starter'), false);
});

test('bench rows still show the player position pill', () => {
  assert.equal(showLineupPlayerPosition('BN', 'bench'), true);
  assert.equal(showLineupPlayerPosition('FLX', 'bench'), true);
});
