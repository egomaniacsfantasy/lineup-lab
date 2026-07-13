/**
 * Scheduled repricer. Every 6 hours (and once shortly after boot) it reprices
 * every registered league and force-appends a timestamped snapshot to its line
 * history, so the futures charts keep gaining points over time even when nobody
 * is actively viewing the league.
 */
import { readRegistry } from './engine/leagueRegistry.js';
import { recordPricing } from './engine/lineStore.js';
import { computeLeaguePricing, buildHeadlessProvider } from './routes/api.js';

const SIX_HOURS = 6 * 60 * 60_000;

export async function repriceAllLeagues() {
  const registry = readRegistry();
  const leagueIds = Object.keys(registry);
  if (leagueIds.length === 0) return;

  console.log(`[reprice] repricing ${leagueIds.length} league(s)`);
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
  }
  console.log(`[reprice] done (${ok}/${leagueIds.length} priced)`);
}

export function startRepriceScheduler() {
  // First pass a minute after boot (once projections are warm), then every 6h.
  setTimeout(() => { void repriceAllLeagues(); }, 60_000).unref();
  setInterval(() => { void repriceAllLeagues(); }, SIX_HOURS).unref();
  console.log('[reprice] scheduler started (every 6h)');
}
