/**
 * Agreement store — the human "agreement" values your two collaborators type on
 * the Projections page. One column per person (Vlahakis, Williams). Kept SEPARATE
 * from the generated workbooks so regenerating projections never wipes them.
 *
 * Live authority: server/data/agreement.json (Render persistent disk — survives
 * redeploys). Seeded on first boot from projections/agreement/<pos>.csv, which the
 * combine pipeline also refreshes, so the two stay in sync and the CSVs act as a
 * durable backup. Shape: { [position]: { [name]: { vlahakis, williams } } }.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'agreement.json');
const SEED_DIR = path.join(__dirname, '..', '..', 'projections', 'agreement');

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
// The named editor columns. key = data/CSV column; label = header shown in the UI.
export const COLUMNS = [
  { key: 'vlahakis', label: 'Vlahakis' },
  { key: 'williams', label: 'Williams' },
];
export const COLUMN_KEYS = COLUMNS.map((c) => c.key);

let _data = null;

function emptyCell() {
  const c = {};
  for (const k of COLUMN_KEYS) c[k] = '';
  return c;
}

// Minimal CSV line split that tolerates simple quoted fields.
function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function seedFromCsv() {
  const out = {};
  for (const pos of POSITIONS) {
    out[pos] = {};
    const f = path.join(SEED_DIR, `${pos.toLowerCase()}.csv`);
    if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    const header = splitCsv(lines[0] ?? '').map((h) => h.trim().toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cells = splitCsv(lines[i]);
      const name = (cells[0] ?? '').trim();
      if (!name) continue;
      const cell = emptyCell();
      for (const k of COLUMN_KEYS) {
        const idx = header.indexOf(k);
        if (idx >= 0) cell[k] = (cells[idx] ?? '').trim();
      }
      out[pos][name] = cell;
    }
  }
  return out;
}

function normalizeCell(v) {
  // Accept legacy string values and coerce to the multi-column shape.
  if (v && typeof v === 'object') {
    const cell = emptyCell();
    for (const k of COLUMN_KEYS) cell[k] = v[k] == null ? '' : String(v[k]);
    return cell;
  }
  return emptyCell();
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
  for (const p of POSITIONS) {
    if (!_data[p]) _data[p] = {};
    for (const name of Object.keys(_data[p])) _data[p][name] = normalizeCell(_data[p][name]);
  }
  return _data;
}

/** Full map { position: { name: { vlahakis, williams } } }. */
export function getAllAgreement() {
  return load();
}

/** One player's cell { vlahakis, williams } (empty strings if unset). */
export function getAgreement(position, name) {
  const d = load();
  return d[position]?.[name] ?? emptyCell();
}

/** Set/clear one column for one player; empty string clears it. Returns the cell. */
export function setAgreement(position, name, column, value) {
  const d = load();
  if (!POSITIONS.includes(position)) throw new Error(`unknown position ${position}`);
  if (!COLUMN_KEYS.includes(column)) throw new Error(`unknown column ${column}`);
  if (!d[position]) d[position] = {};
  if (!d[position][name]) d[position][name] = emptyCell();
  d[position][name][column] = value == null ? '' : String(value).trim();
  persist();
  return d[position][name];
}
