import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * Fixing the leak did not un-leak anybody.
 *
 * espnConnect no longer answers "which team is mine" with the league-keyed
 * cookie store, so new connections are correct. But a connection written
 * BEFORE that fix carries another manager's ESPN member id, and it is saved,
 * valid, and pointed at a real team. Nothing distinguishes it from a correct
 * one, so it survives every reload and keeps showing somebody else's roster
 * until it is thrown away on purpose.
 */

const CONTEXT = 'src/contexts/LeagueConnectionContext.tsx';

test('an ESPN connection from before the fix is dropped, not trusted', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const start = source.indexOf('function readStored');
  assert.ok(start > -1, 'readStored is gone');
  const body = source.slice(start, source.indexOf('\n}', start));

  assert.match(body, /trustedForIdentity/, 'stored connections are not identity-checked on load');
  assert.match(body, /removeItem\(STORAGE_KEY\)/, 'an untrusted connection has to be discarded');

  /* The ESPN scoping lives in the predicate now rather than inline here. */
  const predicate = source.slice(source.indexOf('function trustedForIdentity'));
  assert.match(predicate.slice(0, 400), /provider !== 'espn'/, 'the check must be scoped to ESPN');
  assert.match(predicate.slice(0, 400), /identityVersion/);
});

test('a connection made now is stamped, or every load would drop it again', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const start = source.indexOf('const connect = useCallback');
  const body = source.slice(start, start + 900);
  assert.match(
    body,
    /identityVersion: IDENTITY_VERSION/,
    'connect must stamp the current identity version',
  );
});

test('Sleeper is left alone, because it never had this bug', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const predicate = source.slice(
    source.indexOf('function trustedForIdentity'),
    source.indexOf('function flagIdentityRecheck'),
  );
  /* Sleeper resolves identity from the user's own account, never from a
     league-keyed shared store, so re-picking would be friction for nothing.
     The predicate must return true for it before looking at any version. */
  assert.match(predicate, /provider !== 'espn'\) return true/);
});

test('every path that can activate a connection checks the identity version', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* The localStorage read is the obvious one. The account rows are the other,
     and missing it made the connection vanish on load and come back
     mid-session still pointing at the wrong team, because the rows carry no
     identity version and kept restoring what the drop had just removed. */
  const checks = source.match(/trustedForIdentity\(/g) ?? [];
  assert.ok(
    checks.length >= 3,
    `trustedForIdentity should gate the definition plus every activation path, saw ${checks.length}`,
  );

  const dbPath = source.slice(source.indexOf('const dbActive ='));
  assert.match(
    dbPath.slice(0, 700),
    /trustedForIdentity\(dbActive\)/,
    'restoring a league from the account must check identity too',
  );
});

test('removing a league is not undone by the account rows', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* removeLeague deletes the row, but the delete is a network call and clearing
     `stored` re-runs the hydrate immediately. Without a session tombstone the
     rows still list the league and it reappears the instant you remove it. */
  const remove = source.slice(source.indexOf('const removeLeague = useCallback'));
  assert.match(
    remove.slice(0, 900),
    /removedKeysRef\.current\.add/,
    'removal must be remembered locally until the row delete lands',
  );

  const hydrate = source.slice(source.indexOf('const all = rows'));
  assert.match(
    hydrate.slice(0, 400),
    /removedKeysRef\.current\.has/,
    'the hydrate must filter out leagues removed in this session',
  );

  const connect = source.slice(source.indexOf('const connect = useCallback'));
  assert.match(
    connect.slice(0, 600),
    /removedKeysRef\.current\.delete/,
    'reconnecting a removed league must clear its tombstone',
  );
});
