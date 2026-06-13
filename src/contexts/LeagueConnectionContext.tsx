/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchBootstrap,
  fetchLineHistory,
  fetchLines,
  fetchSchedule,
  refreshLeague,
  setApiContext,
  type LeagueBootstrap,
  type LeaguePricing,
  type LineHistoryEntry,
  type ScheduleWeek,
} from '../services/leagueApi';

const STORAGE_KEY = 'og.olympus.connected-league';

export interface StoredConnection {
  provider: 'sleeper' | 'espn';
  leagueId: string;
  userId: string;
  username: string;
  displayName: string;
  /** Multi-league seam: all of the user's leagues are stored on connect;
   *  one is active. A header league switcher is a later pass. */
  allLeagueIds: string[];
  /** ESPN-only: season + (private league) the user's own read-only cookies. */
  season?: string;
  espnS2?: string | null;
  swid?: string | null;
}

/** Point the API client at the right provider for a connection. */
function applyApiContext(connection: StoredConnection | null) {
  if (connection?.provider === 'espn') {
    setApiContext({
      provider: 'espn',
      season: connection.season,
      espnS2: connection.espnS2 ?? null,
      swid: connection.swid ?? null,
    });
  } else {
    setApiContext({ provider: 'sleeper' });
  }
}

interface LeagueConnectionValue {
  stored: StoredConnection | null;
  bootstrap: LeagueBootstrap | null;
  schedule: ScheduleWeek[] | null;
  pricing: LeaguePricing | null;
  lineHistory: LineHistoryEntry[] | null;
  isLoading: boolean;
  error: string | null;
  connect: (connection: StoredConnection) => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

const LeagueConnectionContext = createContext<LeagueConnectionValue | null>(null);

function readStored(): StoredConnection | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredConnection) : null;
    // Point the API client at the right provider before the first fetch.
    applyApiContext(parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function LeagueConnectionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredConnection | null>(readStored);
  const [bootstrap, setBootstrap] = useState<LeagueBootstrap | null>(null);
  const [schedule, setSchedule] = useState<ScheduleWeek[] | null>(null);
  const [pricing, setPricing] = useState<LeaguePricing | null>(null);
  const [lineHistory, setLineHistory] = useState<LineHistoryEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(stored));
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async (connection: StoredConnection) => {
    setIsLoading(true);
    setError(null);

    // The server cold-starts on every deploy: the first pricing call can
    // fail or land mid-warmup. Retry with backoff instead of showing a
    // zeroed board until the next hourly poll.
    const loadPricing = async () => {
      const delays = [0, 4_000, 12_000, 30_000];
      for (const delay of delays) {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          const lines = await fetchLines(connection.leagueId, connection.userId);
          setPricing(lines);
          if (lines.available) {
            const h = await fetchLineHistory(connection.leagueId).catch(() => null);
            setLineHistory(h?.history ?? null);
            return;
          }
        } catch {
          setPricing(null);
        }
      }
    };

    try {
      const data = await fetchBootstrap(connection.leagueId, connection.userId);
      setBootstrap(data);
      fetchSchedule(connection.leagueId)
        .then((s) => setSchedule(s.weeks))
        .catch(() => setSchedule(null));
      void loadPricing();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not load your league. Try again in a minute.',
      );
      setBootstrap(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (stored) {
      void hydrate(stored);
    }
  }, [stored, hydrate]);

  const connect = useCallback((connection: StoredConnection) => {
    applyApiContext(connection);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
    } catch {
      // private mode: connection lives for the session only
    }
    setStored(connection);
  }, []);

  const disconnect = useCallback(() => {
    applyApiContext(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setStored(null);
    setBootstrap(null);
    setSchedule(null);
    setPricing(null);
    setLineHistory(null);
    setError(null);
  }, []);

  /**
   * Freshness loop: poll fast (90s) inside NFL game windows, hourly
   * outside. The server decides the window and gates its own upstream
   * TTLs the same way; this only refreshes the client's view.
   */
  useEffect(() => {
    if (!stored) return undefined;

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      let delay = 60 * 60_000;

      try {
        const health = await fetch('/api/health').then((r) => r.json());
        delay = health.gameWindow ? 90_000 : 60 * 60_000;

        const data = await fetchBootstrap(stored.leagueId, stored.userId);
        if (cancelled) return;
        setBootstrap(data);

        const lines = await fetchLines(stored.leagueId, stored.userId);
        if (cancelled) return;
        setPricing(lines);

        const history = await fetchLineHistory(stored.leagueId);
        if (cancelled) return;
        setLineHistory(history?.history ?? null);
      } catch {
        // keep showing the last good data; try again next cycle
      }

      if (!cancelled) {
        timer = window.setTimeout(() => void tick(), delay);
      }
    };

    timer = window.setTimeout(() => void tick(), 90_000);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [stored]);

  const refresh = useCallback(async () => {
    if (!stored) return;
    await refreshLeague(stored.leagueId).catch(() => null);
    await hydrate(stored);
  }, [stored, hydrate]);

  const value = useMemo(
    () => ({ stored, bootstrap, schedule, pricing, lineHistory, isLoading, error, connect, disconnect, refresh }),
    [stored, bootstrap, schedule, pricing, lineHistory, isLoading, error, connect, disconnect, refresh],
  );

  return (
    <LeagueConnectionContext.Provider value={value}>
      {children}
    </LeagueConnectionContext.Provider>
  );
}

export function useLeagueConnection() {
  const context = useContext(LeagueConnectionContext);

  if (!context) {
    throw new Error('useLeagueConnection must be used within LeagueConnectionProvider');
  }

  return context;
}
