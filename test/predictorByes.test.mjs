import assert from 'node:assert/strict';
import test from 'node:test';
import { keyByesByWeek } from '../server/services/predictorByes.js';

/**
 * The Predictor names a team's key players on bye. "Key" is the lineup the
 * team would start at full strength, so a backup on bye is not listed and an
 * injured-reserve player is not either.
 */

const catalog = {
  qb1: { name: 'Starter QB', position: 'QB', byeWeek: 9 },
  qb2: { name: 'Backup QB', position: 'QB', byeWeek: 9 },
  rb1: { name: 'Starter RB', position: 'RB', byeWeek: 9 },
  rb2: { name: 'Second RB', position: 'RB', byeWeek: 10 },
  ir1: { name: 'Hurt Star', position: 'RB', byeWeek: 9 },
  wr1: { name: 'Other WR', position: 'WR', byeWeek: 9 },
  nob: { name: 'No Bye Known', position: 'WR', byeWeek: null },
};
const means = { qb1: 20, qb2: 9, rb1: 24, rb2: 14, ir1: 30, wr1: 12, nob: 11 };

/* Stands in for the engine's optimalAssign: one QB, two RB, best by mean. */
const assign = (ids) => {
  const best = (position, count) =>
    ids
      .filter((id) => catalog[id].position === position)
      .sort((a, b) => means[b] - means[a])
      .slice(0, count)
      .map((playerId) => ({ slot: position, playerId }));
  return [...best('QB', 1), ...best('RB', 2), { slot: 'TE', playerId: null }];
};

const teams = [
  { rosterId: 1, players: ['qb1', 'qb2', 'rb1', 'rb2', 'ir1'], reserve: ['ir1'] },
  { rosterId: 2, players: ['wr1', 'nob'] },
];

const run = (weeks) => keyByesByWeek({ teams, catalog, weeks, assign, meanOf: (id) => means[id] });

test('only would-be starters are listed, best first', () => {
  const byes = run([9, 10]);
  assert.deepEqual(
    byes[9]['1'].map((player) => player.id),
    ['rb1', 'qb1'],
    'the backup QB shares the bye and must not be named',
  );
  assert.deepEqual(byes[10]['1'], [{ id: 'rb2', name: 'Second RB', position: 'RB' }]);
});

test('an injured-reserve player on bye costs the team nothing', () => {
  /* ir1 has the highest mean on the roster. Were reserve not parked he would
     take a starting slot and be named, pushing a real starter out. */
  const ids = run([9])[9]['1'].map((player) => player.id);
  assert.ok(!ids.includes('ir1'));
  assert.ok(ids.includes('rb1'));
});

test('a team with nobody key on bye has no entry, and every asked week exists', () => {
  const byes = run([9, 10, 11]);
  assert.equal(byes[9]['2'], undefined, 'roster 2 starts no QB or RB');
  assert.deepEqual(byes[11], {});
});

test('weeks nobody asked about are not reported', () => {
  assert.deepEqual(Object.keys(run([10])), ['10']);
});
