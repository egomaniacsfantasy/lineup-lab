import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMatchupData } from '../src/adapters/connectedLeague.ts';

// The SIT/START card surfaces a swap only when the displayed delta exceeds this (see
// starterEvaluation.getEvaluationState). Replicated here to avoid importing that module's
// extensionless value-import chain, which the node --test harness cannot resolve.
const SWAP_THRESHOLD = 1.5;
const displayedDelta = (baseline, resulting) =>
  Number((resulting.winProbability - baseline.winProbability).toFixed(1));

// Regression: in LIVE mode the cached start/sit swap objects carry a STATIC
// resultingWinProb simulated against a pre-game baseline. The card must anchor an
// alternative's win% to THIS matchup's current (live) baseline plus the swap's own
// delta -- not surface the static resultingWinProb, whose baseline differs from the
// live headline win%. Bug it fixes: sit a 13-pt WR (Wilson) for a 10-pt RB
// (Croskey) showed +6.0% because the card did (staticResulting 54.2 - live 48.2).

const catalog = {
  wilson: { name: 'Michael Wilson', team: 'ARI', position: 'WR' },
  croskey: { name: 'Jacory Croskey-Merritt', team: 'WAS', position: 'RB' },
  qb: { name: 'U QB', team: 'AAA', position: 'QB' },
  oqb: { name: 'O QB', team: 'BBB', position: 'QB' },
};

const userStarters = ['qb', 'wilson'];        // wilson at slot index 1 (a FLEX-type slot)
const oppStarters = ['oqb'];

const bootstrap = {
  week: 2,
  league: { id: 'L', name: 'Test', scoringFamily: 'ppr', totalTeams: 10, rosterPositions: ['QB', 'FLEX', 'BN'] },
  players: catalog,
  teams: [
    { rosterId: 1, isUser: true, teamName: 'You', ownerId: 'u', ownerName: 'You', teamId: 't1', record: { wins: 0, losses: 1, ties: 0 }, starters: userStarters, players: [...userStarters, 'croskey'] },
    { rosterId: 2, isUser: false, teamName: 'Opp', ownerId: 'o', ownerName: 'Opp', teamId: 't2', record: { wins: 0, losses: 1, ties: 0 }, starters: oppStarters, players: oppStarters },
  ],
  matchups: [
    { rosterId: 1, matchupId: 1, starters: userStarters, playersPoints: {} },
    { rosterId: 2, matchupId: 1, starters: oppStarters, playersPoints: {} },
  ],
};

function pricingWith(deltaWinProb, staticResultingWinProb) {
  return {
    available: true,
    playerMeans: { qb: { mean: 20 }, wilson: { mean: 13 }, croskey: { mean: 10 }, oqb: { mean: 24 } },
    lines: [{
      matchupId: 1,
      sides: {
        // LIVE headline win% for the user = 48.2 (you are behind live but near-even projected)
        1: { winProbability: 48.2, moneyline: 100, spread: 0, total: 200, projection: 100 },
        2: { winProbability: 51.8, moneyline: -110, spread: 0, total: 200, projection: 100 },
      },
    }],
    userSwaps: [{
      slotIndex: 1, slotLabel: 'FLEX', starterId: 'wilson', benchId: 'croskey',
      starterMean: 13, benchMean: 10,
      deltaWinProb, resultingWinProb: staticResultingWinProb,
      resultingMoneyline: -100, resultingProjection: 97,
    }],
  };
}

test('live: a downgrade swap anchors to live baseline + its own (negative) delta, so it is NOT surfaced', () => {
  // Static object: resultingWinProb 54.2 (above the live 48.2) but a true delta of -6.0.
  const data = toMatchupData(bootstrap, pricingWith(-6.0, 54.2));
  const slot = data.yourTeam.roster.find((s) => s.starter.id === 'wilson');
  const alt = slot.alternatives[0];
  // Anchored to live baseline (48.2) + delta (-6.0) = 42.2, NOT the static 54.2.
  assert.equal(alt.resultingLine.winProbability, 42.2);
  const delta = displayedDelta(data.baseline.yours, alt.resultingLine);
  assert.equal(delta, -6.0, 'displayed delta must be the swap delta, not static-minus-live');
  assert.ok(delta <= SWAP_THRESHOLD, 'a downgrade must not clear the SWAP threshold');
});

test('live: a genuine upgrade still surfaces, anchored to the live baseline', () => {
  const data = toMatchupData(bootstrap, pricingWith(3.0, 51.2));
  const slot = data.yourTeam.roster.find((s) => s.starter.id === 'wilson');
  const alt = slot.alternatives[0];
  assert.equal(alt.resultingLine.winProbability, 51.2); // 48.2 + 3.0
  const delta = displayedDelta(data.baseline.yours, alt.resultingLine);
  assert.equal(delta, 3.0);
  assert.ok(delta > SWAP_THRESHOLD, 'a genuine upgrade clears the SWAP threshold');
});
