import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const headerSource = await readFile(new URL('../src/components/layout/AppHeader.tsx', import.meta.url), 'utf8');
const tabsSource = await readFile(new URL('../src/components/layout/BottomTabBar.tsx', import.meta.url), 'utf8');
const moreSource = await readFile(new URL('../src/pages/MorePage.tsx', import.meta.url), 'utf8');

test('Board merge keeps one board nav and redirects /projections into sheet view', () => {
  assert.match(appSource, /path="\/projections"\s+element={<Navigate replace to="\/rankings\?view=sheet" \/>}/);
  assert.doesNotMatch(headerSource, /label:\s*'Projections'/);
  assert.doesNotMatch(tabsSource, /label:\s*'Proj'/);
  assert.match(moreSource, /path:\s*'\/rankings\?view=sheet'/);
});
