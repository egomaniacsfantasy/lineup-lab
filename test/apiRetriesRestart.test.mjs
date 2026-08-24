import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const CLIENT = 'src/services/leagueApi.ts';

/**
 * The black page reading "Load failed".
 *
 * A deploy takes the API away for most of a minute. Every request in that
 * window fails at the connection, not with a status: fetch rejects with a
 * TypeError carrying the browser's own words — "Load failed" in Safari,
 * "Failed to fetch" in Chrome.
 *
 * Two faults compounded. That rejection was not retried at all, because only a
 * TimeoutError was; and it was rethrown untouched, so a browser-internal string
 * became the entire explanation shown to the user. Andre screenshotted the
 * result: an empty app with "Load failed" in a box, caused by my own push
 * restarting the service underneath him.
 */

test('a dropped connection is retried, not surfaced raw', async () => {
  const source = await fs.readFile(path.resolve(CLIENT), 'utf8');

  assert.match(
    source,
    /const isNetworkFailure = \(error: unknown\) =>\s*\n?\s*error instanceof TypeError/,
    'a connection-level failure is no longer recognised, so a restart goes '
      + 'straight to the user again',
  );

  /* The exact shape of the old bug: rethrowing whatever fetch produced. */
  assert.doesNotMatch(
    source,
    /:\s*caught;\s*\n\s*\}\s*\n\s*await new Promise/,
    'the raw rethrow is back',
  );
});

test('the retries actually span a restart', async () => {
  const source = await fs.readFile(path.resolve(CLIENT), 'utf8');
  const match = source.match(/const RETRY_WAITS_MS = \[([^\]]+)\]/);
  assert.ok(match, 'RETRY_WAITS_MS is gone');

  const waits = match[1].split(',').map((value) => Number(value.replace(/[_\s]/g, '')));
  assert.ok(waits.every(Number.isFinite), `unparseable waits: ${match[1]}`);

  const total = waits.reduce((sum, value) => sum + value, 0);
  /* A single 1.2s retry never covered a Render restart, which is the whole
     reason this failure reached a user at all. */
  assert.ok(total >= 10_000, `retries only span ${total}ms, too short for a restart`);
  /* And not so long that a genuinely dead API leaves someone staring. */
  assert.ok(total <= 30_000, `retries span ${total}ms, longer than anyone will wait`);
  /* Backoff, not a tight loop against a service that is already struggling. */
  assert.deepEqual(waits, [...waits].sort((a, b) => a - b), 'waits should increase');
});

test('the browser never gets to write our error copy', async () => {
  const source = await fs.readFile(path.resolve(CLIENT), 'utf8');
  assert.match(
    source,
    /'We could not reach Odds Gods just then\. It is usually back within a minute\.'/,
    'the connection failure message is gone',
  );
});

test('writes are never replayed', async () => {
  const source = await fs.readFile(path.resolve(CLIENT), 'utf8');
  /* Replaying a POST could double a write, so only reads retry. Asserted
     because the retry loop is the natural place to forget it. */
  assert.match(
    source,
    /if \(!isRead \|\| !\(isNetworkFailure\(caught\) \|\| isTimeout\(caught\)\)\) \{/,
    'the read-only guard on retries is gone',
  );
});
