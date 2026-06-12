/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type SeasonMode = 'preseason' | 'inseason';

interface SeasonModeContextValue {
  mode: SeasonMode;
  toggleMode: () => void;
}

const SeasonModeContext = createContext<SeasonModeContextValue | null>(null);

const MODE_STORAGE_KEY = 'og.olympus.season-mode';

function readStoredMode(): SeasonMode {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === 'inseason'
      ? 'inseason'
      : 'preseason';
  } catch {
    return 'preseason';
  }
}

function storeMode(mode: SeasonMode) {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Persistence unavailable (private mode); the toggle still works in-session.
  }
}

export function SeasonModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<SeasonMode>(readStoredMode);

  const toggleMode = useCallback(() => {
    setMode((current) => {
      const next = current === 'preseason' ? 'inseason' : 'preseason';
      storeMode(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      mode,
      toggleMode,
    }),
    [mode, toggleMode],
  );

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
