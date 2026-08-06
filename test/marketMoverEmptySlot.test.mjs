import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMovers } from '../server/engine/engine.js';

// Regression: a user who owns NO kicker must get a kicker waiver suggestion. The
// Sleeper provider strips '0' placeholders from `starters`, so the empty K slot
// used to vanish and the claim search skipped it -> nothing surfaced. computeMovers
// now detects empty slots from the roster via the optimal-lineup assignment.

const WEEK = 1;
const slotLabels = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

function proj(playerId, position, mean, depthRank = 1) {
  return { playerId, position, name: playerId, depthRank, mean, stdev: Math.max(2, mean * 0.35), weekly: {}, weeklyCI: {} };
}

// League free-agent pool + both rosters' players all live in `projections`.
const FA_KICKER = proj('fa_k', 'K', 9);
const FA_DEF = proj('fa_def', 'DEF', 8);
const projections = [
  proj('u_qb', 'QB', 20), proj('u_rb', 'RB', 14), proj('u_wr', 'WR', 13), proj('u_te', 'TE', 9),
  proj('o_qb', 'QB', 19), proj('o_rb', 'RB', 13), proj('o_wr', 'WR', 12), proj('o_te', 'TE', 8),
  proj('o_k', 'K', 8), proj('o_def', 'DEF', 7),
  FA_KICKER, FA_DEF,
];
const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
const catalog = Object.fromEntries(projections.map((p) => [p.playerId, { position: p.position, name: p.name, team: 'FA' }]));

// User roster: full at skill spots, but NO kicker and NO defense.
const userPlayers = ['u_qb', 'u_rb', 'u_wr', 'u_te'];
const oppPlayers = ['o_qb', 'o_rb', 'o_wr', 'o_te', 'o_k', 'o_def'];
const teams = [
  { rosterId: 1, isUser: true, players: userPlayers, starters: userPlayers },
  { rosterId: 2, isUser: false, players: oppPlayers, starters: oppPlayers },
];
const matchups = [
  { rosterId: 1, matchupId: 1, starters: userPlayers },
  { rosterId: 2, matchupId: 1, starters: oppPlayers },
];
const league = { leagueType: 'redraft', rosterPositions: [...slotLabels, 'BN', 'BN'] };
const ctx = {
  league, teams, matchups, projections, projectionMap, week: WEEK, catalog, seed: 42,
  distByRoster: new Map([[1, { mean: 56, sigma: 12 }], [2, { mean: 67, sigma: 12 }]]),
  userDisplayWinProb: 0.4,
};

test('a user with no kicker/defense gets a waiver claim to fill an empty slot', () => {
  const movers = computeMovers(ctx);
  const waiver = movers.find((m) => m.kind === 'waiver');
  assert.ok(waiver, 'expected a waiver mover to be surfaced');
  // The best empty-slot fill is one of the two positions the user is missing.
  assert.ok(['fa_k', 'fa_def'].includes(waiver.playerId), `expected a K/DEF fill, got ${waiver.playerId}`);
  assert.ok(waiver.valueGain > 5, `expected a real point gain filling an empty slot, got ${waiver.valueGain}`);
});

test('a user already set at every slot gets no free K upgrade', () => {
  // Same user but now owning a strong kicker + defense -> the FA kicker (9) barely
  // beats his own (8), under the +2 gain floor, and nothing should surface for K.
  const fullPlayers = [...userPlayers, 'u_k', 'u_def'];
  const withK = { ...proj('u_k', 'K', 8), };
  const withDef = { ...proj('u_def', 'DEF', 8) };
  const pm = new Map(projectionMap);
  pm.set('u_k', withK); pm.set('u_def', withDef);
  const cat = { ...catalog, u_k: { position: 'K', name: 'u_k', team: 'FA' }, u_def: { position: 'DEF', name: 'u_def', team: 'FA' } };
  const movers = computeMovers({
    ...ctx,
    projections: [...projections, withK, withDef],
    projectionMap: pm,
    catalog: cat,
    teams: [{ rosterId: 1, isUser: true, players: fullPlayers, starters: fullPlayers }, teams[1]],
    matchups: [{ rosterId: 1, matchupId: 1, starters: fullPlayers }, matchups[1]],
  });
  const waiver = movers.find((m) => m.kind === 'waiver');
  // Either no waiver claim, or if one exists it isn't a marginal +1 kicker swap.
  if (waiver) assert.ok(waiver.valueGain >= 2, 'any surfaced claim must clear the gain floor');
});
