import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  deadSleeperLeagues,
  newestListedSeason,
  nflSeasonOf,
  priorSeasonLeagues,
} from '../src/contexts/leagueRows.ts';

const CONTEXT = 'src/contexts/LeagueConnectionContext.tsx';

/**
 * Andre's phone, 2026-10-09: fifteen rows in the switcher, ten of them bare
 * ids. Five were 2025 copies of leagues he also held for 2026 (Sleeper mints a
 * new league every season), three were test leagues deleted in July that
 * Sleeper no longer listed, and nothing on the client ever asked whether a row
 * still meant anything. The rule now: not this season, gone; not listed by
 * Sleeper, gone.
 */

const row = (leagueId, season, over = {}) => ({
  provider: 'sleeper',
  leagueId,
  userId: 'avla',
  season,
  ...over,
});

test('the NFL season is the calendar year, except that January and February belong to the one before', () => {
  assert.equal(nflSeasonOf(new Date(2026, 9, 9)), '2026');
  assert.equal(nflSeasonOf(new Date(2026, 8, 1)), '2026');
  assert.equal(nflSeasonOf(new Date(2026, 2, 1)), '2026');
  /* The title game is played in February. Pruning the league during it would
     be the one unforgivable moment. */
  assert.equal(nflSeasonOf(new Date(2027, 0, 15)), '2026');
  assert.equal(nflSeasonOf(new Date(2027, 1, 28)), '2026');
});

test('leagues filed under an earlier season are the ones to drop', () => {
  const leagues = [
    row('2025-ball', '2025'),
    row('2026-ball', '2026'),
    row('2024-old', '2024'),
    row('espn', '2025', { provider: 'espn', userId: '{SWID}' }),
  ];
  const gone = priorSeasonLeagues(leagues, '2026');
  assert.deepEqual(gone.map((l) => l.leagueId).sort(), ['2024-old', '2025-ball', 'espn']);
});

test('a league with no recorded season is kept, and next season is not "prior"', () => {
  /* The oldest rows predate the season column; nothing to judge them by.
     And during a rollover Sleeper files the new league under next year. */
  const leagues = [row('nameless', undefined), row('blank', ''), row('next', '2027')];
  assert.deepEqual(priorSeasonLeagues(leagues, '2026'), []);
  /* No cutoff, no pruning: a missing season must never read as year zero. */
  assert.deepEqual(priorSeasonLeagues([row('a', '2025')], undefined), []);
  assert.deepEqual(priorSeasonLeagues([row('a', '2025')], 'current'), []);
});

test('the cutoff is the newest season Sleeper listed, not what it calls current', () => {
  /* The off-season case server/leagueChoices.js exists for: Sleeper says 2026
     but lists only 2025 leagues because nobody has rolled over yet. Pruning
     by "2026" there would empty the switcher for somebody with leagues. */
  assert.equal(newestListedSeason([{ season: '2025' }, { season: '2025' }], '2026'), '2025');
  assert.equal(newestListedSeason([{ season: '2025' }, { season: '2026' }], '2026'), '2026');
  /* Nothing listed: fall back to the state season, or nothing at all. */
  assert.equal(newestListedSeason([], '2026'), '2026');
  assert.equal(newestListedSeason([], null), null);
});

test('a current-season Sleeper row that Sleeper no longer lists is dead', () => {
  const lookup = {
    user: { id: 'avla' },
    season: '2026',
    leagues: [{ id: 'engineer', season: '2026' }, { id: 'ball', season: '2026' }],
  };
  const leagues = [
    row('engineer', '2026'),
    row('ball', '2026'),
    row('deleted-test', '2026'),
    row('left-this-one', '2026'),
  ];
  assert.deepEqual(
    deadSleeperLeagues(leagues, lookup).map((l) => l.leagueId),
    ['deleted-test', 'left-this-one'],
  );
});

test('dead means dead for THIS Sleeper user, this season, and only when Sleeper answered', () => {
  const lookup = { user: { id: 'avla' }, season: '2026', leagues: [{ id: 'engineer', season: '2026' }] };
  const leagues = [
    row('engineer', '2026'),
    /* Another provider is not Sleeper's to judge. */
    row('espn-league', '2026', { provider: 'espn', userId: '{SWID}' }),
    /* A second Sleeper username on the account was not looked up. */
    row('other-persons', '2026', { userId: 'someone-else' }),
    /* Last season is the prior-season rule's business, not this one's. */
    row('last-year', '2025'),
  ];
  assert.deepEqual(deadSleeperLeagues(leagues, lookup), []);
  /* An empty answer is what a failed lookup looks like. Nothing dies on it. */
  assert.deepEqual(
    deadSleeperLeagues([row('engineer', '2026')], { user: { id: 'avla' }, season: '2026', leagues: [] }),
    [],
  );
});

test('a row with no season that Sleeper does not list is dead too', () => {
  /* It cannot be excused as "last season" because it has none. */
  const lookup = { user: { id: 'avla' }, season: '2026', leagues: [{ id: 'engineer', season: '2026' }] };
  assert.deepEqual(
    deadSleeperLeagues([row('mystery', undefined)], lookup).map((l) => l.leagueId),
    ['mystery'],
  );
});

test('the context prunes on both reads: the account rows and the Sleeper answer', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  /* The hydrate judges rows by the calendar, because it has no network to ask. */
  assert.match(
    source,
    /const expired = priorSeasonLeagues\(kept, nflSeasonOf\(\)\);\s*\n\s*dropLeagueRows\(expired, 'prior season'\);/,
    'the hydrate no longer drops prior-season rows',
  );
  /* The refresh judges by what Sleeper listed, and dead leagues die there. */
  assert.match(
    source,
    /priorSeasonLeagues\(leagues, newestListedSeason\(result\.leagues, result\.season\)\),\s*\n\s*\.\.\.deadSleeperLeagues\(leagues, result\),/,
    'the Sleeper refresh no longer drops dead or prior-season rows',
  );
  /* Dropping is a real removal: tombstone first, then the account delete, and
     the open league is released rather than left pointing at a dead row. */
  assert.match(source, /for \(const key of goneKeys\) removedKeysRef\.current\.add\(key\);\s*\n\s*writeRemovedKeys/);
  assert.match(source, /if \(stored && expiredKeys\.has\(leagueKey\(stored\)\)\) \{\s*\n\s*releaseActive\(\);/);
  assert.match(source, /if \(stored && overKeys\.has\(leagueKey\(stored\)\)\) releaseActive\(\);/);
});

test('a name this device knows is written back to a nameless account row, once', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.match(
    source,
    /const nameless = new Set\(all\.filter\(\(row\) => !row\.leagueName\)\.map\(leagueKey\)\);/,
    'the backfill no longer targets rows that arrived without a name',
  );
  assert.match(
    source,
    /!backfilledNamesRef\.current\.has\(key\)/,
    'the backfill would re-run on every rehydrate',
  );
  assert.match(
    source,
    /upsertRows\(\s*\n\s*backfill\.map\(\(league\) => leagueRow\(accountId, league, activeByKey\.get\(leagueKey\(league\)\) \?\? false\)\),/,
    'the backfill must keep each row\'s own is_active rather than switching leagues',
  );
});
