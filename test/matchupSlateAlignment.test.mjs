import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('This week board keeps a fixed right rail for chips on desktop and tablet', async () => {
  const css = await fs.readFile(path.resolve('src/components/league/MatchupSlate.css'), 'utf8');

  assert.match(
    css,
    /\.matchup-slate\s*\{[\s\S]*--matchup-slate-bar-width:\s*180px;[\s\S]*--matchup-slate-chip-rail-width:\s*168px;/,
  );
  assert.match(
    css,
    /\.matchup-slate__row-button\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content\s*max-content\s*var\(--matchup-slate-bar-width\)\s*max-content\s*max-content\s*minmax\(0,\s*1fr\)\s*var\(--matchup-slate-chip-rail-width\);/,
  );
  assert.match(
    css,
    /\.matchup-slate__extras\s*\{[\s\S]*width:\s*var\(--matchup-slate-chip-rail-width\);/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*900px\)\s*\{[\s\S]*\.matchup-slate__row-button\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content\s*max-content\s*minmax\(116px,\s*1fr\)\s*max-content\s*132px;/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*900px\)\s*\{[\s\S]*\.matchup-slate__extras\s*\{[\s\S]*width:\s*132px;/,
  );
});
