import assert from 'node:assert/strict';
import test from 'node:test';
import { tradeLaneMatchesPricedResult } from './engine.js';

test('trade lane display numbers match the priced verdict result', () => {
  const priced = {
    available: true,
    you: { valueDelta: 1.64 },
    them: { valueDelta: 0.42 },
  };

  assert.equal(
    tradeLaneMatchesPricedResult(
      { valueGain: 1.6, partnerGain: 0.4 },
      priced,
    ),
    true,
  );
});

test('trade lane rejects contradictory display signs', () => {
  const priced = {
    available: true,
    you: { valueDelta: -0.1 },
    them: { valueDelta: 0.5 },
  };

  assert.equal(
    tradeLaneMatchesPricedResult(
      { valueGain: 1.6, partnerGain: 0.5 },
      priced,
    ),
    false,
  );
});
