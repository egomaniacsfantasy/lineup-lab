/**
 * Package the Chrome extension for the Web Store.
 *
 * Two things this does that zipping the folder by hand does not:
 *
 * The store build drops the localhost content-script matches. They are there
 * so the connector works against a dev server, and a reviewer reading a
 * permission list has no way to tell a dev convenience from a leftover. Fewer
 * matches, fewer questions.
 *
 * And it zips the CONTENTS, not the folder. A zip with `extension/` at its
 * root is the single most common upload rejection: the store looks for
 * manifest.json at the top level and finds a directory.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'extension');
const out = path.join(root, 'dist-extension');
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, file), path.join(out, file));
}

manifest.content_scripts[0].matches = manifest.content_scripts[0].matches.filter(
  (m) => !m.startsWith('http://localhost') && !m.startsWith('http://127.0.0.1'),
);
fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const missing = Object.values(manifest.icons).filter(
  (icon) => !fs.existsSync(path.join(out, icon)),
);
if (missing.length) throw new Error(`manifest names icons that do not exist: ${missing.join(', ')}`);

const zip = path.join(root, `odds-gods-espn-connector-v${manifest.version}.zip`);
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-q', zip, '.'], { cwd: out });

console.log(`built ${path.basename(zip)}`);
console.log(`version ${manifest.version}`);
console.log(`matches ${manifest.content_scripts[0].matches.join(', ')}`);
console.log(`files ${fs.readdirSync(out).join(', ')}`);
