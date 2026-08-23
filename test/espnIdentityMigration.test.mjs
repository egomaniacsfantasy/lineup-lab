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

  assert.match(body, /identityVersion/, 'stored connections are not version-checked on load');
  assert.match(body, /provider === 'espn'/, 'the check must be scoped to ESPN');
  assert.match(body, /removeItem\(STORAGE_KEY\)/, 'an untrusted connection has to be discarded');
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
  const start = source.indexOf('function readStored');
  const body = source.slice(start, source.indexOf('\n}', start));
  /* Sleeper resolves identity from the user's own account, never from a
     league-keyed shared store, so re-picking would be friction for nothing. */
  assert.doesNotMatch(body, /provider === 'sleeper'/);
});
