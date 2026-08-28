import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * The three markets line up down every card.
 *
 * The board is a grid of matchup cards now rather than one wide row per game,
 * and the property that survives the change is the reason the old grid was
 * fixed at all: the spread, the total and the price occupy the same columns
 * on both sides of a card and under the labels above them. A book's board is
 * readable because its numbers form columns; lose that and it is two rows of
 * loose figures.
 *
 * The old movement rail stays gone. It reserved a column at the end of every
 * row for one figure that never said which of the two teams it described.
 */
test('the card labels and both sides share one column template', async () => {
  const css = await fs.readFile(path.resolve('src/components/league/MatchupSlate.css'), 'utf8');

  assert.match(
    css,
    /\.matchup-slate__card-cols,\s*\.matchup-slate__side\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*60px\s*76px\s*68px;/,
    'the labels and the two team rows no longer share a template, so the markets will not line up',
  );

  /* Two or three across, never one very wide card. */
  assert.match(
    css,
    /\.matchup-slate__rows\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(392px,\s*1fr\)\);/,
  );

  assert.doesNotMatch(css, /--matchup-slate-rail-width/, 'the rail column is back');
  assert.doesNotMatch(css, /\.matchup-slate__rail\b/, 'the rail still has styles');
});
