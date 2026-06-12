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
  fetchSchedule,
  refreshLeague,
  type LeagueBootstrap,
  type ScheduleWeek,
} from '../services/leagueApi';

const STORAGE_KEY = 'og.olympus.connected-league';

export interface StoredConnection {
  provider: 'sleeper';
  leagueId: string;
  userId: string;
  username: string;
  displayName: string;
  /** Multi-league seam: all of the user's leagues are stored on connect;
   *  one is active. A header league switcher is a later pass. */
  allLeagueIds: string[];
}

interface LeagueConnectionValue {
  stored: StoredConnection | null;
  bootstrap: LeagueBootstrap | null;
  schedule: ScheduleWeek[] | null;
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
    return raw ? (JSON.parse(raw) as StoredConnection) : null;
  } catch {
    return null;
  }
}

export function LeagueConnectionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredConnection | null>(readStored);
  const [bootstrap, setBootstrap] = useState<LeagueBootstrap | null>(null);
  const [schedule, setSchedule] = useState<ScheduleWeek[] | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(stored));
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async (connection: StoredConnection) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchBootstrap(connection.leagueId, connection.userId);
      setBootstrap(data);
      fetchSchedule(connection.leagueId)
        .then((s) => setSchedule(s.weeks))
        .catch(() => setSchedule(null));
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
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
    } catch {
      // private mode: connection lives for the session only
    }
    setStored(connection);
  }, []);

  const disconnect = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setStored(null);
    setBootstrap(null);
    setSchedule(null);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!stored) return;
    await refreshLeague(stored.leagueId).catch(() => null);
    await hydrate(stored);
  }, [stored, hydrate]);

  const value = useMemo(
    () => ({ stored, bootstrap, schedule, isLoading, error, connect, disconnect, refresh }),
    [stored, bootstrap, schedule, isLoading, error, connect, disconnect, refresh],
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
