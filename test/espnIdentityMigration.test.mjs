import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const CONTEXT = 'src/contexts/LeagueConnectionContext.tsx';

/**
 * An ESPN league has to be confirmed once before it is trusted, and then it has
 * to STAY trusted however the connection object is rebuilt.
 *
 * The first version put a version number on the connection itself. That field
 * had to survive every place a connection is constructed, and a connection is
 * constructed constantly: from account rows, from a merge of rows over the
 * local copy, from the league switcher's list. Three of those paths dropped it
 * and I patched them one at a time. The fourth was the switcher, which is the
 * one a person actually uses: clicking your ESPN league handed activateLocal a
 * row-derived object carrying no stamp, and the next read discarded it. Click
 * the league, watch it disappear.
 *
 * The trust lives in one record keyed by league id now. These tests exist to
 * stop it moving back onto the object.
 */

test('trust is not a field on the connection', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.doesNotMatch(
    source,
    /identityVersion/,
    'trust is back on the connection object, where every rebuild drops it',
  );
});

test('every path that activates a league asks the same record', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* One predicate, one source of truth. */
  assert.match(source, /function trustedForIdentity/);
  assert.match(source, /readConfirmed\(\)\.has\(String\(connection\.leagueId\)\)/);

  /* And it must not depend on anything the caller carries in. */
  const start = source.indexOf('function trustedForIdentity');
  const body = source.slice(start, source.indexOf('\n}', start));
  assert.doesNotMatch(body, /\?\?/, 'the predicate should not be reading a field off the object');
});

test('confirming is keyed by league, so a rebuilt object stays trusted', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.match(source, /function confirmEspnLeague\(leagueId: string\)/);

  /* Connecting is the confirmation: the team was either matched to the user's
     own cookie or picked by them from the list. */
  const connect = source.slice(source.indexOf('const connect = useCallback'));
  assert.match(
    connect.slice(0, 900),
    /confirmEspnLeague\(incoming\.leagueId\)/,
    'connecting an ESPN league must record the confirmation',
  );
});

test('the switcher cannot un-trust a league by rebuilding it', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* switchLeague picks from `leagues`, which is built from account rows via
     rowToConnection. If trust rode on the object, this path would hand
     activateLocal an untrusted copy of a league the user already confirmed.
     rowToConnection must therefore not be expected to carry trust at all. */
  const rowToConnection = source.slice(source.indexOf('function rowToConnection'));
  assert.doesNotMatch(
    rowToConnection.slice(0, 500),
    /identityVersion|confirmed/i,
    'account rows should not need to carry trust',
  );
});

test('Sleeper is never asked to confirm anything', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const start = source.indexOf('function trustedForIdentity');
  const body = source.slice(start, source.indexOf('\n}', start));
  /* Sleeper resolves identity from the user's own account and never from a
     league-keyed shared store, so it had none of this problem. */
  assert.match(body, /provider !== 'espn'\) return true/);
});

test('removing a league is still not undone by the account rows', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const remove = source.slice(source.indexOf('const removeLeague = useCallback'));
  assert.match(remove.slice(0, 900), /removedKeysRef\.current\.add/);
  const hydrate = source.slice(source.indexOf('const all = rows'));
  assert.match(hydrate.slice(0, 400), /removedKeysRef\.current\.has/);
});
