import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const CONTEXT = 'src/contexts/LeagueConnectionContext.tsx';
const MENU = 'src/components/layout/AccountMenu.tsx';

/**
 * The ESPN league that would not open, and said nothing about why.
 *
 * Checked against Andre's own browser: og.olympus.espn-confirmed was an empty
 * array, so trustedForIdentity() refused his ESPN league, the hydrate silently
 * opened a Sleeper one instead, and clicking the row did nothing at all. Trust
 * is only ever granted inside connect(), so a league linked before that
 * mechanism shipped could never earn it. It also meant nothing ever fetched
 * that league's bootstrap, which is the only place an ESPN league's name comes
 * from — so the row read "Andre Vlahakis" forever. One cause, both complaints.
 *
 * The important half of this file is the second half. The confirmation is what
 * stops a leaguemate opening the app on somebody else's roster, and the fix
 * here makes an unconfirmed league *reachable*. It must stay unopenable.
 */

test('an unconfirmed ESPN league is offered rather than ignored', async () => {
  const context = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const menu = await fs.readFile(path.resolve(MENU), 'utf8');

  assert.match(
    context,
    /export function needsEspnTeamPick\(/,
    'the switcher has no way to ask whether a league needs its team picked',
  );
  assert.match(
    context,
    /if \(needsEspnTeamPick\(target\)\) \{\s*\n\s*window\.location\.hash = '#connect-espn';/,
    'clicking an unconfirmed ESPN league no longer routes to the picker, which '
      + 'is what made it look like the league simply vanished',
  );
  assert.match(menu, /const needsPick = needsEspnTeamPick\(league\);/);
  assert.match(menu, /Tap to pick your team/, 'the row does not say what is wrong');
  assert.match(menu, /Action needed/, 'the row is not visibly distinguished');
});

test('the leak this guards is still shut', async () => {
  const context = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* Sleeper is always trusted; ESPN is trusted only by explicit confirmation.
     If this ever returns true for an unconfirmed ESPN league, a leaguemate
     opens the app looking at the first linker's roster. */
  assert.match(
    context,
    /function trustedForIdentity\([\s\S]*?if \(connection\.provider !== 'espn'\) return true;[\s\S]*?return readConfirmed\(\)\.has\(String\(connection\.leagueId\)\);/,
    'trustedForIdentity changed shape — this is the roster leak guard',
  );

  /* needsEspnTeamPick must be the exact inverse for ESPN, or the UI could
     offer a league the loader considers openable, or vice versa. */
  assert.match(
    context,
    /export function needsEspnTeamPick\([\s\S]*?if \(connection\.provider !== 'espn'\) return false;[\s\S]*?return !readConfirmed\(\)\.has\(String\(connection\.leagueId\)\);/,
    'needsEspnTeamPick is no longer the inverse of trustedForIdentity',
  );

  /* The routing branch must come BEFORE activateLocal. If it were after, the
     league would be made active on the way to the picker, which is exactly the
     state that shows a stranger's roster. */
  const switchBody = context.slice(
    context.indexOf('const switchLeague = useCallback'),
    context.indexOf('Drop one league from the account'),
  );
  const guardAt = switchBody.indexOf('needsEspnTeamPick(target)');
  const activateAt = switchBody.indexOf('activateLocal(target)');
  assert.ok(guardAt > -1 && activateAt > -1, 'switchLeague changed shape');
  assert.ok(
    guardAt < activateAt,
    'the team-pick guard runs AFTER activateLocal, which would open the league '
      + 'on a possibly-wrong roster before the picker ever appears',
  );

  /* And confirmation still only comes from an explicit connect. */
  assert.match(
    context,
    /if \(incoming\.provider === 'espn'\) confirmEspnLeague\(incoming\.leagueId\);/,
    'ESPN confirmation is being granted somewhere other than connect()',
  );
  const confirmCalls = context.match(/confirmEspnLeague\(/g) ?? [];
  assert.equal(
    confirmCalls.length,
    2,
    `confirmEspnLeague is called ${confirmCalls.length} times (expected the '
      + 'definition and exactly one caller) — a new caller could grant trust '
      + 'without anybody picking a team`,
  );
});
