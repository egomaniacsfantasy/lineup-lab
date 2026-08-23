import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const CONTEXT = 'src/contexts/LeagueConnectionContext.tsx';

/**
 * An ESPN league has to be confirmed once before it is trusted, and then it has
 * to STAY trusted however the connection object is rebuilt.
 *
 * The first version put a version number on the connection itself. That field
 * had to survive every place a connection is constructed, and a connection is
 * constructed constantly: from account rows, from a merge of rows over the
 * local copy, from the league switcher's list. Three of those paths dropped it
 * and I patched them one at a time. The fourth was the switcher, which is the
 * one a person actually uses: clicking your ESPN league handed activateLocal a
 * row-derived object carrying no stamp, and the next read discarded it. Click
 * the league, watch it disappear.
 *
 * The trust lives in one record keyed by league id now. These tests exist to
 * stop it moving back onto the object.
 */

test('trust is not a field on the connection', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.doesNotMatch(
    source,
    /identityVersion/,
    'trust is back on the connection object, where every rebuild drops it',
  );
});

test('every path that activates a league asks the same record', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* One predicate, one source of truth. */
  assert.match(source, /function trustedForIdentity/);
  assert.match(source, /readConfirmed\(\)\.has\(String\(connection\.leagueId\)\)/);

  /* And it must not depend on anything the caller carries in. */
  const start = source.indexOf('function trustedForIdentity');
  const body = source.slice(start, source.indexOf('\n}', start));
  assert.doesNotMatch(body, /\?\?/, 'the predicate should not be reading a field off the object');
});

test('confirming is keyed by league, so a rebuilt object stays trusted', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.match(source, /function confirmEspnLeague\(leagueId: string\)/);

  /* Connecting is the confirmation: the team was either matched to the user's
     own cookie or picked by them from the list. */
  const connect = source.slice(source.indexOf('const connect = useCallback'));
  assert.match(
    connect.slice(0, 900),
    /confirmEspnLeague\(incoming\.leagueId\)/,
    'connecting an ESPN league must record the confirmation',
  );
});

test('the switcher cannot un-trust a league by rebuilding it', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* switchLeague picks from `leagues`, which is built from account rows via
     rowToConnection. If trust rode on the object, this path would hand
     activateLocal an untrusted copy of a league the user already confirmed.
     rowToConnection must therefore not be expected to carry trust at all. */
  const rowToConnection = source.slice(source.indexOf('function rowToConnection'));
  assert.doesNotMatch(
    rowToConnection.slice(0, 500),
    /identityVersion|confirmed/i,
    'account rows should not need to carry trust',
  );
});

test('Sleeper is never asked to confirm anything', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const start = source.indexOf('function trustedForIdentity');
  const body = source.slice(start, source.indexOf('\n}', start));
  /* Sleeper resolves identity from the user's own account and never from a
     league-keyed shared store, so it had none of this problem. */
  assert.match(body, /provider !== 'espn'\) return true/);
});

test('removing a league is still not undone by the account rows', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const remove = source.slice(source.indexOf('const removeLeague = useCallback'));
  assert.match(remove.slice(0, 900), /removedKeysRef\.current\.add/);
  const hydrate = source.slice(source.indexOf('const all = rows'));
  assert.match(hydrate.slice(0, 400), /removedKeysRef\.current\.has/);
});

test('an unopenable league does not take the whole account down with it', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  const start = source.indexOf('const preferred = all.find');
  assert.ok(start > -1, 'the account fallback should choose, not bail');
  const body = source.slice(start, start + 700);

  /* An ESPN league awaiting a team pick cannot be opened. It used to `return`
     here, so someone whose active league was an unconfirmed ESPN one landed on
     "sync a league to begin" while holding fourteen leagues. */
  assert.match(
    body,
    /all\.find\(\(connection\) => trustedForIdentity\(connection\)\)/,
    'it must fall through to a league it CAN open',
  );
});

test('the active league is not chosen by indexing a filtered list', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* `all` is filtered for removals, so an index into it stopped matching the
     row it came from and "active" could resolve to a different league. */
  assert.doesNotMatch(
    source,
    /rows\[i\]\.is_active/,
    'is_active is being read back out of rows by index again',
  );
  assert.match(source, /wasActive: row\.is_active/, 'is_active should ride on the connection');
});

test('Sleeper names refresh even when no Sleeper league is open', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* The account rows have no column for a league name, so Sleeper is the only
     source. Gating the refresh on the ACTIVE league being Sleeper meant that
     with an ESPN league active, or none at all, every Sleeper row in the
     switcher showed the manager's own username forever. */
  assert.match(source, /const sleeperUsername =/);
  assert.match(
    source,
    /leagues\.find\(\(league\) => league\.provider === 'sleeper' && league\.username\)/,
    'the username should come from any Sleeper league, not only the active one',
  );
});

test('a wrong team pick is recoverable', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');

  /* Picking the wrong team out of ESPN's list is easy, and it used to be
     permanent: the league kept opening on somebody else's roster and the only
     way back was removing the league and starting over. */
  assert.match(source, /function forgetEspnLeague\(leagueId: string\)/);
  assert.match(source, /next\.delete\(String\(leagueId\)\)/);
  assert.match(source, /changeEspnTeam/, 'the context should expose a way to re-pick');

  const menu = await fs.readFile(path.resolve('src/components/layout/AccountMenu.tsx'), 'utf8');
  assert.match(menu, /Change my team/, 'and it should be reachable from the switcher');
  assert.match(
    menu,
    /stored\?\.provider === 'espn'/,
    'only ESPN leagues have a team to re-pick',
  );
});

test('the asset proxy is always CORS-safe, because canvases need it', async () => {
  const source = await fs.readFile(path.resolve('server/routes/assets.js'), 'utf8');

  /* These images are drawn twice: as <img> in the UI and onto a canvas for the
     share cards, which requires crossOrigin and therefore CORS headers. A
     same-origin <img> sends no Origin, so the allowlist added nothing, and the
     response was cached for a day exactly as it was. The card then requested
     the same URL with crossOrigin, got the cached header-less copy, failed the
     check, and the headshot silently did not draw. */
  const grants = source.match(/Access-Control-Allow-Origin', '\*'/g) ?? [];
  assert.ok(
    grants.length >= 2,
    `every image response must carry the header, saw ${grants.length}`,
  );

  /* Unconditional on purpose: a header set only for allowlisted origins is
     absent from the copy a same-origin request caches. */
  assert.doesNotMatch(
    source,
    /if \([^)]*origin[^)]*\)[^\n]*Access-Control-Allow-Origin/i,
    'the header must not be conditional, or the cached copy will lack it',
  );
});
