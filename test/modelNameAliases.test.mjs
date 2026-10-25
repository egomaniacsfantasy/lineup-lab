// Nickname names (model = ESPN depth chart, and ESPN's fantasy feed) that differ from the
// Sleeper catalog must still resolve, or the player shows a 0 projection -- on the board
// (adjusted.js) AND on ESPN league rosters (espnProvider.js). Bam Knight, 2026-10-25.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalogNameKey, MODEL_NAME_ALIASES, normalizeName } from '../server/projections/importer.js';

test('nickname names map to the Sleeper catalog name', () => {
  assert.equal(catalogNameKey('Bam Knight'), normalizeName('Zonovan Knight'));
  assert.equal(catalogNameKey('Josh Palmer'), normalizeName('Joshua Palmer'));
  assert.equal(catalogNameKey('Andrew Ogletree'), normalizeName('Drew Ogletree'));
});

test('everyone else is untouched (plain normalizeName)', () => {
  for (const n of ['Puka Nacua', 'Kenneth Walker III', "Ja'Marr Chase", 'Travis Etienne Jr.']) {
    assert.equal(catalogNameKey(n), normalizeName(n));
  }
});

test('alias keys and values are already in normalizeName form', () => {
  for (const [k, v] of Object.entries(MODEL_NAME_ALIASES)) {
    assert.equal(normalizeName(k), k);
    assert.equal(normalizeName(v), v);
  }
});

test('both catalog lookups (board + ESPN rosters) go through catalogNameKey', () => {
  const adjusted = fs.readFileSync(new URL('../server/projections/adjusted.js', import.meta.url), 'utf8');
  const espn = fs.readFileSync(new URL('../server/providers/espnProvider.js', import.meta.url), 'utf8');
  assert.match(adjusted, /byNamePos\.get\(`\$\{catalogNameKey\(p\.name\)\}/);
  assert.match(espn, /byNamePos\.get\(`\$\{catalogNameKey\(espnPlayer\.fullName\)\}/);
});
