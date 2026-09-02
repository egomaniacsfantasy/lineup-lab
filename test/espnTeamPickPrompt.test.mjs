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
    /if \(needsEspnTeamPick\(target\)\) \{[\s\S]*?navigate\(`\/league\?\$\{params\.toString\(\)\}#connect-espn`\)/,
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

test('the pick prompt routes, rather than only setting a hash', async () => {
  const context = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* Only the League page reads location.hash to open the ESPN flow. Setting the
     hash from the Hub — where the switcher usually is — changed the address bar
     and nothing else, so the row said "Tap to pick your team" and then did
     nothing at all. That is worse than the silent failure it replaced. */
  assert.match(
    context,
    /navigate\(`\/league\?\$\{params\.toString\(\)\}#connect-espn`\)/,
    'the pick prompt is not routing to the League page, so it does nothing '
      + 'anywhere except on that page',
  );
  assert.doesNotMatch(
    context,
    /window\.location\.hash = '#connect-espn'/,
    'the bare hash assignment is back',
  );
});

/**
 * The dead end.
 *
 * Routing to a bare #connect-espn opened the empty "Bring your ESPN league
 * in" form, which asks somebody to paste a league URL for a league the
 * account is already showing them a row for. Pressing "Action needed" and
 * arriving at a blank form is not a picker; it is the same dead end the
 * silent failure was, with more steps.
 */
test('the picker is opened ON the league that needs picking', async () => {
  const context = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const league = await fs.readFile(path.resolve('src/pages/LeaguePage.tsx'), 'utf8');
  const connect = await fs.readFile(path.resolve('src/components/league/EspnConnect.tsx'), 'utf8');

  assert.match(
    context,
    /espnLeagueId: String\(target\.leagueId\)/,
    'the route to the picker does not carry the league, so it opens an empty form',
  );
  assert.match(context, /params\.set\('espnSeason', String\(target\.season\)\)/);

  assert.match(
    league,
    /initialLeagueInput=\{searchParams\.get\('espnLeagueId'\) \?\? ''\}/,
    'the League page drops the league id on the floor, so the picker opens empty anyway',
  );
  assert.match(league, /initialSeason=\{searchParams\.get\('espnSeason'\) \?\? ''\}/);

  /* Pre-filling is not enough on its own: a filled form with a button still
     asks somebody to re-submit a league they did not type. */
  assert.match(
    connect,
    /if \(initialLeagueInput\.trim\(\)\.length === 0\) return;[\s\S]*?attemptConnect\(\)/,
    'the connect screen does not look the league up on arrival, so being sent '
      + 'there still lands on a form rather than on the team picker',
  );
});

/**
 * A league is never named after the person looking at it.
 *
 * `displayName` is the account holder's name and is byte-identical on every
 * row, so using it as the league label put "Andre Vla..." where the league
 * name goes, on fifteen rows, distinguishing nothing. Worse, it reads as a
 * league actually called that. The row with no league name yet is exactly the
 * unconfirmed ESPN row, so the one row that most needed identifying was the
 * one guaranteed to be wearing somebody's name.
 */
test('the switcher never labels a league with the manager name', async () => {
  const menu = await fs.readFile(path.resolve(MENU), 'utf8');
  const body = menu.slice(
    menu.indexOf('function leagueLabel('),
    menu.indexOf('export function AccountMenu'),
  );

  assert.ok(body.length > 0, 'leagueLabel has moved or gone');
  assert.doesNotMatch(
    body,
    /league\.displayName/,
    'the league label falls back to the manager name again, which is the same '
      + 'string on every row of the account',
  );
  assert.match(
    body,
    /league\.leagueId/,
    'the fallback label carries nothing that tells two unnamed leagues apart',
  );
});
