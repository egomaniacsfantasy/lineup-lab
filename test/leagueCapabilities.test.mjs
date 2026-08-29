import assert from 'node:assert/strict';
import test from 'node:test';
import { connectedSeasonIsStale, tradesSupported } from '../src/utils/leagueCapabilities.ts';

const league = (over) => ({
  league: { season: '2026', leagueType: 'redraft', ...over },
  state: { season: '2026', week: 1, seasonType: 'regular' },
});

test('trades are a redraft feature', () => {
  assert.equal(tradesSupported(league()), true);
  /* Dynasty and keeper both trade assets the engine does not price: draft
     picks, and players held for seasons the sim never runs. */
  assert.equal(tradesSupported(league({ leagueType: 'dynasty' })), false);
  assert.equal(tradesSupported(league({ leagueType: 'keeper' })), false);
  assert.equal(tradesSupported(null), false);
});

test('a league from a finished season is spotted', () => {
  assert.equal(connectedSeasonIsStale(league()), false);
  /* The case that shipped: a dynasty league connected last year keeps
     answering with last year's rosters and never errors. */
  assert.equal(connectedSeasonIsStale(league({ season: '2025' })), true);
  /* Numbers and strings both come off providers. */
  const numeric = league();
  numeric.league.season = 2026;
  assert.equal(connectedSeasonIsStale(numeric), false);
});

test('nothing missing is ever reported as stale', () => {
  assert.equal(connectedSeasonIsStale(null), false);
  const noState = league();
  noState.state = undefined;
  assert.equal(connectedSeasonIsStale(noState), false);
});

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Every surface that offers a trade asks the same question.
 *
 * The gap that shipped: the header and the tab bar hid Trades for a dynasty
 * league, the trade page blocked it, and the Hub's deals module went on
 * offering trades anyway because nobody had told it. Four agreeing and a
 * fifth not is what a rule written out five times eventually does.
 */
test('nothing decides for itself whether a league can trade', async () => {
  const surfaces = [
    'src/components/layout/AppHeader.tsx',
    'src/components/layout/BottomTabBar.tsx',
    'src/pages/TradePage.tsx',
    'src/pages/MatchupPage.tsx',
  ];

  for (const file of surfaces) {
    const source = await fs.readFile(path.resolve(file), 'utf8');
    assert.match(source, /tradesSupported/, `${file} does not ask the shared rule`);
    /* And none of them re-derives it. A second copy is how the Hub drifted. */
    /* Any comparison, not just the dynasty and keeper spellings: writing the
       rule inverted as leagueType === 'redraft' is the same second copy and
       drifts the same way. */
    assert.doesNotMatch(
      source,
      /leagueType\s*===/,
      `${file} is deciding this for itself again`,
    );
  }
});

test('the experimental escape hatch is gone, not merely defaulted off', async () => {
  /* It was ON, which is how the broken surface reached a real league. A flag
     that can put an unpriceable market back in front of someone is not a
     safety mechanism. */
  const files = await fs.readdir(path.resolve('src/pages'));
  const sources = await Promise.all(
    ['src/hooks/useLabsFlags.ts', ...files.map((name) => `src/pages/${name}`)]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .map(async (file) => [file, await fs.readFile(path.resolve(file), 'utf8')]),
  );
  for (const [file, source] of sources) {
    assert.doesNotMatch(source, /DynastyTradesExperimental/, `${file} still carries the flag`);
  }
});


/**
 * A price that is not a price.
 *
 * The engine guards its 0 and 1 singularity with a 1e-9 epsilon so the number
 * stays finite, and says in its own comment that the UI is meant to show a
 * dash off the raw probability instead. Six call sites printed the epsilon
 * value: a dead team's championship odds rendered as +99999999900 on the Hub.
 */
test('odds past the point of being a price are taken off the board', async () => {
  const { formatAmericanOdds, setOddsFormat } = await import('../src/utils/formatOdds.ts');
  setOddsFormat('american');

  /* What the engine emits for a probability of zero. */
  assert.equal(formatAmericanOdds(99_999_999_900), '—');
  assert.equal(formatAmericanOdds(-99_999_999_900), '—');

  /* And nothing a real market produces is touched. A genuine long shot in a
     twelve-team league still prints. */
  assert.equal(formatAmericanOdds(2310), '+2310');
  assert.equal(formatAmericanOdds(-186), '-186');
  assert.equal(formatAmericanOdds(8447), '+8447');
});
