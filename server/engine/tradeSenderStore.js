/**
 * Trade-sender state, per manager per league: the user's standing rules, the latest scan's
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

const normUser = (v) => String(v ?? '').replace(/[{}\s"]/g, '').toUpperCase();
// Per MANAGER per league: two managers in one league each keep their own rules,
// offers and sent log.
export const senderKey = (leagueId, userId) => `${leagueId}|${normUser(userId)}`;

function readAll() {
  let all;
  try {
    all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
  // Pre-per-manager entries were keyed by league alone; re-key them.
  for (const [k, v] of Object.entries(all)) {
    if (k !== META_KEY && !k.includes('|') && v?.userId) {
      all[senderKey(k, v.userId)] = { ...v, ...(all[senderKey(k, v.userId)] ?? {}) };
      delete all[k];
    }
  }
  return all;
}

function writeAll(all) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  } catch (err) {
    console.error('[trade-sender] persist failed', err);
  }
}

const withDefaults = (key, entry) => (entry
  ? {
      ...entry,
      leagueId: entry.leagueId ?? key.split('|')[0],
      settings: { ...DEFAULT_SENDER_SETTINGS, ...(entry.settings ?? {}) },
    }
  : null);

export function getTradeSender(leagueId, userId) {
  const key = senderKey(leagueId, userId);
  return withDefaults(key, readAll()[key] ?? null);
}

export function setTradeSender(leagueId, userId, patch) {
  const all = readAll();
  const key = senderKey(leagueId, userId);
  all[key] = { ...(all[key] ?? {}), ...patch, leagueId: String(leagueId), userId };
  writeAll(all);
  return withDefaults(key, all[key]);
}

/** Append one sent-offer record to the manager's audit log (newest first, capped). */
export function logSentOffer(leagueId, userId, record) {
  const all = readAll();
  const key = senderKey(leagueId, userId);
  const entry = all[key] ?? { leagueId: String(leagueId), userId };
  entry.sent = [record, ...(entry.sent ?? [])].slice(0, 200);
  all[key] = entry;
  writeAll(all);
}

/** Patch sent-offer records (matched by ESPN transaction id) in one write. */
export function updateSentOffers(leagueId, userId, patchesById) {
  const all = readAll();
  const entry = all[senderKey(leagueId, userId)];
  if (!entry?.sent) return;
  entry.sent = entry.sent.map((r) => (patchesById[r.espnTransactionId] ? { ...r, ...patchesById[r.espnTransactionId] } : r));
  writeAll(all);
}

const entries = () => Object.entries(readAll()).filter(([k]) => k !== META_KEY);

/** Managers the watcher must look at: any offer still pending, or an accepted
 *  trade ESPN has not processed yet. */
export function listWatchedTradeSenders() {
  return entries()
    .filter(([, v]) => v?.awaitingTrade || (v?.sent ?? []).some((r) => r.state === 'pending'))
    .map(([k, v]) => withDefaults(k, v));
}

export function listEnabledTradeSenders() {
  return entries()
    .filter(([, v]) => v?.enabled && !v?.awaitingTrade)
    .map(([k, v]) => withDefaults(k, v));
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
