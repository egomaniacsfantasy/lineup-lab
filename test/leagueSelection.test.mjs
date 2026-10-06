import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  diffSelection,
  narrowToLeague,
  orderLeagues,
  prunePinnedKeys,
  readPinnedKeys,
  selectionLabel,
  togglePinnedKey,
} from '../src/contexts/leagueSelection.ts';

/**
 * Which Sleeper leagues appear, and in what order.
 *
 * People called it obnoxious that typing a Sleeper username filled the
 * switcher with every league on the account. The list is curated now: tick
 * what you want, come back and change it, pin what matters to the top.
 */

const league = (leagueId, provider = 'sleeper') => ({ provider, leagueId });

test('pinned leagues lead, in the order they were pinned, and nothing else moves', () => {
  const leagues = [league('a'), league('b'), league('c'), league('d')];
  const ordered = orderLeagues(leagues, ['sleeper:c', 'sleeper:a']);
  assert.deepEqual(ordered.map((l) => l.leagueId), ['c', 'a', 'b', 'd']);
  /* No pins: the list comes back exactly as given. */
  assert.deepEqual(orderLeagues(leagues, []).map((l) => l.leagueId), ['a', 'b', 'c', 'd']);
});

test('a pin is keyed by provider and id, because the two providers mint ids independently', () => {
  const leagues = [league('7', 'espn'), league('7', 'sleeper')];
  const ordered = orderLeagues(leagues, ['sleeper:7']);
  assert.deepEqual(ordered.map((l) => l.provider), ['sleeper', 'espn']);
});

test('pinning a second league never shuffles the first', () => {
  const once = togglePinnedKey([], 'sleeper:a');
  const twice = togglePinnedKey(once, 'sleeper:b');
  assert.deepEqual(twice, ['sleeper:a', 'sleeper:b']);
  assert.deepEqual(togglePinnedKey(twice, 'sleeper:a'), ['sleeper:b'], 'pinning again unpins');
});

test('a pin does not outlive its league', () => {
  /* Otherwise re-adding a league months later would silently re-pin it. */
  assert.deepEqual(prunePinnedKeys(['sleeper:a', 'sleeper:gone'], [league('a')]), ['sleeper:a']);
});

test('reading pins with no storage is an empty list, not a crash', () => {
  assert.deepEqual(readPinnedKeys(), []);
});

test('saving the ticks adds what was ticked and removes what was unticked', () => {
  const available = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const diff = diffSelection({
    available,
    onAccount: new Set(['a', 'b']),
    ticked: new Set(['b', 'c']),
  });
  assert.deepEqual(diff.add.map((l) => l.id), ['c']);
  assert.deepEqual(diff.removeIds, ['a']);
});

test('a league Sleeper no longer lists is never removed by leaving it unticked', () => {
  /* It is not on the sheet, so there was nothing to untick. Last season's
     league, or an archived one, stays until it is removed on purpose. */
  const diff = diffSelection({
    available: [{ id: 'a' }],
    onAccount: new Set(['a', 'archived']),
    ticked: new Set(['a']),
  });
  assert.deepEqual(diff.add, []);
  assert.deepEqual(diff.removeIds, []);
});

test('the save button says what pressing it will do', () => {
  assert.equal(selectionLabel(0, 0), 'No changes');
  assert.equal(selectionLabel(1, 0), 'Add 1 league');
  assert.equal(selectionLabel(3, 0), 'Add 3 leagues');
  assert.equal(selectionLabel(0, 1), 'Remove 1 league');
  assert.equal(selectionLabel(2, 1), 'Add 2, remove 1');
});

test('the peek hands over the one league that was looked at', () => {
  const everyLeague = {
    provider: 'sleeper',
    leagueId: 'b',
    allLeagueIds: ['a', 'b', 'c'],
    allLeagues: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
  };
  const narrowed = narrowToLeague(everyLeague, { id: 'b', name: 'B', season: '2026' });
  assert.deepEqual(narrowed.allLeagueIds, ['b']);
  assert.deepEqual(narrowed.allLeagues, [{ id: 'b', name: 'B', season: '2026' }]);
});

test('the anonymous peek no longer attaches every league on the account', async () => {
  /* The exact shape of the bug: the connection built after the peek mapped
     account.leagues into allLeagues, so picking one league to see priced and
     then signing up connected all of them. */
  const source = await fs.readFile(path.resolve('src/hooks/usePeek.ts'), 'utf8');
  assert.doesNotMatch(source, /allLeagues:\s*\(account\?\.leagues/);
  assert.doesNotMatch(source, /allLeagueIds:\s*\(account\?\.leagues/);
  assert.match(source, /allLeagueIds: \[league\.id\]/);

  /* And a connection written by an older build is narrowed on the way in. */
  const connectPage = await fs.readFile(path.resolve('src/pages/ConnectPage.tsx'), 'utf8');
  assert.match(connectPage, /narrowToLeague\(pending/);
  assert.match(connectPage, /openLeaguePicker\(\{ firstRun: true \}\)/);
});
