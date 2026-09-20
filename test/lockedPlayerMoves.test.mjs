import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMovers } from '../server/engine/engine.js';

// Regression: recommendations must never involve a player whose NFL game has already
// KICKED OFF (ctx.lockedTeams, from getLockedNflTeams = teams in state 'in'|'post').
//  - waiver TARGET: a played-and-busted starter (pinned to a low actual) reads as the
//    weakest slot; without the lock guard he gets "replaced off waivers" though he is
//    locked and can't be dropped (the midweek-waiver bug).
//  - waiver CANDIDATE: a free agent whose game already started can't be added.
// A team on BYE is absent from lockedTeams, so a bye player stays a valid target.

const WEEK = 2;
const slotLabels = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

function proj(playerId, position, mean, depthRank = 1) {
  return { playerId, position, name: playerId, depthRank, mean, stdev: Math.max(2, mean * 0.35), weekly: {}, weeklyCI: {} };
}

// User is set at every slot. The ONLY starter a strong free-agent WR beats by >=2 is
// the weak WR 'u_wr' (3.0). That WR's NFL team (PHI) has already played this week.
const FA_WR = proj('fa_wr', 'WR', 13);              // strong FA, team not started
const projections = [
  proj('u_qb', 'QB', 22), proj('u_rb', 'RB', 20), proj('u_wr', 'WR', 3), proj('u_te', 'TE', 18),
  proj('u_k', 'K', 10), proj('u_def', 'DEF', 11),
  proj('o_qb', 'QB', 20), proj('o_rb', 'RB', 14), proj('o_wr', 'WR', 12), proj('o_te', 'TE', 9),
  proj('o_k', 'K', 8), proj('o_def', 'DEF', 7),
  FA_WR,
];
const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
// Weak WR is on PHI; the strong FA is on DAL. Everyone else on a neutral 'NA' team.
const teamOf = { u_wr: 'PHI', fa_wr: 'DAL' };
const catalog = Object.fromEntries(
  projections.map((p) => [p.playerId, { position: p.position, name: p.name, team: teamOf[p.playerId] ?? 'NA' }]),
);

const userPlayers = ['u_qb', 'u_rb', 'u_wr', 'u_te', 'u_k', 'u_def'];
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
const baseCtx = {
  league, teams, matchups, projections, projectionMap, week: WEEK, catalog, seed: 42,
  distByRoster: new Map([[1, { mean: 84, sigma: 12 }], [2, { mean: 70, sigma: 12 }]]),
  userDisplayWinProb: 0.55,
};

test('control: with no games kicked off, the FA claim to replace the weak WR surfaces', () => {
  const movers = computeMovers({ ...baseCtx, lockedTeams: new Set() });
  const waiver = movers.find((m) => m.kind === 'waiver');
  assert.ok(waiver, 'expected a waiver mover when nothing is locked');
  assert.equal(waiver.playerId, 'fa_wr');
});

test('a starter whose game has kicked off is NOT targeted for a waiver replacement', () => {
  // PHI (weak WR's team) is in progress/final -> he is locked, cannot be dropped. The
  // FA beats no OTHER starter by >=2, so no waiver claim should surface at all.
  const movers = computeMovers({ ...baseCtx, lockedTeams: new Set(['PHI']) });
  const waiver = movers.find((m) => m.kind === 'waiver');
  assert.equal(waiver, undefined, 'must not suggest replacing a locked (already-played) starter');
});

test('a free agent whose game has kicked off is NOT suggested as a claim', () => {
  // FA's team (DAL) has started -> he cannot be added this week, even though he would
  // otherwise beat the weak WR. The weak WR here is NOT locked (PHI not in the set).
  const movers = computeMovers({ ...baseCtx, lockedTeams: new Set(['DAL']) });
  const waiver = movers.find((m) => m.kind === 'waiver');
  assert.equal(waiver, undefined, 'must not suggest claiming a free agent whose game already started');
});
