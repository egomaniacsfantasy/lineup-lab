/**
 * Server-side ESPN credential store — the "sync once, works everywhere" piece.
 *
 * Link a private league once from an active ESPN session, then re-sync it from
 * the server so every later request — any device — resolves the session from
 * this encrypted store by league id.
 *
 * Cookies are auth tokens, so they're encrypted at rest with AES-256-GCM under
 * a server key. On Render this file lives on the persistent disk.
 *
 * Privacy note: access is keyed by ESPN league id. Anyone who knows a synced
 * league's id can read it through Odds Gods — acceptable for league tooling and
 * a closed beta, but real per-user gating wants user accounts (a follow-up).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'espn-creds.json',
);

const KEY = crypto
  .createHash('sha256')
  .update(process.env.ESPN_CRED_KEY || process.env.ADMIN_PASSWORD || 'olympus-dev-key')
  .digest();

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(blob) {
  try {
    const raw = Buffer.from(blob, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null; // key rotated or corrupt — treat as no creds, prompt re-link
  }
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Canonical form of an ESPN SWID ("{ABC-...}", URL-encoded, any case -> "ABC-..."). */
export function normSwid(value) {
  let t = String(value ?? '');
  try { t = decodeURIComponent(t); } catch { /* keep raw */ }
  return t.replace(/[{}\s"]/g, '').toUpperCase();
}

/*
 * One login PER MANAGER per league (`members`, keyed by SWID). The top-level
 * fields keep the most recent link, which is fine for READS (any member can read
 * the league). WRITES must never use them: acting on a team with a league-mate's
 * login is acting as that league-mate. Writes go through getEspnCredsFor.
 */
export function saveEspnCreds(leagueId, { espnS2, swid }) {
  if (!leagueId || !espnS2 || !swid) return;
  const all = readAll();
  const key = String(leagueId);
  const prev = all[key] ?? {};
  const members = { ...(prev.members ?? {}) };
  // Carry a pre-members single entry over under its own owner.
  if (!prev.members && prev.swid) {
    const legacySwid = decrypt(prev.swid);
    if (legacySwid) members[normSwid(legacySwid)] = { espnS2: prev.espnS2, swid: prev.swid, savedAt: prev.savedAt };
  }
  const record = { espnS2: encrypt(espnS2), swid: encrypt(swid), savedAt: Date.now() };
  members[normSwid(swid)] = record;
  all[key] = { ...record, members };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

/** Any linked login for the league: for READS only. */
export function getEspnCreds(leagueId) {
  const entry = readAll()[String(leagueId)];
  if (!entry) return null;
  const espnS2 = decrypt(entry.espnS2);
  const swid = decrypt(entry.swid);
  return espnS2 && swid ? { espnS2, swid } : null;
}

/** THIS manager's own login for the league (by SWID), or null. For WRITES. */
export function getEspnCredsFor(leagueId, userSwid) {
  if (!userSwid) return null;
  const entry = readAll()[String(leagueId)];
  if (!entry) return null;
  const want = normSwid(userSwid);
  const candidates = [entry.members?.[want], entry].filter(Boolean);
  for (const c of candidates) {
    const swid = decrypt(c.swid);
    const espnS2 = decrypt(c.espnS2);
    if (espnS2 && swid && normSwid(swid) === want) return { espnS2, swid };
  }
  return null;
}
