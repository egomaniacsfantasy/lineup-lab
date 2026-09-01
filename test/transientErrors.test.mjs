import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * A league that failed to LOAD is not a league that needs reconnecting.
 *
 * Reported from production: clicking through several leagues produced "That is
 * a lot of leagues at once, try again in 41 seconds" and then dropped the user
 * on "Choose a provider" under the heading "Reconnect your league" - for an
 * account whose connection was perfectly fine. Two faults met there: an
 * allowance too small for real use, and every failure being treated as a dead
 * connection.
 *
 * The rate-limit arithmetic is exercised directly in rateLimit.test.mjs. These
 * guard the wiring that carries "this is temporary" from the server to the one
 * screen that was getting it wrong, which spans three files and cannot be
 * reached by a rendered test without provoking a real 429.
 */

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the server marks a rate limit as retryable', () => {
  const source = read('../server/rateLimit.js');
  const body = source.slice(source.indexOf('res.status(429)'));
  assert.match(body, /retryable:\s*true/, 'a 429 does not say it is temporary');
});

test('the client believes a 429 and a 5xx are temporary', () => {
  const source = read('../src/services/leagueApi.ts');
  assert.match(source, /retryable/, 'LeagueApiError lost its retryable flag');
  const ctor = source.slice(source.indexOf('throw new LeagueApiError('));
  assert.match(
    ctor,
    /response\.status === 429/,
    'a rate limit is not recognised as temporary',
  );
  assert.match(ctor, /response\.status >= 500/, 'a server error is not recognised as temporary');
});

test('a temporary failure does not offer to reconnect the league', () => {
  /* The exact predicate that sent somebody back through setup. */
  const source = read('../src/pages/LeaguePage.tsx');
  const line = source
    .split('\n')
    .find((l) => l.includes('stored && !bootstrap && !isLoading && error'));
  assert.ok(line, 'the reconnect predicate has moved; this guard needs rewriting');
  assert.match(
    line,
    /!errorIsRetryable/,
    'any error at all still sends the user to "Reconnect your league"',
  );
});
