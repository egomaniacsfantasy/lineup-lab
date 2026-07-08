import assert from 'node:assert/strict';
import test from 'node:test';
import { laneAcceptReasons, tradeLaneMatchesPricedResult } from './engine.js';

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

test('fallback lane reasons are low-cost asks, not self-sabotage', () => {
  const reasons = laneAcceptReasons({
    opp: { teamName: 'Roster 4' },
    give: ['1'],
    get: ['2'],
    catalog: {
      1: { name: 'Outgoing Player' },
      2: { name: 'Incoming Player' },
    },
    framing: 'near_fair_you_win',
    priced: {
      you: { valueDelta: 1.84 },
      them: { valueDelta: 0 },
    },
  });

  assert.equal(reasons.length >= 3, true);
  assert.equal(reasons.some((reason) => /barely|little reason/i.test(reason)), false);
  assert.equal(reasons[0], 'Costs Roster 4 nothing this week; you add 1.8.');
});

test('lane reason variants use different sentence structures', () => {
  const reasons = laneAcceptReasons({
    opp: { teamName: 'Roster 4' },
    give: ['1'],
    get: ['2'],
    catalog: {
      1: { name: 'Outgoing Player' },
      2: { name: 'Incoming Player' },
    },
    framing: 'both_upgrade',
    priced: {
      you: { valueDelta: 2.1 },
      them: { valueDelta: 0.6 },
    },
  });

  assert.equal(new Set(reasons).size, reasons.length);
  assert.match(reasons[0], /upgrades starters/);
  assert.match(reasons[1], /Both starters move/);
});
