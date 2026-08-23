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

test('both sides of the hero cycle a price while pricing', async () => {
  const source = await fs.readFile(path.resolve('src/pages/MatchupPage.tsx'), 'utf8');
  const uses = source.match(/<PricingOdds/g) ?? [];
  assert.equal(uses.length, 2, 'your side and theirs should both show it');
});

test('the cycling price is decorative and never touches the engine', async () => {
  const source = await fs.readFile(path.resolve('src/components/matchup/PricingOdds.tsx'), 'utf8');

  /* The numbers are random precisely because they are meaningless. Anything
     derived from real projections would be a half-computed price shown as
     though it were finished, which is the problem this exists to solve. */
  assert.match(source, /Math\.random/);

  /* Checked against the code with comments stripped: the doc comment above this
     component explains what it must not do, and naming those things is not
     doing them. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(
    code,
    /engine|projection|winProbability|moneyline/i,
    'the placeholder is reading something real',
  );

  /* And it must stop moving for anyone who asked for less motion. */
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /clearInterval/, 'the timer has to be cleaned up');
});
