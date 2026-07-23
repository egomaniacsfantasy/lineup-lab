import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('This week board keeps a fixed right rail for chips on desktop and tablet', async () => {
  const css = await fs.readFile(path.resolve('src/components/league/MatchupSlate.css'), 'utf8');

  assert.match(
    css,
    /\.matchup-slate__row-button\s*\{[\s\S]*grid-template-columns:\s*minmax\(150px,\s*1\.15fr\)\s*minmax\(70px,\s*80px\)\s*minmax\(190px,\s*1fr\)\s*minmax\(70px,\s*80px\)\s*minmax\(150px,\s*1\.15fr\)\s*124px;/,
  );
  assert.match(
    css,
    /\.matchup-slate__extras\s*\{[\s\S]*width:\s*124px;/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*900px\)\s*\{[\s\S]*\.matchup-slate__row-button\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(124px,\s*0\.95fr\)\s*112px;/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*900px\)\s*\{[\s\S]*\.matchup-slate__extras\s*\{[\s\S]*width:\s*112px;/,
  );
});
