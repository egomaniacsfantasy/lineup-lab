import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMovers } from '../server/engine/engine.js';

// Waiver claims are gated on WIN PROBABILITY, not a fixed point margin (the old "+2
// projected pts" floor was removed). A claim surfaces only when it (a) out-projects the
// starter it would replace AND (b) raises the displayed win% by a visible amount (the
// 0.1%-rounded odds tick up). A pure sideways add -- out-projects on paper but does not
// move your chance to win -- is suppressed.

const slotLabels = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
function proj(id, pos, mean, dr = 1) {
  return { playerId: id, position: pos, name: id, depthRank: dr, mean, stdev: Math.max(2, mean * 0.35), weekly: {}, weeklyCI: {} };
}
// win% implied by an American moneyline (favorite = negative).
function probOf(odds) {
  return odds < 0 ? (-odds) / ((-odds) + 100) : 100 / (odds + 100);
}

function build({ userMeans, oppMeans, faK, displayWin }) {
  const u = Object.entries(userMeans).map(([id, m]) => proj(`u_${id}`, id.replace(/[0-9]/g, '').toUpperCase(), m));
  const o = Object.entries(oppMeans).map(([id, m]) => proj(`o_${id}`, id.replace(/[0-9]/g, '').toUpperCase(), m));
  const fa = proj('fa_k', 'K', faK);
  const projections = [...u, ...o, fa];
  const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
  const catalog = Object.fromEntries(projections.map((p) => [p.playerId, { position: p.position, name: p.name, team: 'FA' }]));
  const userPlayers = u.map((p) => p.playerId);
  const oppPlayers = o.map((p) => p.playerId);
  return {
    league: { leagueType: 'redraft', rosterPositions: [...slotLabels, 'BN', 'BN'] },
    teams: [{ rosterId: 1, isUser: true, players: userPlayers, starters: userPlayers }, { rosterId: 2, isUser: false, players: oppPlayers, starters: oppPlayers }],
    matchups: [{ rosterId: 1, matchupId: 1, starters: userPlayers }, { rosterId: 2, matchupId: 1, starters: oppPlayers }],
    projections, projectionMap, week: 1, catalog, seed: 42,
    distByRoster: new Map([[1, { mean: 60, sigma: 12 }], [2, { mean: 60, sigma: 12 }]]),
    userDisplayWinProb: displayWin, lockedTeams: new Set(),
  };
}

// A competitive matchup: the FA kicker (9) beats the user's kicker (8) and it nudges a
// near-coin-flip win% -> the claim IS surfaced, and its after-odds beat its before-odds.
const competitive = build({
  userMeans: { qb: 20, rb: 14, wr: 13, te: 9, k: 8, def: 8 },
  oppMeans: { qb: 19, rb: 13, wr: 12, te: 10, k: 9, def: 9 },
  faK: 9, displayWin: 0.45,
});

test('a claim that out-projects AND raises win% is surfaced, with after-odds better than before', () => {
  const waiver = computeMovers(competitive).find((m) => m.kind === 'waiver');
  assert.ok(waiver, 'expected the win%-improving kicker upgrade to surface');
  assert.ok(waiver.valueGain > 0, 'must out-project the starter');
  assert.ok(probOf(waiver.titleOddsAfter) > probOf(waiver.titleOddsBefore), 'after-odds must imply a higher win% than before');
});

// A blowout: the user is a ~lock to win, so replacing his kicker (8) with a better one
// (9) out-projects on paper but does NOT move his win% -> no claim should surface, even
// though the old +2 floor is gone and the +1 gain now clears the projection precondition.
const blowout = build({
  userMeans: { qb: 42, rb: 40, wr: 40, te: 38, k: 8, def: 40 },
  oppMeans: { qb: 4, rb: 3, wr: 3, te: 2, k: 1, def: 3 },
  faK: 9, displayWin: 0.999,
});

test('a claim that out-projects but does NOT move win% (blowout) is suppressed', () => {
  const waiver = computeMovers(blowout).find((m) => m.kind === 'waiver');
  assert.equal(waiver, undefined, 'a sideways add that does not raise win% must not surface');
});
