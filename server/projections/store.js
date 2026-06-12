/**
 * Versioned projection storage. File-backed under server/data/projections.
 *
 * NOTE (deployment): Render's filesystem is ephemeral across deploys —
 * attach a persistent disk (or move this to a real store) before relying
 * on import history surviving a redeploy. Flagged in the phase summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'projections',
);
const INDEX = path.join(DIR, 'index.json');

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  } catch {
    return { active: null, versions: [], confirmedMatches: {} };
  }
}

function writeIndex(index) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2));
}

export function listVersions() {
  const index = readIndex();
  return { active: index.active, versions: index.versions };
}

export function getConfirmedMatches() {
  return readIndex().confirmedMatches ?? {};
}

export function rememberMatches(newMatches) {
  const index = readIndex();
  index.confirmedMatches = { ...index.confirmedMatches, ...newMatches };
  writeIndex(index);
}

export function saveVersion(version, projections, meta) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DIR, `${version}.json`),
    JSON.stringify({ version, meta, projections }),
  );

  const index = readIndex();
  index.versions = [
    { version, ...meta, count: projections.length, importedAt: Date.now() },
    ...index.versions.filter((v) => v.version !== version),
  ];
  index.active = version;
  writeIndex(index);
}

export function activateVersion(version) {
  const index = readIndex();
  if (!index.versions.some((v) => v.version === version)) {
    throw new Error(`Unknown projection version ${version}`);
  }
  index.active = version;
  writeIndex(index);
}

export function getActiveProjections() {
  const index = readIndex();
  if (!index.active) return null;

  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(DIR, `${index.active}.json`), 'utf8'),
    );
    return data;
  } catch {
    return null;
  }
}
