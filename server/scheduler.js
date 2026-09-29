/**
 * Scheduled repricer. Every 6 hours (and once shortly after boot) it reprices
 * every registered league and force-appends a timestamped snapshot to its line
 * history, so the futures charts keep gaining points over time even when nobody
 * is actively viewing the league.
 */
import { readRegistry } from './engine/leagueRegistry.js';
import { readHistory, recordPricing } from './engine/lineStore.js';
import { computeLeaguePricing, buildHeadlessProvider } from './routes/api.js';
import { anyGameLive, awaitFinalNflTeams, getNflGameState } from './live/nflGameStatus.js';

const SIX_HOURS = 6 * 60 * 60_000;

/* How often the stamper WAKES UP. It does not write on every wake; it decides,
   per league, whether this moment is one of the moments worth recording. */
const STAMP_TICK_MS = 15 * 60_000;

/* One point every half hour while games are being played. The live numbers are
   recomputed every 90s but were never written down, so the line-movement chart
   sat flat through a Sunday while the number above it moved all afternoon. */
const LIVE_STAMP_MS = 30 * 60_000;

/* The daily point, in the league's own time zone rather than the server's. 4am
   ET is after Monday night football and after waivers, so Tuesday's point is
   also the week's closing line: the settled book, with nothing in flight. */
const DAILY_HOUR_ET = 4;
const ET = 'America/New_York';

function etDay(at) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET, dateStyle: 'short' }).format(new Date(at));
}

function etHour(at) {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', hour12: false })
      .format(new Date(at)),
  );
}

/**
 * Is this a moment worth recording for this league?
 *
 * The old answer was "every six hours, and once a minute after every boot".
 * The boot rule was the problem: a restart is not a repricing event, and with
 * deploys running several times a day it was writing most of the history. On a
 * real league that filled the store with restarts and pushed the actual season
 * out the back.
 */
export function stampReason(history, { now = Date.now(), live = false } = {}) {
  const last = history.at(-1);
  if (!last) return 'opening';
  const lastAt = last.computedAt ?? 0;
  if (live && now - lastAt >= LIVE_STAMP_MS) return 'live';
  if (etDay(lastAt) !== etDay(now) && etHour(now) >= DAILY_HOUR_ET) return 'daily';
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reprice every registered league and append a line-history snapshot.
 *  - `live`: force a fresh NFL-scoreboard read first, so any just-finished game's
 *    players lock into the current week (computeLeaguePricing picks them up).
 *  - `staggerMs`: pause between leagues so a big batch doesn't spike CPU / starve
 *    web requests. Total wall time ≈ leagues × staggerMs; keep it small (100-300ms).
 */
export async function repriceAllLeagues({ live = false, staggerMs = 0, stamp = true } = {}) {
  if (live) await awaitFinalNflTeams(); // one shared scoreboard read for the whole batch
  const registry = readRegistry();
  const leagueIds = Object.keys(registry);
  if (leagueIds.length === 0) return { total: 0, ok: 0 };

  console.log(`[reprice] repricing ${leagueIds.length} league(s)${live ? ' (live)' : ''}`);
  let ok = 0;
  for (const leagueId of leagueIds) {
    const { userId, provider, season } = registry[leagueId] ?? {};
    try {
      const providerObj = buildHeadlessProvider(provider, season);
      const pricing = await computeLeaguePricing(providerObj, leagueId, userId ?? null, null);
      if (pricing?.available) {
        // stamp=false (live reprices): refresh the served NUMBERS but DON'T append
        // a line-history point, so the futures title/playoff charts stay on the 6h
        // cadence while matchup + live odds still update. stamp=true = the 6h tick.
        if (stamp) recordPricing(leagueId, pricing, { force: true });
        ok += 1;
      }
    } catch (err) {
      console.error(`[reprice] ${leagueId} failed:`, err?.message ?? err);
    }
    if (staggerMs > 0) await sleep(staggerMs);
  }
  console.log(`[reprice] done (${ok}/${leagueIds.length} priced)`);
  return { total: leagueIds.length, ok };
}

/**
 * Write a history point for every league that is due one.
 *
 * Prices only the leagues that need a point, so a quiet day costs one pass per
 * league rather than four.
 */
export async function stampDueLeagues({ now = Date.now() } = {}) {
  const registry = readRegistry();
  const leagueIds = Object.keys(registry);
  if (leagueIds.length === 0) return { stamped: 0 };

  getNflGameState(); // nudges the scoreboard cache; never blocks on it
  const live = anyGameLive();

  let stamped = 0;
  for (const leagueId of leagueIds) {
    const reason = stampReason(readHistory(leagueId), { now, live });
    if (!reason) continue;
    const { userId, provider, season } = registry[leagueId] ?? {};
    try {
      const providerObj = buildHeadlessProvider(provider, season);
      const pricing = await computeLeaguePricing(providerObj, leagueId, userId ?? null, null);
      if (pricing?.available && recordPricing(leagueId, pricing, { force: true })) {
        stamped += 1;
        console.log(`[reprice] stamped ${leagueId} (${reason})`);
      }
    } catch (err) {
      console.error(`[reprice] stamp ${leagueId} failed:`, err?.message ?? err);
    }
    await sleep(150);
  }
  return { stamped };
}

export function startRepriceScheduler() {
  /* Two jobs, deliberately separate.

     WARMING keeps the served price fresh for a league nobody is looking at. It
     runs a minute after boot and every six hours, and it writes NOTHING: a
     restart is not a repricing event, and treating it as one is what filled the
     store with restarts and pushed the season out the back.

     STAMPING is the history. It wakes every fifteen minutes and writes only
     when the league is due: once a day at 4am ET, every half hour while games
     are being played, and once at the very beginning. */
  setTimeout(() => { void repriceAllLeagues({ stamp: false }); }, 60_000).unref();
  setInterval(() => { void repriceAllLeagues({ stamp: false }); }, SIX_HOURS).unref();
  setInterval(() => { void stampDueLeagues(); }, STAMP_TICK_MS).unref();
  console.log('[reprice] scheduler started (warm every 6h, stamp every 15m)');
}
