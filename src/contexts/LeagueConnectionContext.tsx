/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'og.olympus.connected-league';

export interface StoredConnection {
  provider: 'sleeper' | 'espn';
  leagueId: string;
  /** Friendly league name for the switcher. Persisted locally; not yet a DB
   *  column, so leagues loaded fresh on another device fall back to the
   *  manager name until they're opened once. */
  leagueName?: string;
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
  /** Every league saved to this account; `stored` is the active one. */
  leagues: StoredConnection[];
  bootstrap: LeagueBootstrap | null;
  schedule: ScheduleWeek[] | null;
  pricing: LeaguePricing | null;
  lineHistory: LineHistoryEntry[] | null;
  isLoading: boolean;
  error: string | null;
  connect: (connection: StoredConnection) => void;
  switchLeague: (leagueId: string) => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

/** Stable identity for a saved league across providers. */
function leagueKey(c: { provider: string; leagueId: string }) {
  return `${c.provider}:${c.leagueId}`;
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

interface DbLeagueRow {
  provider: string;
  league_id: string;
  season: string | null;
  member_id: string | null;
  username: string | null;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

/** A saved-league row from Supabase becomes a connection (cookies live
 *  server-side, so they stay null here). */
function rowToConnection(row: DbLeagueRow): StoredConnection {
  return {
    provider: row.provider === 'espn' ? 'espn' : 'sleeper',
    leagueId: row.league_id,
    userId: row.member_id ?? '',
    username: row.username ?? '',
    displayName: row.display_name ?? '',
    allLeagueIds: [row.league_id],
    season: row.season ?? undefined,
    espnS2: null,
    swid: null,
  };
}

async function saveLeagueRow(userId: string, c: StoredConnection) {
  await supabase.from('olympus_leagues').upsert(
    {
      user_id: userId,
      provider: c.provider,
      league_id: c.leagueId,
      season: c.season ?? null,
      member_id: c.userId,
      username: c.username,
      display_name: c.displayName,
      is_active: true,
    },
    { onConflict: 'user_id,provider,league_id' },
  );
}

/** Make one league the active one for the account: clear every flag, then
 *  set this league's. Used on connect (add) and on switch. */
async function activateLeagueRow(userId: string, c: StoredConnection) {
  await supabase.from('olympus_leagues').update({ is_active: false }).eq('user_id', userId);
  await saveLeagueRow(userId, c);
}

export function LeagueConnectionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredConnection | null>(readStored);
  const [leagues, setLeagues] = useState<StoredConnection[]>(() => {
    const initial = readStored();
    return initial ? [initial] : [];
  });
  const [bootstrap, setBootstrap] = useState<LeagueBootstrap | null>(null);
  const [schedule, setSchedule] = useState<ScheduleWeek[] | null>(null);
  const [pricing, setPricing] = useState<LeaguePricing | null>(null);
  const [lineHistory, setLineHistory] = useState<LineHistoryEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(stored));
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // Saved leagues live on the account, so they follow you to any device.
  // On login, Supabase is the source of truth for which league is active.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('olympus_leagues')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as DbLeagueRow[];
        if (rows.length === 0) {
          // First login on this account: migrate a league synced before sign-in.
          const local = readStored();
          if (local) {
            void saveLeagueRow(user.id, local);
            setLeagues([local]);
          }
          return;
        }
        const all = rows.map(rowToConnection);
        const active = all.find((c, i) => rows[i].is_active) ?? all[0];
        applyApiContext(active);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
        } catch {
          // ignore
        }
        setLeagues(all);
        setStored(active);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  /** Make a connection the active league locally (api context + cache + state). */
  const activateLocal = useCallback((connection: StoredConnection) => {
    applyApiContext(connection);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
    } catch {
      // private mode: connection lives for the session only
    }
    setStored(connection);
  }, []);

  // Add a league (or re-sync an existing one) and make it active.
  const connect = useCallback(
    (connection: StoredConnection) => {
      activateLocal(connection);
      setLeagues((prev) => [
        connection,
        ...prev.filter((l) => leagueKey(l) !== leagueKey(connection)),
      ]);
      // Persist to the account so it's there on every device.
      if (userIdRef.current) void activateLeagueRow(userIdRef.current, connection);
    },
    [activateLocal],
  );

  // Switch the active league to another one already saved on the account.
  const switchLeague = useCallback(
    (leagueId: string) => {
      const target = leagues.find((l) => l.leagueId === leagueId);
      if (!target || (stored && leagueKey(target) === leagueKey(stored))) return;
      activateLocal(target);
      if (userIdRef.current) void activateLeagueRow(userIdRef.current, target);
    },
    [leagues, stored, activateLocal],
  );

  const disconnect = useCallback(() => {
    const removing = stored;
    const remaining = removing
      ? leagues.filter((l) => leagueKey(l) !== leagueKey(removing))
      : leagues;

    if (userIdRef.current && removing) {
      void supabase
        .from('olympus_leagues')
        .delete()
        .eq('user_id', userIdRef.current)
        .eq('provider', removing.provider)
        .eq('league_id', removing.leagueId);
    }

    setLeagues(remaining);

    const next = remaining[0] ?? null;
    if (next) {
      // Fall through to the next saved league instead of dropping to nothing.
      activateLocal(next);
      if (userIdRef.current) void activateLeagueRow(userIdRef.current, next);
      return;
    }

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
  }, [stored, leagues, activateLocal]);

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
    () => ({ stored, leagues, bootstrap, schedule, pricing, lineHistory, isLoading, error, connect, switchLeague, disconnect, refresh }),
    [stored, leagues, bootstrap, schedule, pricing, lineHistory, isLoading, error, connect, switchLeague, disconnect, refresh],
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
