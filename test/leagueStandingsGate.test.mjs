import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';

/**
 * Standings is an admin diagnostic, not a league view.
 *
 * Wins, points for and points against are already on ESPN and Sleeper, shown
 * better and without our sync lag, so re-rendering them spent a quarter of the
 * League tab strip on the one surface that says nothing only we can say. The
 * table stays because its real audience was never the user: it orders teams
 * the same way the sim seeds playoffs, which makes it a check on the sim.
 *
 * Two ways this regresses silently. Standings creeps back into the public
 * list, or the tab strip goes back to mapping the public list while the URL
 * still resolves ?view=standings for anyone who types it — a gate you can walk
 * around is not a gate. Both are pinned here.
 */
const source = await fsp.readFile('src/pages/LeaguePage.tsx', 'utf8');

function viewKeys(name) {
  const block = source.match(
    new RegExp(`const ${name}: Array<\\{ key: LeagueView; label: string \\}> = \\[([\\s\\S]*?)\\n\\];`),
  );
  assert.ok(block, `${name} not found`);
  return [...block[1].matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]);
}

test('standings is not one of the views everyone sees', () => {
  assert.ok(!viewKeys('LEAGUE_VIEWS').includes('standings'));
});

test('standings is still reachable, for admins', () => {
  assert.deepEqual(viewKeys('ADMIN_LEAGUE_VIEWS'), ['standings']);
});

test('the admin list is only added for an admin', () => {
  assert.match(
    source,
    /const visibleViews = isAdmin \? \[\.\.\.LEAGUE_VIEWS, \.\.\.ADMIN_LEAGUE_VIEWS\] : LEAGUE_VIEWS;/,
  );
});

test('the tab strip renders the gated list, not the public one', () => {
  assert.match(source, /\{visibleViews\.map\(\(view\) => \(/);
  assert.ok(
    !/\{LEAGUE_VIEWS\.map\(/.test(source),
    'the strip is back to mapping LEAGUE_VIEWS, so the admin tab would never render',
  );
});

test('a typed ?view=standings cannot walk around the gate', () => {
  assert.match(
    source,
    /visibleViews\.some\(\(view\) => view\.key === requestedView\) \? requestedView : 'this-week'/,
  );
});
