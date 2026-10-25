// Model (ESPN depth-chart) names that differ from the Sleeper catalog must still resolve,
// or the rostered player shows a 0 projection on the site (Bam Knight, 2026-10-25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogNameKey, MODEL_NAME_ALIASES } from '../server/projections/adjusted.js';
import { normalizeName } from '../server/projections/importer.js';

test('nickname model names map to the Sleeper catalog name', () => {
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
