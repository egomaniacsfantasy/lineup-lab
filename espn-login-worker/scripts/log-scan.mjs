import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const forbidden = [
  /console\.(log|info|warn|error)\([^)]*password/i,
  /console\.(log|info|warn|error)\([^)]*espnS2/i,
  /console\.(log|info|warn|error)\([^)]*espn_s2/i,
  /console\.(log|info|warn|error)\([^)]*swid/i,
  /console\.(log|info|warn|error)\([^)]*cookie/i,
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') return [];
      return walk(full);
    }
    return entry.isFile() && /\.(js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

for (const file of walk(path.join(root, 'src'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    assert.equal(pattern.test(text), false, `${path.relative(root, file)} leaks a secret-shaped value`);
  }
}

console.log('log scan passed');
