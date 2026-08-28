import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { currentFantasySeason, seasonParam } from '../server/season.js';

/**
 * A public ESPN league reported as unreachable.
 *
 * Andre hit this on league 1139502520, which is public and answers 200 from
 * ESPN for season 2026. The chain: a league URL copied out of ESPN carries no
 * seasonId, so the parser returned season ''. The client appended
 * `?season=` unconditionally. The route used
 *
 *   req.query.season ?? String(new Date().getUTCFullYear())
 *
 * and `??` does not fall back on an empty string, so season stayed ''. The
 * provider built `.../seasons//segments/0/leagues/1139502520`, ESPN answered
 * 404, and the user was told to check a league ID that was correct.
 */

test('a blank season falls back rather than being forwarded', () => {
  const now = new Date('2026-08-28T12:00:00Z');

  /* The exact value the client was sending. */
  assert.equal(seasonParam('', now), '2026');
  assert.equal(seasonParam('   ', now), '2026');
  assert.equal(seasonParam(undefined, now), '2026');
  assert.equal(seasonParam(null, now), '2026');
});

test('a real season is honoured, and a malformed one is not', () => {
  const now = new Date('2026-08-28T12:00:00Z');

  assert.equal(seasonParam('2025', now), '2025');
  assert.equal(seasonParam(' 2024 ', now), '2024');

  /* Anything not a four-digit year goes into a provider URL path, where a
     malformed value does not fail loudly: it builds a URL for a league that
     cannot exist. */
  assert.equal(seasonParam('abc', now), '2026');
  assert.equal(seasonParam('20', now), '2026');
  assert.equal(seasonParam('2026; DROP', now), '2026');
});

test('the season is the one the NFL is playing, not the calendar year', () => {
  /* A fantasy season runs September into the following January. The old
     default was the calendar year, so every January it asked for a season
     ESPN has no data for and nothing could connect until the new league year
     opened. */
  assert.equal(currentFantasySeason(new Date('2026-09-10T12:00:00Z')), 2026);
  assert.equal(currentFantasySeason(new Date('2026-12-25T12:00:00Z')), 2026);
  assert.equal(currentFantasySeason(new Date('2027-01-05T12:00:00Z')), 2026);
  assert.equal(currentFantasySeason(new Date('2027-02-20T12:00:00Z')), 2026);
  assert.equal(currentFantasySeason(new Date('2027-07-15T12:00:00Z')), 2027);
});

test('no route still defaults a season to the calendar year', async () => {
  const source = await fs.readFile(path.resolve('server/routes/api.js'), 'utf8');
  assert.doesNotMatch(
    source,
    /season:\s*[^\n]*getUTCFullYear\(\)/,
    'a route is back to defaulting the season to the calendar year',
  );
  assert.match(source, /seasonParam\(/, 'the routes stopped using the shared season helper');
});

test('the client never sends an empty season', async () => {
  /* Both ends: the server refuses a blank season and the client stops
     producing one. Either alone leaves the hole open from the other side. */
  const source = await fs.readFile(path.resolve('src/services/leagueApi.ts'), 'utf8');
  assert.doesNotMatch(
    source,
    /espn\/connect\/\$\{encodeURIComponent\(leagueId\)\}\?season=/,
    'the connect call appends a season unconditionally again',
  );
  assert.match(source, /season && season\.trim\(\)/);
});
