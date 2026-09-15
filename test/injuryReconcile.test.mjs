// The league DB's injury flag is stale (it persists a week-1 injury into later weeks)
// AND coarse (an out/ir flag blanket-zeroed a returning player all season). We replace
// it with the FRESH ESPN designation so the badge shows the player's true status
// (Zay Flowers "Questionable", A.J. Brown "IR") while the injury-aware grid keeps the
// projection honest. A player no longer on the report has a stale out/ir flag cleared.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileInjuryFlags } from '../server/routes/api.js';
import { normalizePlayerName } from '../server/live/nflInjuries.js';
import { normalizeTeam } from '../server/live/nflGameStatus.js';

const keyOf = (name, team) => `${normalizePlayerName(name)}|${normalizeTeam(team) ?? ''}`;
const statusMap = (entries) => new Map(entries.map(([n, t, s]) => [keyOf(n, t), s]));

test('shows the fresh designation for a Questionable player (Zay Flowers)', () => {
  // League DB has the stale week-1 "Out"; the fresh report has him Questionable.
  const players = { flowers: { name: 'Zay Flowers', team: 'BAL', injuryStatus: 'Out' } };
  reconcileInjuryFlags(players, statusMap([['Zay Flowers', 'BAL', 'Questionable']]));
  assert.equal(players.flowers.injuryStatus, 'Questionable');
});

test('surfaces IR for a player on injured reserve (A.J. Brown)', () => {
  const players = { ajb: { name: 'A.J. Brown', team: 'NE', injuryStatus: null } };
  reconcileInjuryFlags(players, statusMap([['A.J. Brown', 'NE', 'IR']]));
  assert.equal(players.ajb.injuryStatus, 'IR');
});

test('keeps Out when the fresh report rules the player out', () => {
  const players = { hurt: { name: 'Really Hurt', team: 'SF', injuryStatus: 'Questionable' } };
  reconcileInjuryFlags(players, statusMap([['Really Hurt', 'SF', 'Out']]));
  assert.equal(players.hurt.injuryStatus, 'Out');
});

test('clears a stale out/ir flag when the player is no longer on the report', () => {
  const players = {
    a: { name: 'Back Now', team: 'DAL', injuryStatus: 'Out' },
    b: { name: 'Also Back', team: 'NYG', injuryStatus: 'IR' },
  };
  reconcileInjuryFlags(players, statusMap([['Someone Else', 'KC', 'Questionable']]));
  assert.equal(players.a.injuryStatus, null);
  assert.equal(players.b.injuryStatus, null);
});

test('leaves a healthy player (not on the report) untouched', () => {
  const players = { p: { name: 'Perfectly Fine', team: 'MIA', injuryStatus: null } };
  reconcileInjuryFlags(players, statusMap([['Someone', 'BUF', 'Out']]));
  assert.equal(players.p.injuryStatus, null);
});

test('an empty/failed scrape never rewrites real flags', () => {
  const players = { p: { name: 'Zay Flowers', team: 'BAL', injuryStatus: 'Out' } };
  reconcileInjuryFlags(players, new Map());
  assert.equal(players.p.injuryStatus, 'Out', 'no data -> conservative, leave as-is');
});
