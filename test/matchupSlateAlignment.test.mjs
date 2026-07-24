import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('This week board keeps fixed numeric columns and a reserved movement rail on desktop and tablet', async () => {
  const css = await fs.readFile(path.resolve('src/components/league/MatchupSlate.css'), 'utf8');

  assert.match(
    css,
    /\.matchup-slate\s*\{[\s\S]*--matchup-slate-bar-width:\s*162px;[\s\S]*--matchup-slate-rail-width:\s*56px;/,
  );
  assert.match(
    css,
    /\.matchup-slate__board-head,\s*\.matchup-slate__row-button\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*66px\s*46px\s*var\(--matchup-slate-bar-width\)\s*46px\s*66px\s*minmax\(0,\s*1fr\)\s*var\(--matchup-slate-rail-width\);/,
  );
  assert.match(
    css,
    /\.matchup-slate__rail\s*\{[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*flex-end;/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*1099px\)\s*\{[\s\S]*\.matchup-slate__board-head,\s*\.matchup-slate__row-button\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*62px\s*44px\s*minmax\(120px,\s*1fr\)\s*44px\s*62px\s*minmax\(0,\s*1fr\)\s*44px;/,
  );
});
