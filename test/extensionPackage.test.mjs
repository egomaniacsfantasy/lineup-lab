import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'),
);

/**
 * What ships is not what we develop against, and that is on purpose.
 *
 * The source manifest grants the connector localhost, because loading the
 * folder unpacked is the only way to exercise the ESPN path against a dev
 * server. Shipping that would hand every installed copy's ESPN cookies to
 * anything serving on those ports on the user's machine, which contradicts the
 * one sentence the extension is sold on.
 *
 * The packager strips them. These make sure it keeps doing that, because the
 * failure is invisible: a zip with one extra match in it looks exactly like a
 * zip without one.
 */

function packagedManifest() {
  const out = path.join(os.tmpdir(), `og-pkg-${Date.now()}`);
  fs.mkdirSync(out, { recursive: true });
  execFileSync('node', ['scripts/package-extension.mjs'], { cwd: root, stdio: 'ignore' });
  const zip = path.join(root, `odds-gods-espn-connector-v${manifest.version}.zip`);
  execFileSync('unzip', ['-qo', zip, 'manifest.json', '-d', out]);
  const read = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  fs.rmSync(out, { recursive: true, force: true });
  return read;
}

test('the shipped connector cannot be talked to by localhost', () => {
  const shipped = packagedManifest();
  const matches = shipped.content_scripts.flatMap((s) => s.matches);
  for (const match of matches) {
    assert.ok(
      match.startsWith('https://'),
      `the store build grants ${match}, so any local server can ask for somebody's ESPN cookies`,
    );
  }
});

test('the shipped connector still reaches the site it exists for', () => {
  /* Stripping is easy to overdo. Without oddsgods.net the extension installs,
     announces nothing, and the connect screen says to add a connector that is
     already there. */
  const matches = packagedManifest().content_scripts.flatMap((s) => s.matches);
  assert.ok(matches.some((m) => m.includes('oddsgods.net')), 'the store build cannot see the site');
});

test('the source keeps localhost, so the ESPN path can be developed at all', () => {
  const matches = manifest.content_scripts.flatMap((s) => s.matches);
  assert.ok(
    matches.some((m) => m.startsWith('http://localhost')),
    'the source lost localhost, so the connector can no longer be tested against a dev server',
  );
});

test('the connector asks for one permission and one host', () => {
  /* The whole trust story in two lines of JSON. Anything added here changes
     what the store review is reviewing and what the welcome page promises. */
  assert.deepEqual(manifest.permissions, ['cookies']);
  assert.deepEqual(manifest.host_permissions, ['https://*.espn.com/*']);
});
