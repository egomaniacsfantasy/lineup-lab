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

export function SeasonModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<SeasonMode>('preseason');

  const toggleMode = useCallback(() => {
    setMode((current) => (current === 'preseason' ? 'inseason' : 'preseason'));
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
