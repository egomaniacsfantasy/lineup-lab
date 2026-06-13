/* eslint-disable react-refresh/only-export-components */
/**
 * Betting-language switch: American moneylines or plain win percentages.
 * The choice persists per browser. AppShell keys its content on the
 * format so every number on screen re-renders when it flips.
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { setOddsFormat, type OddsFormat } from '../utils/formatOdds';

const STORAGE_KEY = 'og.olympus.odds-format';

interface OddsFormatValue {
  format: OddsFormat;
  toggleFormat: () => void;
}

const OddsFormatContext = createContext<OddsFormatValue | null>(null);

function readStored(): OddsFormat {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'percent' ? 'percent' : 'american';
  } catch {
    return 'american';
  }
}

export function OddsFormatProvider({ children }: { children: ReactNode }) {
  const [format, setFormat] = useState<OddsFormat>(() => {
    const stored = readStored();
    setOddsFormat(stored);
    return stored;
  });

  const toggleFormat = useCallback(() => {
    setFormat((current) => {
      const next: OddsFormat = current === 'american' ? 'percent' : 'american';
      setOddsFormat(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // private mode: preference lives for the session only
      }
      return next;
    });
  }, []);

  return (
    <OddsFormatContext.Provider value={{ format, toggleFormat }}>
      {children}
    </OddsFormatContext.Provider>
  );
}

export function useOddsFormat() {
  const context = useContext(OddsFormatContext);
  if (!context) {
    throw new Error('useOddsFormat must be used within OddsFormatProvider');
  }
  return context;
}
