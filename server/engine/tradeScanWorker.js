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
import { suggestTrades } from './engine.js';

const SELF = fileURLToPath(import.meta.url);

async function scanManagers({ ctx, partnerRosterIds, sender }) {
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
  return { suggestions, perManager };
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
