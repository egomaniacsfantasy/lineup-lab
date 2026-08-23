import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { findOwnedRosterId, normalizeSwid } from '../server/providers/espnProvider.js';

/**
 * Which ESPN team is yours must never be answered with somebody else's cookie.
 *
 * The server credential store is keyed by ESPN league id and holds exactly one
 * SWID: whoever linked that league first. It exists so a private league stays
 * readable from any device after one person links it, and for READING that is
 * the whole point.
 *
 * It was also being used to answer "which of these teams is mine". On a public
 * league nobody sends a cookie, so the fallback fired for every member who
 * connected after the first, handed them the first member's roster, and the
 * client skipped its team picker because the answer was non-null and wrote
 * that person's ESPN member id into their own saved connection. Two real
 * managers in one league, one identity.
 */

test('no cookie means no answer, so the picker gets to ask', () => {
  const teams = [
    { rosterId: 1, ownerId: '{AAAA-1111}', coOwners: [] },
    { rosterId: 2, ownerId: '{BBBB-2222}', coOwners: [] },
  ];
  for (const nothing of [null, undefined, '', '   ']) {
    assert.equal(
      findOwnedRosterId(teams, nothing),
      null,
      `an absent cookie resolved to a roster (${JSON.stringify(nothing)})`,
    );
  }
});

test('an unowned team is not a match for an unknown viewer', () => {
  /* normalizeSwid maps both an absent cookie and an absent ownerId to null, so
     without the guard an orphan roster would answer for anyone. */
  const teams = [
    { rosterId: 1, ownerId: null, coOwners: [] },
    { rosterId: 2, ownerId: '{BBBB-2222}', coOwners: [] },
  ];
  assert.equal(findOwnedRosterId(teams, null), null);
  assert.equal(normalizeSwid(null), normalizeSwid(''));
});

test('your own cookie still finds your own team, braces and case aside', () => {
  const teams = [
    { rosterId: 1, ownerId: '{AAAA-1111}', coOwners: [] },
    { rosterId: 2, ownerId: '{BBBB-2222}', coOwners: ['{CCCC-3333}'] },
  ];
  assert.equal(findOwnedRosterId(teams, '{aaaa-1111}'), 1);
  assert.equal(findOwnedRosterId(teams, 'BBBB-2222'), 2);
  assert.equal(findOwnedRosterId(teams, '{CCCC-3333}'), 2, 'co-owners count');
  assert.equal(findOwnedRosterId(teams, '{ZZZZ-9999}'), null, 'a stranger owns nothing');
});

test('the connect probe never reads the shared credential store for identity', async () => {
  const source = await fs.readFile(
    path.resolve('server/providers/espnProvider.js'),
    'utf8',
  );
  const start = source.indexOf('export async function espnConnect');
  assert.ok(start > -1, 'could not find espnConnect');
  const body = source.slice(start);
  const identityLine = body.match(/const identity = .*/)?.[0] ?? '';

  assert.ok(identityLine, 'espnConnect no longer resolves an identity');
  assert.doesNotMatch(
    identityLine,
    /getEspnCreds/,
    'identity is reading the league-keyed credential store again, which hands '
      + "every later member the first linker's team",
  );

  /* Reading the league with a stored cookie is a different question and stays:
     that is the sync-once-works-everywhere feature, not an identity claim. */
  assert.match(source, /getEspnCreds/, 'the fetch-side fallback should still exist');
});
