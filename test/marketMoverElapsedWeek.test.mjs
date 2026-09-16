import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMovers } from '../server/engine/engine.js';

// Regression: the "Claim Cooper Rush -> ~100% to win this week" bug. A free agent
// whose weekly grid contains ONLY an ELAPSED week (a wk1 emergency starter, no wk2
// row) must NOT be suggested as a claim for the CURRENT week. The waiver gain used to
// fall back to his SEASON mean when the requested week was missing from his grid, so a
// player with one big past week spiked a future-week claim. weekMeanOf now treats a
// grid that lacks the current week as "not playing this week" -> 0.

const WEEK = 2; // current week
const slotLabels = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

function proj(playerId, position, mean, weekly = {}, depthRank = 1) {
  return { playerId, position, name: playerId, depthRank, mean, stdev: Math.max(2, mean * 0.35), weekly, weeklyCI: {} };
}

// The user's QB is mediocre this week (a genuine upgrade target).
const projections = [
  proj('u_qb', 'QB', 12, { 2: 12 }), proj('u_rb', 'RB', 14, { 2: 14 }),
  proj('u_wr', 'WR', 13, { 2: 13 }), proj('u_te', 'TE', 9, { 2: 9 }),
  proj('o_qb', 'QB', 19, { 2: 19 }), proj('o_rb', 'RB', 13, { 2: 13 }),
  proj('o_wr', 'WR', 12, { 2: 12 }), proj('o_te', 'TE', 8, { 2: 8 }),
  // FA QB1 whose ONLY grid entry is the elapsed wk1 (big), season mean carries it.
  proj('fa_elapsed_qb', 'QB', 30, { 1: 30 }),
];
const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
const catalog = Object.fromEntries(projections.map((p) => [p.playerId, { position: p.position, name: p.name, team: 'FA' }]));
const userPlayers = ['u_qb', 'u_rb', 'u_wr', 'u_te'];
const oppPlayers = ['o_qb', 'o_rb', 'o_wr', 'o_te'];
const ctx = {
  league: { leagueType: 'redraft', rosterPositions: [...slotLabels, 'BN', 'BN'] },
  teams: [
    { rosterId: 1, isUser: true, players: userPlayers, starters: userPlayers },
    { rosterId: 2, isUser: false, players: oppPlayers, starters: oppPlayers },
  ],
  matchups: [
    { rosterId: 1, matchupId: 1, starters: userPlayers },
    { rosterId: 2, matchupId: 1, starters: oppPlayers },
  ],
  projections, projectionMap, week: WEEK, catalog, seed: 42,
  distByRoster: new Map([[1, { mean: 48, sigma: 12 }], [2, { mean: 52, sigma: 12 }]]),
  userDisplayWinProb: 0.4,
};

test('a FA whose grid has only an elapsed week is not a current-week claim', () => {
  const movers = computeMovers(ctx);
  const waiver = movers.find((m) => m.kind === 'waiver');
  if (waiver) {
    assert.notEqual(waiver.playerId, 'fa_elapsed_qb',
      'elapsed-only FA must not be suggested (his season mean must not spike this week)');
  }
});

test('a FA with a real current-week grid entry IS still surfaced', () => {
  // Same FA, now actually projected for week 2 -> a legitimate upgrade over u_qb (12).
  const live = proj('fa_live_qb', 'QB', 22, { 2: 22 });
  const pm = new Map(projectionMap); pm.set('fa_live_qb', live);
  const movers = computeMovers({
    ...ctx,
    projections: [...projections, live],
    projectionMap: pm,
    catalog: { ...catalog, fa_live_qb: { position: 'QB', name: 'fa_live_qb', team: 'FA' } },
  });
  const waiver = movers.find((m) => m.kind === 'waiver');
  assert.ok(waiver, 'a genuine current-week upgrade should surface');
  assert.equal(waiver.playerId, 'fa_live_qb');
});
