/**
 * TTL cache + Sleeper call accounting.
 *
 * Every upstream call is logged from day one so the owner can watch
 * aggregate volume against Sleeper's < 1000 calls/min/IP guidance.
 */

const store = new Map();

export const callLog = {
  total: 0,
  byEndpoint: {},
  // ring buffer of the last 200 call timestamps for rate inspection
  recent: [],
};

export function recordCall(endpointKey) {
  callLog.total += 1;
  callLog.byEndpoint[endpointKey] = (callLog.byEndpoint[endpointKey] ?? 0) + 1;
  callLog.recent.push({ endpoint: endpointKey, at: Date.now() });
  if (callLog.recent.length > 200) {
    callLog.recent.shift();
  }
}

export function callsInLastMinute() {
  const cutoff = Date.now() - 60_000;
  return callLog.recent.filter((c) => c.at >= cutoff).length;
}

/**
 * Get-or-fetch with TTL. Stale entries are served if the upstream fetch
 * fails (degrade gracefully rather than blanking the UI).
 */
export async function cached(key, ttlMs, fetcher) {
  const hit = store.get(key);
  const now = Date.now();

  if (hit && now - hit.at < ttlMs) {
    return hit.value;
  }

  try {
    const value = await fetcher();
    store.set(key, { value, at: now });
    return value;
  } catch (error) {
    if (hit) {
      console.warn(`[cache] upstream failed for ${key}; serving stale`, error.message);
      return hit.value;
    }
    throw error;
  }
}

export function cacheTimestamp(key) {
  return store.get(key)?.at ?? null;
}

export function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
