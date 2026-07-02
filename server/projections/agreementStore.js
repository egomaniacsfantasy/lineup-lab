/**
 * Agreement store — the human "agreement" values your collaborator types on the
 * Projections page. Kept SEPARATE from the generated workbooks so regenerating
 * projections never wipes them.
 *
 * Live authority: server/data/agreement.json (Render persistent disk — survives
 * redeploys). Seeded on first boot from projections/agreement/<pos>.csv, which
 * the combine pipeline also refreshes, so the two stay in sync and the CSVs act
 * as a durable backup. Shape: { [position]: { [name]: value } }.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'agreement.json');
const SEED_DIR = path.join(__dirname, '..', '..', 'projections', 'agreement');

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

let _data = null;

function seedFromCsv() {
  const out = {};
  for (const pos of POSITIONS) {
    out[pos] = {};
    const f = path.join(SEED_DIR, `${pos.toLowerCase()}.csv`);
    if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const idx = line.indexOf(',');
      if (idx < 0) continue;
      const name = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
      if (name && val) out[pos][name] = val;
    }
  }
  return out;
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(_data, null, 2));
  } catch (e) {
    console.error('[agreement] persist failed', e);
  }
}

function load() {
  if (_data) return _data;
  try {
    if (fs.existsSync(STORE)) _data = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch (e) {
    console.error('[agreement] read failed, reseeding', e);
  }
  if (!_data) {
    _data = seedFromCsv();
    persist();
  }
  for (const p of POSITIONS) if (!_data[p]) _data[p] = {};
  return _data;
}

/** Full map { position: { name: value } }. */
export function getAllAgreement() {
  return load();
}

/** One value, or null. */
export function getAgreement(position, name) {
  const d = load();
  return d[position]?.[name] ?? null;
}

/** Set/clear one value; empty string clears it. Returns the stored value ('' if cleared). */
export function setAgreement(position, name, value) {
  const d = load();
  if (!POSITIONS.includes(position)) throw new Error(`unknown position ${position}`);
  if (!d[position]) d[position] = {};
  const v = value == null ? '' : String(value).trim();
  if (v) d[position][name] = v;
  else delete d[position][name];
  persist();
  return v;
}
