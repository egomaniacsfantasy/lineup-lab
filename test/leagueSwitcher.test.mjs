import assert from 'node:assert/strict';
import test from 'node:test';
import { canSwitchLeagues, switchableLeagues } from '../src/utils/leagueSwitcher.ts';

const league = (leagueId, provider = 'sleeper', leagueName = leagueId) => ({
  provider,
  leagueId,
  leagueName,
});

test('the open league is not offered as somewhere to go', () => {
  const all = [league('a'), league('b'), league('c')];
  assert.deepEqual(
    switchableLeagues(all, league('b')).map((l) => l.leagueId),
    ['a', 'c'],
  );
});

test('one league is a label, not a menu', () => {
  /* A lone league dressed as a menu opens onto nothing, which reads as broken
     rather than as empty. */
  assert.equal(canSwitchLeagues([league('a')], league('a')), false);
  assert.equal(canSwitchLeagues([league('a'), league('b')], league('a')), true);
});

test('the two providers can share an id without hiding a league', () => {
  /* Sleeper and ESPN mint ids independently, so comparing ids alone would
     drop a real ESPN league because a Sleeper one happened to match. */
  const all = [league('12345', 'sleeper'), league('12345', 'espn')];
  const seen = switchableLeagues(all, league('12345', 'sleeper'));
  assert.equal(seen.length, 1, 'an unrelated league was hidden by an id collision');
  assert.equal(seen[0].provider, 'espn');
});

test('no active league means everything is on offer', () => {
  const all = [league('a'), league('b')];
  assert.equal(switchableLeagues(all, null).length, 2);
});

test('a missing list is not a crash', () => {
  assert.deepEqual(switchableLeagues(undefined, league('a')), []);
  assert.equal(canSwitchLeagues(null, null), false);
});
