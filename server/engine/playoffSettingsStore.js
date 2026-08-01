/**
 * Per-league playoff-structure OVERRIDES. When we can't confidently detect a
 * setting from the provider (division-winner seeding priority, or reseeding on
 * Sleeper), the user sets it on the site and we persist it here. loadLeagueContext
 * layers these onto the detected league config before every sim.
 *
 * Append-only JSON on disk (Render persistent disk), keyed by leagueId.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DIR, 'playoff-settings.json');

const OVERRIDABLE = ['divisionWinnerPriority', 'playoffReseed'];

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function readPlayoffSettings(leagueId) {
  return readAll()[String(leagueId)] ?? null;
}

export function writePlayoffSettings(leagueId, settings) {
  const all = readAll();
  const next = { ...(all[String(leagueId)] ?? {}) };
  for (const key of OVERRIDABLE) {
    if (key in (settings ?? {})) next[key] = settings[key]; // null clears the override
  }
  all[String(leagueId)] = next;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  } catch (err) {
    console.error('[playoffSettings] write failed:', err?.message ?? err);
  }
  return next;
}

/** Cache-busting signature so a settings change re-prices the league. */
export function playoffSettingsSignature(leagueId) {
  const s = readPlayoffSettings(leagueId);
  if (!s) return '';
  return `dwp=${s.divisionWinnerPriority ?? ''}:rs=${s.playoffReseed ?? ''}`;
}
