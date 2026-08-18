import assert from 'node:assert/strict';
import test from 'node:test';
import { findOwnedRosterId, normalizeSwid } from '../server/providers/espnProvider.js';

/* The SWID cookie is the member's own ESPN id — the same GUID that shows up in
   members[].id and in each team's owners[]. The connect screen was asking a
   question it already had the answer to. */

const GUID = '1A2B3C4D-5E6F-7890-ABCD-EF1234567890';

test('braces and case do not stop a match', () => {
  assert.equal(normalizeSwid(`{${GUID}}`), `{${GUID}}`);
  assert.equal(normalizeSwid(GUID), `{${GUID}}`);
  assert.equal(normalizeSwid(`{${GUID.toLowerCase()}}`), `{${GUID}}`);
  assert.equal(normalizeSwid('  ' + GUID + '  '), `{${GUID}}`);
});

test('nothing usable is null, not a match against nothing', () => {
  assert.equal(normalizeSwid(null), null);
  assert.equal(normalizeSwid(''), null);
  assert.equal(normalizeSwid('{}'), null);
  assert.equal(normalizeSwid(42), null);
});

const teams = [
  { rosterId: 1, ownerId: '{AAAA-1}', coOwners: [] },
  { rosterId: 2, ownerId: `{${GUID.toLowerCase()}}`, coOwners: [] },
  { rosterId: 3, ownerId: '{CCCC-3}', coOwners: [] },
];

test('the signed-in member is matched to their team', () => {
  assert.equal(findOwnedRosterId(teams, `{${GUID}}`), 2);
  assert.equal(findOwnedRosterId(teams, GUID), 2, 'a bare guid still matches');
});

test('a co-owned team counts as yours', () => {
  const withCo = [
    { rosterId: 1, ownerId: '{AAAA-1}', coOwners: [`{${GUID}}`] },
    { rosterId: 2, ownerId: '{BBBB-2}', coOwners: [] },
  ];
  assert.equal(findOwnedRosterId(withCo, `{${GUID}}`), 1);
});

/* Both of these have to stay a question. */
test('a public league with no sign-in is still a question', () => {
  assert.equal(findOwnedRosterId(teams, null), null);
});

test('owning two teams in one league is still a question', () => {
  const twice = [
    { rosterId: 1, ownerId: `{${GUID}}`, coOwners: [] },
    { rosterId: 2, ownerId: '{BBBB-2}', coOwners: [`{${GUID}}`] },
  ];
  assert.equal(findOwnedRosterId(twice, `{${GUID}}`), null);
});

test('a member who is in no team gets no team', () => {
  assert.equal(findOwnedRosterId(teams, '{NOT-A-MEMBER}'), null);
  assert.equal(findOwnedRosterId([], `{${GUID}}`), null);
});
