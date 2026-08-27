import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * The rail is gone; the fixed numeric columns are not.
 *
 * The board used to reserve a column at the end of every row for one movement
 * figure. That figure now sits inside each team's own lockup, which is what
 * lets both lockups sit flush against the edges of the row — see
 * matchupSlateBoardRowRegression for the rendered proof. What has to survive
 * is the reason the grid is fixed at all: the two price columns and the bar
 * between them are the same width on every row, so the numbers line up into
 * columns you can read down.
 */
test('This week board keeps fixed numeric columns, and no movement rail', async () => {
  const css = await fs.readFile(path.resolve('src/components/league/MatchupSlate.css'), 'utf8');

  assert.match(css, /\.matchup-slate\s*\{[\s\S]*--matchup-slate-bar-width:\s*162px;/);
  assert.match(
    css,
    /\.matchup-slate__board-head,\s*\.matchup-slate__row-button\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*64px\s*var\(--matchup-slate-bar-width\)\s*64px\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*1099px\)\s*\{[\s\S]*\.matchup-slate__board-head,\s*\.matchup-slate__row-button\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*62px\s*minmax\(120px,\s*1fr\)\s*62px\s*minmax\(0,\s*1fr\);/,
  );

  /* The rail cannot come back without the team lockups stopping short of the
     row edges again, which is the whole reason it went. */
  assert.doesNotMatch(css, /--matchup-slate-rail-width/, 'the rail column is back');
  assert.doesNotMatch(css, /\.matchup-slate__rail\b/, 'the rail still has styles');
});
