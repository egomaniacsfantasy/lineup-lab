import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const FUTURES = 'src/components/league/LeagueFutures.tsx';
const FUTURES_CSS = 'src/components/league/LeagueFutures.css';

/**
 * The futures board sorts, and does not toggle markets.
 *
 * The toggle swapped which of two facts already on the row got the big type —
 * playoff probability and the title price were both on screen either way — so
 * it looked like a control that did nothing. It is gone; the board is the
 * title market.
 *
 * What replaced it is column sorting, which brings two traps that these guard.
 */

async function source() {
  return fs.readFile(path.resolve(FUTURES), 'utf8');
}

test('the market toggle is gone, and the board is the title market', async () => {
  const text = await source();

  assert.doesNotMatch(text, /CHART_OPTIONS/, 'the market toggle is back');
  assert.doesNotMatch(text, /isPlayoffMarket/, 'the board is branching on a market again');
  assert.doesNotMatch(text, /league-futures__market-option/);

  const css = await fs.readFile(path.resolve(FUTURES_CSS), 'utf8');
  assert.doesNotMatch(css, /league-futures__markets\b/, 'the toggle still has styles');
});

test('prices sort by the probability behind them, never as numbers', async () => {
  const text = await source();

  /* The trap: +2400 is arithmetically larger than −500, and the team holding
     it is far worse. Sorting the two price columns on the raw odds would put
     the longest shot in the league on top of a board sorted "best first". */
  const titleCase = text.match(/case 'title':\s*\n\s*return ([^;]+);/);
  assert.ok(titleCase, "the title column's sort key is gone");
  assert.match(
    titleCase[1],
    /impliedProbability/,
    `title price sorts on ${titleCase[1].trim()}, which ranks +2400 above -500`,
  );

  const openCase = text.match(/case 'open':\s*\n\s*return ([^;]+);/);
  assert.ok(openCase, "the open column's sort key is gone");
  assert.match(
    openCase[1],
    /openProb/,
    `open price sorts on ${openCase[1].trim()}, which ranks a longshot as the favourite`,
  );
});

test('a missing value ranks last, not lowest', async () => {
  const text = await source();
  /* A league that began before we priced it has no opening snapshot. Treated
     as a small number it would sort to one end of the board and read as a
     rank; "we never priced this" is not a rank. */
  assert.match(text, /if \(a == null && b == null\) return 0;/);
  assert.match(text, /if \(a == null\) return 1;/);
  assert.match(text, /if \(b == null\) return -1;/);
});

test('the playoff line is drawn only in the engine order', async () => {
  const text = await source();
  /* The line marks the cut in the seeding the sim produced. Across a board
     sorted by team name it would be a rule through an arbitrary row, claiming
     a cut that ordering does not decide. */
  assert.match(
    text,
    /sort == null && index === playoffTeams/,
    'the playoff line survives a re-sort, where it means nothing',
  );
});

test('a third click returns the board to the engine order', async () => {
  const text = await source();
  /* Because that is the only ordering in which the playoff line shows, there
     has to be a way back to it that is not a page reload. */
  assert.match(text, /return flipped === column\.firstDirection \? null : \{ key, direction: flipped \}/);
});

test('every sortable column declares which way is best', async () => {
  const text = await source();
  const block = text.match(/const SORTABLE[\s\S]*?\n\];/);
  assert.ok(block, 'the column list is gone');

  /* Best-first is not the same direction in every column: the best average
     seed is the lowest number, the best price the shortest. */
  assert.match(block[0], /key: 'avgSeed'[^}]*firstDirection: 'asc'/);
  assert.match(block[0], /key: 'projWins'[^}]*firstDirection: 'desc'/);
  assert.match(block[0], /key: 'team'[^}]*firstDirection: 'asc'/);

  const columns = [...block[0].matchAll(/key: '(\w+)'/g)].map((match) => match[1]);
  assert.deepEqual(columns, ['team', 'projWins', 'avgSeed', 'playoffProb', 'open', 'title', 'move']);
});
