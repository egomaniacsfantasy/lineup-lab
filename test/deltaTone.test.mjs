import assert from 'node:assert/strict';
import test from 'node:test';
import { signedDeltaClass } from '../src/utils/deltaTone.ts';

test('negative deltas never use the positive class', () => {
  const klass = signedDeltaClass(-1.2);
  assert.equal(klass, 'trade-cc__signed-value--negative');
  assert.notEqual(klass, 'trade-cc__signed-value--positive');
});

test('positive deltas never use the negative class', () => {
  const klass = signedDeltaClass(1.2);
  assert.equal(klass, 'trade-cc__signed-value--positive');
  assert.notEqual(klass, 'trade-cc__signed-value--negative');
});
