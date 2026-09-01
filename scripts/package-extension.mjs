#!/usr/bin/env node
/**
 * Build the Chrome Web Store zip.
 *
 * It exists for one rule that a hand-made zip cannot enforce: the SHIPPED
 * manifest must not grant the connector access to localhost.
 *
 * The source manifest does grant it, deliberately, because loading this folder
 * unpacked is the only way to exercise the connector against a dev server, and
 * without it the whole ESPN path is untestable locally. But shipping it means
 * every installed copy will hand the user's ESPN cookies to anything serving
 * on those ports on their machine. That is a narrow risk and a real one, and it
 * contradicts the posture the extension is sold on: two cookies, read-only,
 * only when an Odds Gods tab asks.
 *
 * So the store build strips them, and a test asserts the zip has no http://
 * match in it. The two manifests cannot drift, because one is made from the
 * other every time.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'extension');

const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const version = manifest.version;

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'og-ext-'));
fs.cpSync(source, staging, { recursive: true });

/* The one difference between what we develop against and what people install. */
const shipped = JSON.parse(JSON.stringify(manifest));
for (const script of shipped.content_scripts ?? []) {
  script.matches = (script.matches ?? []).filter((match) => match.startsWith('https://'));
}
fs.writeFileSync(
  path.join(staging, 'manifest.json'),
  `${JSON.stringify(shipped, null, 2)}\n`,
);

const out = path.join(root, `odds-gods-espn-connector-v${version}.zip`);
fs.rmSync(out, { force: true });
execFileSync('zip', ['-qr', out, '.', '-x', '.*', '-x', '__MACOSX/*'], { cwd: staging });

const uploadDir = path.join(root, 'store-upload');
fs.mkdirSync(uploadDir, { recursive: true });
fs.copyFileSync(out, path.join(uploadDir, path.basename(out)));
fs.rmSync(staging, { recursive: true, force: true });

const dropped = (manifest.content_scripts ?? [])
  .flatMap((s) => s.matches ?? [])
  .filter((m) => !m.startsWith('https://'));

console.log(`packaged v${version} -> ${path.relative(root, out)}`);
console.log(`shipped matches: ${shipped.content_scripts[0].matches.join(', ')}`);
if (dropped.length) console.log(`stripped for the store: ${dropped.join(', ')}`);
