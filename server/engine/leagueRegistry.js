/**
 * Registry of leagues the scheduled repricer should keep warm. Every real
 * /lines view upserts its league here; the 6h scheduler reads the registry and
 * reprices each so the futures charts keep gaining points even when nobody is
 * looking. Persisted to disk (Render persistent volume) so it survives restarts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'league-registry.json',
);

const STALE_MS = 30 * 24 * 60 * 60_000; // drop leagues not viewed in 30 days

export function readRegistry() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Upsert a league (leagueId -> { userId, provider, season, at }). */
export function registerLeague(leagueId, { userId = null, provider = 'sleeper', season = null } = {}) {
  if (!leagueId) return;
  try {
    const now = Date.now();
    const reg = readRegistry();
    reg[String(leagueId)] = { userId: userId ?? null, provider: provider || 'sleeper', season, at: now };
    // Prune leagues nobody has viewed in a long time.
    for (const [id, info] of Object.entries(reg)) {
      if (!info?.at || now - info.at > STALE_MS) delete reg[id];
    }
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(reg));
  } catch (err) {
    console.error('[registry] write failed', err.message);
  }
}
