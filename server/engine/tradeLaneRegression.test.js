import assert from 'node:assert/strict';
import test from 'node:test';
import { tradeLaneMatchesPricedResult } from './engine.js';

test('trade lane display numbers match the priced verdict result', () => {
  const priced = {
    available: true,
    you: { valueDelta: 1.64 },
    them: { valueDelta: 0.42 },
    verdict: 'Good value',
    acceptance: { probability: 62 },
    valueGap: -8,
  };

  assert.equal(
    tradeLaneMatchesPricedResult(
      {
        valueGain: 1.6,
        partnerGain: 0.4,
        verdict: 'Good value',
        acceptanceProbability: 62,
        valueGap: -8,
      },
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

test('trade lane rejects mismatched verdict fields', () => {
  const priced = {
    available: true,
    you: { valueDelta: 1.2 },
    them: { valueDelta: 0.6 },
    verdict: 'Fair',
    acceptance: { probability: 47 },
    valueGap: 3,
  };

  assert.equal(
    tradeLaneMatchesPricedResult(
      {
        valueGain: 1.2,
        partnerGain: 0.6,
        verdict: 'Good value',
        acceptanceProbability: 47,
        valueGap: 3,
      },
      priced,
    ),
    false,
  );
});
