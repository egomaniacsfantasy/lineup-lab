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
  connectUsername,
  fetchBootstrap,
  fetchLineHistory,
  fetchLines,
  fetchSchedule,
  refreshLeague,
  setApiContext,
  type ApiLeagueSummary,
  type LeagueBootstrap,
  type LeaguePricing,
  type LineHistoryEntry,
  type ScheduleWeek,
} from '../services/leagueApi';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { useModelOverlay } from './ModelOverlayContext';

const STORAGE_KEY = 'og.olympus.connected-league';

interface StoredLeagueSummary {
  id: string;
  name: string;
  season?: string;
}

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
  allLeagues?: StoredLeagueSummary[];
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
  switchLeague: (provider: StoredConnection['provider'], leagueId: string) => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

/** Stable identity for a saved league across providers. */
function leagueKey(c: { provider: string; leagueId: string }) {
  return `${c.provider}:${c.leagueId}`;
}

function hydrateKey(c: StoredConnection) {
  return `${c.provider}:${c.leagueId}:${c.userId}:${c.season ?? ''}`;
}

function activeConnectionChanged(a: StoredConnection | null, b: StoredConnection | null) {
  if (!a || !b) return a !== b;
  return (
    leagueKey(a) !== leagueKey(b) ||
    a.userId !== b.userId ||
    a.leagueName !== b.leagueName ||
    a.allLeagueIds.join('|') !== b.allLeagueIds.join('|')
  );
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

function connectionFromSummary(
  base: StoredConnection,
  summary: StoredLeagueSummary,
  allLeagues: StoredLeagueSummary[],
): StoredConnection {
  return {
    provider: base.provider,
    leagueId: summary.id,
    leagueName: summary.name,
    userId: base.userId,
    username: base.username,
    displayName: base.displayName,
    allLeagueIds: allLeagues.map((league) => league.id),
    allLeagues,
    season: summary.season ?? base.season,
    espnS2: base.espnS2 ?? null,
    swid: base.swid ?? null,
  };
}

function connectionsFromKnownLeagues(connection: StoredConnection) {
  const summaries = connection.allLeagues?.length
    ? connection.allLeagues
    : [{
        id: connection.leagueId,
        name: connection.leagueName ?? `${connection.provider} league`,
        season: connection.season,
      }];
  return summaries.map((summary) => connectionFromSummary(connection, summary, summaries));
}

function sleeperSummaries(leagues: ApiLeagueSummary[]): StoredLeagueSummary[] {
  return leagues.map((league) => ({
    id: league.id,
    name: league.name,
    season: league.season,
  }));
}

async function saveLeagueRow(userId: string, c: StoredConnection, isActive = true) {
  await supabase.from('olympus_leagues').upsert(
    {
      user_id: userId,
      provider: c.provider,
      league_id: c.leagueId,
      season: c.season ?? null,
      member_id: c.userId,
      username: c.username,
      display_name: c.displayName,
      is_active: isActive,
    },
    { onConflict: 'user_id,provider,league_id' },
  );
}

async function saveLeagueRows(userId: string, connections: StoredConnection[], active: StoredConnection) {
  await supabase.from('olympus_leagues').update({ is_active: false }).eq('user_id', userId);
  await supabase.from('olympus_leagues').upsert(
    connections.map((connection) => ({
      user_id: userId,
      provider: connection.provider,
      league_id: connection.leagueId,
      season: connection.season ?? null,
      member_id: connection.userId,
      username: connection.username,
      display_name: connection.displayName,
      is_active: leagueKey(connection) === leagueKey(active),
    })),
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
  const { overlayVersion } = useModelOverlay();
  const userIdRef = useRef<string | null>(null);
  const lastHydrateKeyRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // Saved leagues live on the account, so they follow you to any device.
  // If this browser already has an active league, keep it. Supabase fills the
  // switcher list, but only the explicit league switcher changes the active row.
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
          applyApiContext(null);
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
          setLeagues([]);
          setStored(null);
          setBootstrap(null);
          setSchedule(null);
          setPricing(null);
          setLineHistory(null);
          setError(null);
          return;
        }
        const all = rows.map(rowToConnection);
        const localActive = stored
          ? all.find((connection) => leagueKey(connection) === leagueKey(stored))
          : null;
        const dbActive = all.find((_, i) => rows[i].is_active) ?? all[0];
        const active = localActive && stored
          ? {
              ...localActive,
              leagueName: stored.leagueName ?? localActive.leagueName,
              allLeagueIds: stored.allLeagueIds.length > 1 ? stored.allLeagueIds : all.map((l) => l.leagueId),
              allLeagues: stored.allLeagues,
            }
          : dbActive;
        applyApiContext(active);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
        } catch {
          // ignore
        }
        setLeagues(all);
        if (activeConnectionChanged(stored, active)) {
          setStored(active);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stored, user]);

  useEffect(() => {
    if (!user || !stored || stored.provider !== 'sleeper' || !stored.username) return;
    let cancelled = false;
    connectUsername(stored.username)
      .then((result) => {
        if (cancelled || result.leagues.length === 0) return;
        const summaries = sleeperSummaries(result.leagues);
        const nextConnections = result.leagues.map((league) =>
          connectionFromSummary(
            {
              ...stored,
              userId: result.user.id,
              username: result.user.username,
              displayName: result.user.displayName,
            },
            { id: league.id, name: league.name, season: league.season },
            summaries,
          ),
        );
        const active =
          nextConnections.find((connection) => leagueKey(connection) === leagueKey(stored)) ??
          nextConnections[0];
        const existingKeys = leagues.map(leagueKey).join('|');
        const nextKeys = nextConnections.map(leagueKey).join('|');
        if (existingKeys !== nextKeys) {
          setLeagues(nextConnections);
          if (userIdRef.current) void saveLeagueRows(userIdRef.current, nextConnections, active);
        }
        if (leagueKey(active) === leagueKey(stored)) {
          const activeChanged =
            active.leagueName !== stored.leagueName ||
            active.allLeagueIds.length !== stored.allLeagueIds.length ||
            active.allLeagueIds.some((id, index) => id !== stored.allLeagueIds[index]);
          if (activeChanged) {
            applyApiContext(active);
            try {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
            } catch {
              // ignore
            }
            setStored(active);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [leagues, stored, user]);

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
          }
          return;
        } catch {
          setPricing(null);
        }
      }
      setPricing({ available: false, reason: 'pricing_timeout' });
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
    if (!stored) {
      lastHydrateKeyRef.current = null;
      return;
    }
    const key = hydrateKey(stored);
    if (lastHydrateKeyRef.current === key) return;
    lastHydrateKeyRef.current = key;
    void hydrate(stored);
  }, [stored, hydrate]);

  /** Make a connection the active league locally (api context + cache + state). */
  const activateLocal = useCallback((connection: StoredConnection) => {
    applyApiContext(connection);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
    } catch {
      // private mode: connection lives for the session only
    }
    setBootstrap(null);
    setSchedule(null);
    setPricing(null);
    setLineHistory(null);
    setError(null);
    setIsLoading(true);
    setStored(connection);
  }, []);

  // Add a league (or re-sync an existing one) and make it active.
  const connect = useCallback(
    (connection: StoredConnection) => {
      const knownConnections = connectionsFromKnownLeagues(connection);
      const active =
        knownConnections.find((known) => leagueKey(known) === leagueKey(connection)) ??
        connection;
      activateLocal(active);
      setLeagues((prev) => {
        const merged = [
          ...knownConnections,
          ...prev.filter((l) => !knownConnections.some((known) => leagueKey(known) === leagueKey(l))),
        ];
        return merged;
      });
      // Persist to the account so it's there on every device.
      if (userIdRef.current) void saveLeagueRows(userIdRef.current, knownConnections, active);
    },
    [activateLocal],
  );

  // Switch the active league to another one already saved on the account.
  const switchLeague = useCallback(
    (provider: StoredConnection['provider'], leagueId: string) => {
      const target = leagues.find(
        (l) => l.provider === provider && l.leagueId === leagueId,
      );
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

  // When the user's model (BYOR overlay) changes, reprice the book so the
  // matchup and season tabs reflect their numbers. Debounced: rapid dragging
  // shouldn't fire a sim per tick. The overlay header is already set by the
  // model context, so a plain re-fetch picks it up.
  const didOverlayMount = useRef(false);
  useEffect(() => {
    if (!stored) return undefined;
    if (!didOverlayMount.current) {
      didOverlayMount.current = true;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const lines = await fetchLines(stored.leagueId, stored.userId);
          setPricing(lines);
          if (lines.available) {
            const h = await fetchLineHistory(stored.leagueId).catch(() => null);
            setLineHistory(h?.history ?? null);
          }
        } catch {
          // keep the last good pricing
        }
      })();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [overlayVersion, stored]);

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
