import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { isMissingLeagueNameColumn, leagueNameFromRow } from '../src/contexts/leagueRows.ts';

const CONTEXT = 'src/contexts/LeagueConnectionContext.tsx';

/**
 * Why a switcher holding fourteen leagues showed one name fourteen times.
 *
 * The name never reached the account. rowToConnection did not map it, so every
 * league rebuilt from Supabase arrived nameless and each consumer fell through
 * to displayName — the account's username, which is by definition the same on
 * every row. Andre saw "avla" fourteen times, and on the ESPN league his own
 * name, and reasonably concluded the app had lost track of which league was
 * which.
 */

test('a row carries its own league name', () => {
  assert.equal(leagueNameFromRow({ league_name: 'Odds Frauds' }), 'Odds Frauds');
  assert.equal(leagueNameFromRow({ league_name: '  LA 2026 League  ' }), 'LA 2026 League');
});

test('a row with no name falls back rather than naming a league nothing', () => {
  /* Rows written before the column existed, and rows saved from a connection
     that had not learned its name yet. Both must read as absent so the caller
     falls back — rendering a league whose name is the empty string is worse
     than rendering the manager name. */
  assert.equal(leagueNameFromRow({ league_name: null }), undefined);
  assert.equal(leagueNameFromRow({ league_name: '' }), undefined);
  assert.equal(leagueNameFromRow({ league_name: '   ' }), undefined);
  assert.equal(leagueNameFromRow({}), undefined);
});

test('the missing-column error is matched narrowly', () => {
  /* The real one. */
  assert.equal(
    isMissingLeagueNameColumn({
      code: 'PGRST204',
      message: "Could not find the 'league_name' column of 'olympus_leagues' in the schema cache",
    }),
    true,
  );

  /* An unrelated PGRST204 must not switch league names off for the session —
     matching on the code alone would do exactly that. */
  assert.equal(
    isMissingLeagueNameColumn({
      code: 'PGRST204',
      message: "Could not find the 'nickname' column of 'olympus_models' in the schema cache",
    }),
    false,
  );

  /* Nor should an ordinary failure. */
  assert.equal(isMissingLeagueNameColumn({ code: '23505', message: 'duplicate key value' }), false);
  assert.equal(isMissingLeagueNameColumn({ message: 'network error' }), false);
  assert.equal(isMissingLeagueNameColumn(null), false);
  assert.equal(isMissingLeagueNameColumn(undefined), false);
});

test('the context maps the name when it turns a row into a connection', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const body = source.slice(
    source.indexOf('function rowToConnection'),
    source.indexOf('function connectionFromSummary'),
  );
  assert.ok(body.length > 0, 'rowToConnection not found');
  assert.match(
    body,
    /leagueName:\s*leagueNameFromRow\(row\)/,
    'rowToConnection dropped the league name again, which is how every league '
      + 'ends up displaying the account username instead',
  );
});

test('saving a league writes the name', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.match(
    source,
    /row\.league_name = c\.leagueName/,
    'the name is read back but never written, so it can only ever be null',
  );
});
