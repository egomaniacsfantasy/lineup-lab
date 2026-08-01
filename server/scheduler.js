/**
 * Scheduled repricer. Every 6 hours (and once shortly after boot) it reprices
 * every registered league and force-appends a timestamped snapshot to its line
 * history, so the futures charts keep gaining points over time even when nobody
 * is actively viewing the league.
 */
import { readRegistry } from './engine/leagueRegistry.js';
import { recordPricing } from './engine/lineStore.js';
import { computeLeaguePricing, buildHeadlessProvider } from './routes/api.js';
import { awaitFinalNflTeams } from './live/nflGameStatus.js';

const SIX_HOURS = 6 * 60 * 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reprice every registered league and append a line-history snapshot.
 *  - `live`: force a fresh NFL-scoreboard read first, so any just-finished game's
 *    players lock into the current week (computeLeaguePricing picks them up).
 *  - `staggerMs`: pause between leagues so a big batch doesn't spike CPU / starve
 *    web requests. Total wall time ≈ leagues × staggerMs; keep it small (100-300ms).
 */
export async function repriceAllLeagues({ live = false, staggerMs = 0 } = {}) {
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
        recordPricing(leagueId, pricing, { force: true });
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

export function startRepriceScheduler() {
  // First pass a minute after boot (once projections are warm), then every 6h.
  setTimeout(() => { void repriceAllLeagues(); }, 60_000).unref();
  setInterval(() => { void repriceAllLeagues(); }, SIX_HOURS).unref();
  console.log('[reprice] scheduler started (every 6h)');
}
