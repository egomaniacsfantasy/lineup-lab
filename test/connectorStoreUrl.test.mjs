import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  CONNECTOR_STORE_URL,
  PUBLISHED_CONNECTOR_ID,
} from '../src/utils/espnExtension.ts';

/**
 * The connector's store link cannot go missing.
 *
 * It went missing. The URL was a build-time variable with a blank default,
 * pinned in render.yaml (staging only) while production is configured in a
 * dashboard and built separately - so production shipped an empty string and
 * every ESPN user was told "the connector is not published yet" about a
 * connector sitting published in the store. Nothing failed; the page just
 * politely said the wrong thing.
 *
 * These run against the DEFAULT build, with no environment variable set,
 * because that is the build that broke.
 */

const ROOT = path.resolve(import.meta.dirname, '..');

test('a build with no environment variable still links to the published listing', () => {
  assert.ok(
    CONNECTOR_STORE_URL.length > 0,
    'the store URL is empty on a default build, which is the exact state that took the ESPN path down',
  );
  assert.match(
    CONNECTOR_STORE_URL,
    /^https:\/\/chromewebstore\.google\.com\/detail\//,
    'the store URL is not a Chrome Web Store listing',
  );
  assert.ok(CONNECTOR_STORE_URL.includes(PUBLISHED_CONNECTOR_ID));
});

test('the published id is a real extension id', () => {
  /* Chrome ids are 32 characters drawn from a-p. A typo that is merely the
     wrong length is the kind of thing that reads fine and 404s. */
  assert.match(
    PUBLISHED_CONNECTOR_ID,
    /^[a-p]{32}$/,
    'that is not the shape of a Chrome extension id',
  );
});

test('render.yaml and the code cannot drift apart on the id', async () => {
  const yaml = await fs.readFile(path.join(ROOT, 'render.yaml'), 'utf8');
  const match = yaml.match(/VITE_ESPN_EXTENSION_URL\s*\n\s*value:\s*"([^"]+)"/);

  /* Absent is fine - the code default covers every environment now. Present
     and disagreeing is not: staging would point somewhere the product does
     not, and the difference would only show up as a 404 in someone's face. */
  if (!match) return;
  assert.equal(
    match[1],
    CONNECTOR_STORE_URL,
    'render.yaml pins a different store URL than the code ships by default',
  );
});

test('no source file still treats a missing store URL as a state to render', async () => {
  const connect = await fs.readFile(
    path.join(ROOT, 'src/components/league/EspnConnect.tsx'),
    'utf8',
  );
  assert.ok(
    !connect.includes('not published yet'),
    'the connect screen still has an unpublished branch, which can now only fire as a lie',
  );
});
