/**
 * Trade-sender scan, off the main thread. The per-manager finder is several
 * seconds of solid CPU per manager (full TRADE_SIMS season sims); run on the
 * server's event loop it would stall every other request for the length of a
 * league. Here it runs in a worker_thread: the main thread builds the league
 * context (network I/O), hands it over, and awaits the result.
 *
 * Sequential by design: one opposing manager at a time, each scanned exactly as
 * clicking that manager in the Trade tab scans it (suggestTrades pinned to one
 * partnerRosterId), plus the user's sender rules.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { suggestTrades, analyzeTrade } from './engine.js';

const SELF = fileURLToPath(import.meta.url);

/**
 * Re-price offers already out (the "is this still worth it?" check) with the
 * Trade Analyzer itself, on the same fresh context as the scan: today's
 * projections, injury report and final scores. `userDrops` = the drop that was
 * sent with the offer, so it's valued exactly as proposed.
 */
function recheckOffers(ctx, recheck) {
  const mine = new Set((ctx.teams.find((t) => t.isUser)?.players ?? []).map(String));
  return (recheck ?? []).map((r) => {
    // A player already gone from my roster: the offer can't execute; the watcher
    // closes it. Nothing to re-price.
    if (!r.give.every((id) => mine.has(String(id)))) return { espnTransactionId: r.espnTransactionId, youDelta: null, partnerDelta: null };
    try {
      const a = analyzeTrade(ctx, { partnerRosterId: r.partnerRosterId, give: r.give, get: r.get, userDrops: r.userDrops?.length ? r.userDrops : null });
      return { espnTransactionId: r.espnTransactionId, youDelta: a?.you?.delta?.titleProb ?? null, partnerDelta: a?.partner?.delta?.titleProb ?? null };
    } catch (err) {
      return { espnTransactionId: r.espnTransactionId, youDelta: null, partnerDelta: null, error: String(err?.message ?? err) };
    }
  });
}

async function scanManagers({ ctx, partnerRosterIds, sender, recheck }) {
  const rechecked = recheckOffers(ctx, recheck);
  const suggestions = [];
  const perManager = [];
  for (const partnerRosterId of partnerRosterIds) {
    const t0 = Date.now();
    try {
      const res = await suggestTrades(ctx, { maxSim: 20, partnerRosterId, sender });
      const found = res?.suggestions ?? [];
      suggestions.push(...found);
      perManager.push({ partnerRosterId, found: found.length, ms: Date.now() - t0 });
    } catch (err) {
      perManager.push({ partnerRosterId, found: 0, ms: Date.now() - t0, error: String(err?.message ?? err) });
    }
  }
  suggestions.sort((a, b) => b.youDelta - a.youDelta);
  return { suggestions, perManager, rechecked };
}

/** Main-thread entry: run the scan in a fresh worker; resolves with its result. */
export function runTradeScan(payload) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(SELF, { workerData: payload });
    } catch (err) {
      reject(err);
      return;
    }
    worker.once('message', (msg) => (msg?.error ? reject(new Error(msg.error)) : resolve(msg)));
    worker.once('error', reject);
    worker.once('exit', (code) => { if (code !== 0) reject(new Error(`trade_scan_worker_exit_${code}`)); });
  });
}

if (!isMainThread && parentPort) {
  scanManagers(workerData)
    .then((result) => parentPort.postMessage(result))
    .catch((err) => parentPort.postMessage({ error: String(err?.message ?? err) }));
}
