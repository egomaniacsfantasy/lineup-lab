import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { mergeLeagueNames, sameLeagueList } from '../src/contexts/leagueRows.ts';

const CONTEXT = 'src/contexts/LeagueConnectionContext.tsx';

/**
 * The switcher that flickered between league names and the account username
 * every couple of seconds.
 *
 * Two writers disagreed about who owns leagueName. The rehydrate rebuilt the
 * list straight from account rows, which carry no name — the column is newer
 * than the table, and old rows have none even after it exists. That wiped every
 * name. The Sleeper refresh then put the names back, set state, and woke the
 * rehydrate, which wiped them again. Names, usernames, names, usernames.
 *
 * It reads as a rendering glitch and is nothing of the sort: it is a merge that
 * treats "I don't know this league's name" as "this league has no name". Same
 * bug the ESPN cookies had in the same function.
 */

const SLEEPER = (id, name) => ({ provider: 'sleeper', leagueId: id, leagueName: name });

test('a nameless row never erases a name we already know', () => {
  const known = [SLEEPER('1', 'Engineer Bowl'), SLEEPER('2', 'Ball Institute')];
  /* What the account hands back before the migration: every name undefined. */
  const fromRows = [
    { provider: 'sleeper', leagueId: '1' },
    { provider: 'sleeper', leagueId: '2' },
  ];

  const merged = mergeLeagueNames(fromRows, known);
  assert.equal(merged[0].leagueName, 'Engineer Bowl');
  assert.equal(merged[1].leagueName, 'Ball Institute');
});

test('a real name from the rows still wins', () => {
  /* Once the migration has run, the account is authoritative again — a league
     renamed on another device must not be held back by a stale local copy. */
  const merged = mergeLeagueNames(
    [SLEEPER('1', 'Renamed On Another Device')],
    [SLEEPER('1', 'Old Local Name')],
  );
  assert.equal(merged[0].leagueName, 'Renamed On Another Device');
});

test('a league we have never seen simply stays nameless', () => {
  const merged = mergeLeagueNames([{ provider: 'espn', leagueId: '99' }], [SLEEPER('1', 'X')]);
  assert.equal(merged[0].leagueName, undefined);
});

test('providers do not borrow each other names', () => {
  /* Same numeric id across two hosts is not far-fetched, and inheriting a
     Sleeper league's name onto an ESPN one is exactly the class of bug that
     put an ESPN league under a Sleeper league's name before. */
  const merged = mergeLeagueNames(
    [{ provider: 'espn', leagueId: '1' }],
    [SLEEPER('1', 'Engineer Bowl')],
  );
  assert.equal(merged[0].leagueName, undefined);
});

test('an unchanged list compares equal, so the loop has somewhere to stop', () => {
  const a = [SLEEPER('1', 'Engineer Bowl'), SLEEPER('2', 'Ball Institute')];
  const b = [SLEEPER('1', 'Engineer Bowl'), SLEEPER('2', 'Ball Institute')];
  assert.equal(sameLeagueList(a, b), true, 'identical content must compare equal');

  /* And a real change must still get through, or names would freeze on first
     load and never update. */
  assert.equal(sameLeagueList(a, [SLEEPER('1', 'Engineer Bowl'), SLEEPER('2', 'Renamed')]), false);
  assert.equal(sameLeagueList(a, [SLEEPER('1', 'Engineer Bowl')]), false);
  assert.equal(sameLeagueList(a, [SLEEPER('1', 'Engineer Bowl'), { provider: 'espn', leagueId: '2', leagueName: 'Ball Institute' }]), false);
});

test('the rehydrate merges rather than replaces', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.match(
    source,
    /setLeagues\(\(previous\) => \{\s*const merged = mergeLeagueNames\(/,
    'the rehydrate is writing account rows straight into the switcher again, '
      + 'which erases every league name it does not know',
  );
});

test('the active league learns its name from its own bootstrap', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  /* This is what gives an ESPN league a name at all: the Sleeper account
     lookup that used to be the only source knows nothing about ESPN, so an
     ESPN league sat under the manager's own name forever. */
  assert.match(source, /const learnedName = data\.league\?\.name;/);
  assert.match(
    source,
    /String\(data\.league\.id\) === String\(connection\.leagueId\)/,
    'the id guard is gone: a bootstrap still in flight during a switch belongs '
      + 'to the previous league, and its name would be written onto the new one',
  );
});
