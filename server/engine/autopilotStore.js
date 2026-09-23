/**
 * Lineup-autopilot opt-ins. Per league: whether the user gave Odds Gods reign to
 * keep their ESPN lineup optimal, plus the last sweep's result. Persisted to the
 * Render persistent disk (server/data) so it survives restarts, keyed by leagueId.
 * The actual ESPN cookies live in the encrypted espnCredStore; this only records
 * consent + audit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DIR, 'autopilot.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** { userId, season, enabled, lastRun, lastResult } for a league, or null. */
export function getAutopilot(leagueId) {
  return readAll()[String(leagueId)] ?? null;
}

export function setAutopilot(leagueId, patch) {
  const all = readAll();
  const key = String(leagueId);
  all[key] = { ...(all[key] ?? {}), ...patch };
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
  const all = readAll();
  return Object.entries(all)
    .filter(([, v]) => v?.enabled)
    .map(([leagueId, v]) => ({ leagueId, ...v }));
}
