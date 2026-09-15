// Stale league-DB injury flags persist a week-1 injury into later weeks, and
// playerDistribution() blanket-zeroes any out/ir player for EVERY week -- so a
// player due back (e.g. Zay Flowers, "Out" in the league feed but only Questionable
// on the fresh ESPN report) projects 0.0 for the rest of the season and drags his
// manager's win%. reconcileInjuryFlags() clears a stale flag the fresh ESPN
// ruled-out set does NOT confirm, letting the injury-aware projection grid drive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileInjuryFlags } from '../server/routes/api.js';
import { normalizePlayerName } from '../server/live/nflInjuries.js';
import { normalizeTeam } from '../server/live/nflGameStatus.js';

const keyOf = (name, team) => `${normalizePlayerName(name)}|${normalizeTeam(team) ?? ''}`;

test('clears a stale out flag the fresh report does not confirm (Zay Flowers)', () => {
  const players = {
    flowers: { name: 'Zay Flowers', team: 'BAL', injuryStatus: 'Out' },
  };
  // Fresh ESPN report rules out SOMEONE ELSE this week, not Flowers.
  const ruledOut = new Set([keyOf('Some Otherguy', 'KC')]);
  reconcileInjuryFlags(players, ruledOut);
  assert.equal(players.flowers.injuryStatus, null, 'stale Flowers out flag should be cleared');
});

test('keeps the flag when the fresh report DOES rule the player out', () => {
  const players = {
    hurt: { name: 'Really Hurt', team: 'SF', injuryStatus: 'Out' },
  };
  const ruledOut = new Set([keyOf('Really Hurt', 'SF')]);
  reconcileInjuryFlags(players, ruledOut);
  assert.equal(players.hurt.injuryStatus, 'Out', 'genuinely-out player keeps his flag');
});

test('clears a stale IR flag too', () => {
  const players = { p: { name: 'Back Soon', team: 'DAL', injuryStatus: 'IR' } };
  reconcileInjuryFlags(players, new Set([keyOf('Other Person', 'NYG')]));
  assert.equal(players.p.injuryStatus, null);
});

test('leaves non-out statuses (Questionable) untouched', () => {
  const players = { p: { name: 'Maybe Plays', team: 'MIA', injuryStatus: 'Questionable' } };
  reconcileInjuryFlags(players, new Set([keyOf('Someone', 'BUF')]));
  assert.equal(players.p.injuryStatus, 'Questionable');
});

test('an empty/failed scrape never wholesale-clears real flags', () => {
  const players = { p: { name: 'Zay Flowers', team: 'BAL', injuryStatus: 'Out' } };
  reconcileInjuryFlags(players, new Set()); // scrape returned nothing
  assert.equal(players.p.injuryStatus, 'Out', 'no data -> conservative, keep the flag');
});
