/**
 * The trade board, per manager per league: the latest background scan of every
 * other manager for deals that lift this manager's title odds, so the Trades
 * tab's open question ("anyone, anything") is answered from a scan that has
 * already run rather than a walk the person has to sit through.
 *
 * Who gets one: anyone who has opened the Trades tab with a league connected.
 * The GET route registers the (league, manager) pair; the sweep keeps every
 * registered pair fresh (first visit, after a projections push settles, and
 * every few hours), one at a time, in the scan worker. Pairs nobody has looked
 * at in a while stop being scanned.
 *
 * Same shape and home as the trade sender's store (server/data, the Render
 * persistent disk), kept separate so the sender's rules, offers and sent log
 * never mix with a board that has none of them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DIR, 'trade-board.json');

/** A board nobody has opened in this long is no longer kept warm. */
export const BOARD_IDLE_MS = 14 * 24 * 60 * 60_000;

const normUser = (v) => String(v ?? '').replace(/[{}\s"]/g, '').toUpperCase();
export const boardKey = (leagueId, userId) => `${leagueId}|${normUser(userId)}`;

function readAll() {
  try {
    const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  } catch (err) {
    console.error('[trade-board] persist failed', err);
  }
}

export function getTradeBoard(leagueId, userId) {
  return readAll()[boardKey(leagueId, userId)] ?? null;
}

/**
 * Note that this manager looked at their board. Creates the entry on the first
 * look (with what the headless scan needs to rebuild the league: provider and
 * season) and stamps every look after that.
 */
export function registerTradeBoard(leagueId, { userId, provider = 'sleeper', season = null } = {}) {
  if (!userId) return null;
  const all = readAll();
  const key = boardKey(leagueId, userId);
  const now = Date.now();
  const current = all[key] ?? {};
  all[key] = {
    ...current,
    leagueId: String(leagueId),
    userId: String(userId),
    provider: provider || current.provider || 'sleeper',
    season: season ?? current.season ?? null,
    suggestions: current.suggestions ?? [],
    lastScan: current.lastScan ?? null,
    lastSeenAt: now,
  };
  writeAll(all);
  return all[key];
}

export function setTradeBoard(leagueId, userId, patch) {
  const all = readAll();
  const key = boardKey(leagueId, userId);
  all[key] = { ...(all[key] ?? { leagueId: String(leagueId), userId: String(userId) }), ...patch };
  writeAll(all);
  return all[key];
}

/** Every board still worth keeping warm. */
export function listTradeBoards(now = Date.now()) {
  return Object.values(readAll())
    .filter((entry) => entry && entry.leagueId && entry.userId)
    .filter((entry) => now - (entry.lastSeenAt ?? 0) <= BOARD_IDLE_MS);
}
