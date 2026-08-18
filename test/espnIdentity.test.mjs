import assert from 'node:assert/strict';
import test from 'node:test';
import { memberName, teamLogo } from '../server/providers/espnProvider.js';

/* ESPN mints an account handle for every member who never set a display name,
   and those handles were being printed under the team on the head-to-head:
   "SITH LORD / espn40393983 · 0-0". The real name is in the same payload. */

test('a real name beats the account handle', () => {
  assert.equal(
    memberName({ displayName: 'espn40393983', firstName: 'Andre', lastName: 'Vlahakis' }),
    'Andre Vlahakis',
  );
});

test('a first name alone is still a name', () => {
  assert.equal(memberName({ displayName: 'ESPNFAN2938626819', firstName: 'Andre' }), 'Andre');
});

test('a chosen display name is kept when there is no real name', () => {
  assert.equal(memberName({ displayName: 'CommishMike' }), 'CommishMike');
});

test('a machine handle with no real name behind it is dropped, not shown', () => {
  for (const handle of ['espn40393983', 'ESPNFAN2938626819', 'espnfan1']) {
    assert.equal(memberName({ displayName: handle }), null, handle);
  }
});

test('a member with nothing usable is null', () => {
  assert.equal(memberName({}), null);
  assert.equal(memberName({ firstName: '  ', lastName: '' }), null);
});

/* The picture beside an ESPN team is the team logo — there is no member avatar
   in any view the API exposes — and the provider was hardcoding null. */

test('an http team logo is used', () => {
  assert.equal(
    teamLogo({ logo: 'https://g.espncdn.com/lm-static/logo-packs/core/x.png' }),
    'https://g.espncdn.com/lm-static/logo-packs/core/x.png',
  );
});

test('a missing or non-http logo is null', () => {
  assert.equal(teamLogo({}), null);
  assert.equal(teamLogo({ logo: '' }), null);
  assert.equal(teamLogo({ logo: 'javascript:alert(1)' }), null);
  assert.equal(teamLogo({ logo: 123 }), null);
});

/* Injury status on a compact lineup row. "vs NYG · Questionable" does not fit
   402px and arrived as "vs NYG · Questiona...". */
import { shortInjuryStatus } from '../src/utils/playerNames.ts';

test('a long status becomes the letter every fantasy app uses', () => {
  assert.equal(shortInjuryStatus('Questionable'), 'Q');
  assert.equal(shortInjuryStatus('questionable'), 'Q');
  assert.equal(shortInjuryStatus('Doubtful'), 'D');
  assert.equal(shortInjuryStatus('Out'), 'OUT');
  assert.equal(shortInjuryStatus('Injured Reserve'), 'IR');
  assert.equal(shortInjuryStatus('Suspended'), 'SUS');
});

test('an unknown status is passed through rather than mangled', () => {
  assert.equal(shortInjuryStatus('Limited'), 'Limited');
  assert.equal(shortInjuryStatus(null), null);
  assert.equal(shortInjuryStatus(''), null);
});
