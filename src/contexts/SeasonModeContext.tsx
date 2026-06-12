/* eslint-disable react-refresh/only-export-components */
/**
 * Season state is COMPUTED from the server (/api/state ← Sleeper
 * /state/nfl), never chosen by the user. There is NO off-season state:
 * before kickoff everyone lives in the Week 1 view.
 *
 * Dev override (testing other states): append ?season-state=IN_SEASON
 * (or LEAGUE_PLAYOFFS / COMPLETE) to any URL; it persists in
 * sessionStorage until ?season-state=clear.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type SeasonState = 'IN_SEASON' | 'LEAGUE_PLAYOFFS' | 'COMPLETE';

export type SeasonMode = 'preseason' | 'inseason';

export interface SeasonAnchors {
  season: string;
  kickoffIso: string;
  kickoffLabel: string;
  kickoffShort: string;
  kickoffWeekday: string;
  firstSundayIso: string;
  firstSundayLabel: string;
}

/** Client fallback only until /api/state answers — same values as the
 *  server's single source (server/config/season.js). */
const FALLBACK_ANCHORS: SeasonAnchors = {
  season: '2026',
  kickoffIso: '2026-09-09T20:20:00-04:00',
  kickoffLabel: 'Wednesday, September 9, 2026',
  kickoffShort: 'September 9',
  kickoffWeekday: 'Wednesday',
  firstSundayIso: '2026-09-13',
  firstSundayLabel: 'Sunday, September 13, 2026',
};

interface SeasonModeContextValue {
  /** Legacy two-state view kept for existing consumers. */
  mode: SeasonMode;
  seasonState: SeasonState;
  anchors: SeasonAnchors;
  season: string;
  nflWeek: number;
  isDevOverride: boolean;
}

const SeasonModeContext = createContext<SeasonModeContextValue | null>(null);

const DEV_KEY = 'og.olympus.dev-season-state';
const VALID_STATES: SeasonState[] = ['IN_SEASON', 'LEAGUE_PLAYOFFS', 'COMPLETE'];

function readDevOverride(): SeasonState | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('season-state');

    if (fromQuery === 'clear') {
      window.sessionStorage.removeItem(DEV_KEY);
      return null;
    }

    if (fromQuery && VALID_STATES.includes(fromQuery.toUpperCase() as SeasonState)) {
      const value = fromQuery.toUpperCase() as SeasonState;
      window.sessionStorage.setItem(DEV_KEY, value);
      return value;
    }

    const stored = window.sessionStorage.getItem(DEV_KEY);
    return stored && VALID_STATES.includes(stored as SeasonState)
      ? (stored as SeasonState)
      : null;
  } catch {
    return null;
  }
}

export function SeasonModeProvider({ children }: { children: ReactNode }) {
  const [serverState, setServerState] = useState<{
    seasonState: SeasonState;
    anchors: SeasonAnchors;
    season: string;
    week: number;
  } | null>(null);
  const [devOverride] = useState<SeasonState | null>(readDevOverride);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/state')
      .then((response) => response.json())
      .then((state) => {
        if (cancelled) return;
        setServerState({
          seasonState: state.seasonState ?? 'IN_SEASON',
          anchors: state.anchors ?? FALLBACK_ANCHORS,
          season: state.season ?? FALLBACK_ANCHORS.season,
          week: Math.max(1, state.displayWeek || state.week || 1),
        });
      })
      .catch(() => {
        // keep fallbacks; the next mount retries
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SeasonModeContextValue>(() => {
    const seasonState = devOverride ?? serverState?.seasonState ?? 'IN_SEASON';

    return {
      seasonState,
      // no off-season mode: the app is always in its in-season shape
      mode: 'inseason',
      anchors: serverState?.anchors ?? FALLBACK_ANCHORS,
      season: serverState?.season ?? FALLBACK_ANCHORS.season,
      nflWeek: Math.max(1, serverState?.week ?? 1),
      isDevOverride: devOverride !== null,
    };
  }, [serverState, devOverride]);

  return (
    <SeasonModeContext.Provider value={value}>
      {children}
    </SeasonModeContext.Provider>
  );
}

export function useSeasonModeContext() {
  const context = useContext(SeasonModeContext);

  if (!context) {
    throw new Error('useSeasonModeContext must be used within SeasonModeProvider');
  }

  return context;
}
