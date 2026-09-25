/**
 * Lineup-autopilot opt-ins. Per MANAGER per league (two managers in one league
 * each have their own switch): whether the user gave Odds Gods reign to keep
 * their ESPN lineup optimal, plus the last sweep's result. Persisted to the
 * Render persistent disk (server/data) so it survives restarts. The ESPN cookies
 * live in the encrypted espnCredStore; this only records consent + audit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DIR, 'autopilot.json');

const normUser = (v) => String(v ?? '').replace(/[{}\s"]/g, '').toUpperCase();
export const autopilotKey = (leagueId, userId) => `${leagueId}|${normUser(userId)}`;

function readAll() {
  let all;
  try {
    all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
  // Pre-per-manager entries were keyed by league alone; re-key them under
  // the manager they recorded.
  for (const [k, v] of Object.entries(all)) {
    if (!k.includes('|') && v?.userId) {
      all[autopilotKey(k, v.userId)] = { ...v, ...(all[autopilotKey(k, v.userId)] ?? {}) };
      delete all[k];
    }
  }
  return all;
}

/** { userId, season, enabled, lastRun, lastResult } for one manager, or null. */
export function getAutopilot(leagueId, userId) {
  return readAll()[autopilotKey(leagueId, userId)] ?? null;
}

export function setAutopilot(leagueId, userId, patch) {
  const all = readAll();
  const key = autopilotKey(leagueId, userId);
  all[key] = { ...(all[key] ?? {}), ...patch, leagueId: String(leagueId), userId };
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  } catch (err) {
    console.error('[autopilot] persist failed', err);
  }
  return all[key];
}

/** Every ENABLED opt-in, as [{ leagueId, userId, season, ... }]. */
export function listEnabledAutopilot() {
  return Object.entries(readAll())
    .filter(([, v]) => v?.enabled)
    .map(([key, v]) => ({ ...v, leagueId: v.leagueId ?? key.split('|')[0] }));
}
