import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * What the app is allowed to claim while it is still loading.
 *
 * Switching leagues showed two things that were not true yet: the previous
 * league's name under the league you just clicked, and a hero reading +100
 * against +100. Both corrected themselves a second later, which is what made
 * them easy to dismiss and worse to look at: they are not blanks, they are
 * confident wrong answers that a person can read and believe.
 */

test('a stale bootstrap cannot name the active league', async () => {
  const source = await fs.readFile(path.resolve('src/components/layout/AccountMenu.tsx'), 'utf8');

  /* `stored` changes the instant you click a league; the bootstrap for it lands
     later. In between, the bootstrap belongs to the PREVIOUS league, and naming
     the active row from it put a Sleeper league's name under an ESPN one. */
  assert.match(
    source,
    /bootstrapIsForActive/,
    'the active league name is being taken from whatever bootstrap is loaded',
  );
  assert.match(
    source,
    /String\(bootstrap\.league\.id\) === String\(stored\.leagueId\)/,
    'the bootstrap must be checked against the active league before it names it',
  );
});

test('an unpriced matchup does not print a price', async () => {
  const source = await fs.readFile(path.resolve('src/pages/MatchupPage.tsx'), 'utf8');

  const start = source.indexOf('const formatDisplayedOdds');
  assert.ok(start > -1, 'could not find the odds formatter');
  const body = source.slice(start, source.indexOf('\n  };', start));

  /* The engine's unpriced default is an even market, so both sides formatted to
     +100. That is not "unknown", it is a claim that the game is a coin flip. */
  assert.match(body, /if \(!isPriced\) return/, 'unpriced odds are still being formatted as a price');
});

test('the pending hero is marked so it can be styled as pending', async () => {
  const source = await fs.readFile(path.resolve('src/pages/MatchupPage.tsx'), 'utf8');
  const css = await fs.readFile(path.resolve('src/pages/MatchupPage.css'), 'utf8');

  const marks = source.match(/matchup-page__hero-number--pending/g) ?? [];
  assert.ok(marks.length >= 2, 'both sides of the hero should carry the pending state');
  assert.match(css, /\.matchup-page__hero-number--pending/, 'the pending state needs to look different');

  /* A pulsing number is motion nobody asked for if they have asked for less. */
  assert.match(css, /prefers-reduced-motion/, 'the pulse must respect reduced motion');
});
