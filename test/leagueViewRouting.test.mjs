import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const PAGE = 'src/pages/LeaguePage.tsx';

/**
 * A tab that renders but does nothing when clicked.
 *
 * Two separate places decided which views are legal. parseLeagueView checked
 * LEAGUE_VIEWS, which does not contain 'standings'; activeView checked
 * visibleViews, which for an admin does. Clicking Standings set
 * ?view=standings, parseLeagueView coerced it straight back to 'this-week',
 * and activeView never got to see the real request. The tab was visible,
 * clickable, and inert.
 *
 * The fix is that permission is decided once. parseLeagueView reads any known
 * view; activeView is the only gate.
 */

test('the URL parser knows about every view, admin ones included', async () => {
  const source = await fs.readFile(path.resolve(PAGE), 'utf8');
  const body = source.slice(
    source.indexOf('function parseLeagueView'),
    source.indexOf('function recordLabel'),
  );
  assert.ok(body.length > 0, 'parseLeagueView not found');
  assert.match(
    body,
    /ALL_LEAGUE_VIEWS\.some/,
    'parseLeagueView is filtering by a subset of views again, which silently '
      + 'coerces any view it does not list back to the default',
  );
  assert.doesNotMatch(
    body,
    /\bLEAGUE_VIEWS\.some/,
    'parseLeagueView must not check LEAGUE_VIEWS alone: that is the exact '
      + 'shape that made the Standings tab inert',
  );
});

test('ALL_LEAGUE_VIEWS is built from both lists rather than retyped', async () => {
  const source = await fs.readFile(path.resolve(PAGE), 'utf8');
  assert.match(
    source,
    /const ALL_LEAGUE_VIEWS = \[\.\.\.LEAGUE_VIEWS, \.\.\.ADMIN_LEAGUE_VIEWS\]/,
    'a hand-written list would go stale the moment a view is added',
  );
});

test('only one place decides who may see a view', async () => {
  const source = await fs.readFile(path.resolve(PAGE), 'utf8');
  /* The gate. If this stops being the thing that narrows to visibleViews, a
     hidden tab becomes reachable by typing its URL. */
  assert.match(
    source,
    /visibleViews\.some\(\(view\) => view\.key === requestedView\)/,
    'the admin gate moved or changed shape',
  );
});

test('the tabs that shipped still resolve after the rename', async () => {
  const source = await fs.readFile(path.resolve(PAGE), 'utf8');

  /* "This week", "Schedule" and "All-play" were real URLs that people have in
     history and bookmarks. A renamed tab that quietly answers with the default
     view is a link that lies about where it went. */
  assert.match(source, /const LEGACY_VIEWS: Record<string, LeagueView> = \{/);
  for (const [old, next] of [
    ["'this-week'", 'board'],
    ['schedule', 'season'],
    ['luck', 'season'],
  ]) {
    assert.match(
      source,
      new RegExp(`${old.replace(/'/g, "'?")}: '${next}'`),
      `${old} no longer maps to ${next}, so an old link lands on the wrong tab`,
    );
  }

  assert.match(
    source,
    /if \(raw && raw in LEGACY_VIEWS\) return LEGACY_VIEWS\[raw\];/,
    'parseLeagueView stopped honouring the legacy names',
  );
});

test('Season carries both halves, since that was the point of merging', async () => {
  const source = await fs.readFile(path.resolve(PAGE), 'utf8');
  const season = source.slice(
    source.indexOf("activeView === 'season'"),
    source.indexOf('selectedWeek && bootstrap'),
  );
  assert.ok(season.length > 0, 'the season branch is gone');
  assert.match(season, /<ScheduleGrid/, 'the heat strip did not come across');
  assert.match(season, /<LuckBoard/, 'the priced standings did not come across');
  /* And the tab it replaced must not still exist, or the merge left a
     destination nobody can reach. */
  assert.doesNotMatch(source, /activeView === 'schedule'/);
});
