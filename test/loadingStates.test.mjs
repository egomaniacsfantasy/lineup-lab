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

test('both sides of the hero say the same thing while pricing', async () => {
  const source = await fs.readFile(path.resolve('src/pages/MatchupPage.tsx'), 'utf8');
  const uses = source.match(/<PricingOdds/g) ?? [];
  assert.equal(uses.length, 2, 'your side and theirs should both show it');
});

test('the pricing placeholder never touches the engine', async () => {
  /**
   * The churn is the design and it stays: a frozen blank in the slot a price
   * is about to occupy reads as broken, and a board that does not move while
   * it works is not what a book looks like.
   *
   * What it must never be is DERIVED from anything. A half-computed price
   * shown as though it were finished is the exact problem this widget exists
   * to solve, so the values are random precisely because they are meaningless.
   */
  const source = await fs.readFile(
    path.resolve('src/components/matchup/PricingOdds.tsx'),
    'utf8',
  );

  assert.match(source, /Math\.random/, 'the placeholder stopped churning');

  /* Checked against the code with comments stripped: the doc above this
     component quotes the numbers it exists to stop rendering, and naming them
     is not printing them. The meta-assertion keeps the stripping honest. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.ok(code.length < source.length, 'nothing was stripped, so this proves nothing');
  assert.doesNotMatch(
    code,
    /engine|projection|winProbability|moneyline/i,
    'the placeholder is reading something real',
  );
  assert.match(code, /clearInterval/, 'the timer has to be cleaned up');
});

test('the pricing placeholder does not dress as a settled price', async () => {
  /**
   * This is the part that actually went wrong, and it was never the churn.
   *
   * A hero at -311 that "repriced" to +169 turned out to be two frames of
   * this, read as the book changing its mind by five hundred points. Every
   * frame drew a magnitude between 105 and 365 with a random sign, in the same
   * face and colour as the real number, which made a screenshot of a loading
   * state indistinguishable from a quote.
   *
   * So the costume is the guard, not the movement: dimmed, and set in the mono
   * face rather than the display face every settled price on this screen uses.
   */
  const css = await fs.readFile(
    path.resolve('src/components/matchup/PricingOdds.css'),
    'utf8',
  );

  assert.match(css, /--font-mono/, 'the placeholder is set in the same face as a real price');
  assert.match(css, /--text-dim/, 'the placeholder is as bright as a real price');
  /* And it must not jitter sideways at twelve frames a second, which is its
     own kind of broken. */
  assert.match(css, /tabular-nums/, 'the digits are not fixed width, so the hero twitches');
});

test('the pricing placeholder still moves, and stops when asked', async () => {
  /* The original objection to a static placeholder was fair: a board that
     freezes reads as broken. The motion just has to be carried by something
     that is not a number. */
  const css = await fs.readFile(
    path.resolve('src/components/matchup/PricingOdds.css'),
    'utf8',
  );
  assert.match(css, /animation:/, 'the placeholder sits completely still');
  assert.match(css, /prefers-reduced-motion/, 'the motion has no off switch');
});
