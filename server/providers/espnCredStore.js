/**
 * Server-side ESPN credential store — the "sync once, works everywhere" piece.
 *
 * FantasyPros keeps an encrypted copy of your ESPN session cookie on their
 * servers after the one-time extension grab, then re-syncs your league on
 * their own — so your phone (no extension) stays current forever. We do the
 * same: link a private league once (extension or manual paste), the cookie
 * lands here encrypted, and every later request — any device, no extension —
 * resolves the cookie from this store by league id.
 *
 * Cookies are auth tokens, so they're encrypted at rest with AES-256-GCM under
 * a server key. On Render this file lives on the persistent disk.
 *
 * Privacy note: access is keyed by ESPN league id. Anyone who knows a synced
 * league's id can read it through Olympus — acceptable for league tooling and
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

export function saveEspnCreds(leagueId, { espnS2, swid }) {
  if (!leagueId || !espnS2 || !swid) return;
  const all = readAll();
  all[String(leagueId)] = {
    espnS2: encrypt(espnS2),
    swid: encrypt(swid),
    savedAt: Date.now(),
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

export function getEspnCreds(leagueId) {
  const entry = readAll()[String(leagueId)];
  if (!entry) return null;
  const espnS2 = decrypt(entry.espnS2);
  const swid = decrypt(entry.swid);
  return espnS2 && swid ? { espnS2, swid } : null;
}
