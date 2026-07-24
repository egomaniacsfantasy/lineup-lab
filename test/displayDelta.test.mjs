import assert from 'node:assert/strict';
import test from 'node:test';
import {
  displayedDelta,
  displayedValue,
  formatDisplayedDelta,
} from '../src/utils/displayDelta.ts';
import { impliedProbability } from '../src/utils/formatOdds.ts';

test('displayed delta equals the difference of the rounded displayed endpoints', () => {
  const before = 53.26;
  const after = 61.54;

  assert.equal(displayedValue(before), 53.3);
  assert.equal(displayedValue(after), 61.5);
  assert.equal(displayedDelta(before, after), 8.2);
  assert.equal(formatDisplayedDelta(before, after), '+8.2%');
});

test('mapped display deltas use the displayed implied-probability endpoints', () => {
  const before = -114;
  const after = -119;
  const expected = displayedDelta(before, after, { mapValue: impliedProbability });

  assert.equal(
    expected,
    displayedValue(impliedProbability(after)) - displayedValue(impliedProbability(before)),
  );
});
