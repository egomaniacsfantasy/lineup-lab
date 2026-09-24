/**
 * Trade-sender state, per league: the user's standing rules, the latest scan's
 * suggested offers, and an audit log of every offer actually sent to ESPN.
 * Persisted to the Render persistent disk (server/data) so it survives the
 * redeploy every projection push triggers. Cookies live in espnCredStore, not here.
 *
 * Also holds the projections fingerprint (`_projections`) that drives the
 * quiet-period trigger: a new fingerprint marks changedAt, and scans wait until
 * nothing new has landed for a while (a full rerun pushes positions one by one).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DIR, 'trade-sender.json');
const META_KEY = '_projections';

export const DEFAULT_SENDER_SETTINGS = {
  partners: [],        // opposing rosterIds to trade with; empty = every manager
  giveAllow: [],       // my players I'm willing to give; empty = any not protected
  protect: [],         // my players never offered
  givePositions: [],   // empty = any of QB/RB/WR/TE
  getPositions: [],
  minYouDelta: 1,      // X: my title % must rise at least this much (pts)
  maxPartnerLoss: 3,   // Y: the partner's title % may fall at most this much (pts)
};

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(all) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  } catch (err) {
    console.error('[trade-sender] persist failed', err);
  }
}

export function getTradeSender(leagueId) {
  const entry = readAll()[String(leagueId)] ?? null;
  if (!entry) return null;
  return { ...entry, settings: { ...DEFAULT_SENDER_SETTINGS, ...(entry.settings ?? {}) } };
}

export function setTradeSender(leagueId, patch) {
  const all = readAll();
  const key = String(leagueId);
  all[key] = { ...(all[key] ?? {}), ...patch };
  writeAll(all);
  return getTradeSender(leagueId);
}

/** Append one sent-offer record to the league's audit log (newest first, capped). */
export function logSentOffer(leagueId, record) {
  const all = readAll();
  const key = String(leagueId);
  const entry = all[key] ?? {};
  entry.sent = [record, ...(entry.sent ?? [])].slice(0, 200);
  all[key] = entry;
  writeAll(all);
}

export function listEnabledTradeSenders() {
  return Object.entries(readAll())
    .filter(([k, v]) => k !== META_KEY && v?.enabled)
    .map(([leagueId]) => ({ leagueId, ...getTradeSender(leagueId) }));
}

/** Record the fingerprint of the projections this process booted with. */
export function noteProjectionsFingerprint(fingerprint, now = Date.now()) {
  const all = readAll();
  const meta = all[META_KEY] ?? {};
  if (meta.fingerprint !== fingerprint) {
    all[META_KEY] = { fingerprint, changedAt: now };
    writeAll(all);
    return all[META_KEY];
  }
  return meta;
}

export function getProjectionsMeta() {
  return readAll()[META_KEY] ?? null;
}
