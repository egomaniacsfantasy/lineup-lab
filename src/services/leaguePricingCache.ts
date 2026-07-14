import {
  fetchLineHistory,
  fetchLines,
  type LeaguePricing,
  type LineHistoryEntry,
} from './leagueApi';

interface PricingConnectionKey {
  provider: 'sleeper' | 'espn';
  leagueId: string;
  userId: string;
  season?: string;
}

export interface CachedLeaguePricingSnapshot {
  pricing: LeaguePricing;
  lineHistory: LineHistoryEntry[] | null;
  updatedAt: number;
  week: number | null;
}

const STORAGE_KEY = 'og.lineuplab.pricing-cache.v1';
const memoryCache = new Map<string, CachedLeaguePricingSnapshot>();
const inFlight = new Map<string, Promise<CachedLeaguePricingSnapshot>>();

function baseKey(connection: PricingConnectionKey) {
  return [
    connection.provider,
    connection.leagueId,
    connection.userId,
    connection.season ?? '',
  ].join(':');
}

function weekKey(connection: PricingConnectionKey, week: number | null | undefined) {
  return `${baseKey(connection)}:week:${week ?? 'unknown'}`;
}

function readStorage() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {} as Record<string, CachedLeaguePricingSnapshot>;
    return JSON.parse(raw) as Record<string, CachedLeaguePricingSnapshot>;
  } catch {
    return {} as Record<string, CachedLeaguePricingSnapshot>;
  }
}

function writeStorage(entries: Record<string, CachedLeaguePricingSnapshot>) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Session persistence is best effort.
  }
}

function storeSnapshot(connection: PricingConnectionKey, snapshot: CachedLeaguePricingSnapshot) {
  const key = weekKey(connection, snapshot.week);
  memoryCache.set(key, snapshot);
  const entries = readStorage();
  entries[key] = snapshot;
  writeStorage(entries);
}

export function readCachedLeaguePricing(
  connection: PricingConnectionKey,
  week: number | null | undefined,
) {
  const key = weekKey(connection, week);
  const fromMemory = memoryCache.get(key);
  if (fromMemory) return fromMemory;
  const fromStorage = readStorage()[key];
  if (fromStorage) {
    memoryCache.set(key, fromStorage);
    return fromStorage;
  }
  return null;
}

export async function fetchLeaguePricingSnapshot(
  connection: PricingConnectionKey,
  options?: { expectedWeek?: number | null },
) {
  const key = baseKey(connection);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const pricing = await fetchLines(connection.leagueId, connection.userId);
    const lineHistory = pricing.available
      ? (await fetchLineHistory(connection.leagueId).catch(() => null))?.history ?? null
      : null;
    const snapshot: CachedLeaguePricingSnapshot = {
      pricing,
      lineHistory,
      updatedAt: Date.now(),
      week: pricing.week ?? options?.expectedWeek ?? null,
    };
    storeSnapshot(connection, snapshot);
    return snapshot;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, request);
  return request;
}
