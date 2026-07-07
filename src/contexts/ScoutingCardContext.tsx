/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ScoutingCard } from '../components/scouting/ScoutingCard';

interface ScoutingCardContextValue {
  openScoutingCard: (managerKey: string) => void;
  closeScoutingCard: () => void;
  activeManagerKey: string | null;
}

const ScoutingCardContext = createContext<ScoutingCardContextValue>({
  openScoutingCard: () => {},
  closeScoutingCard: () => {},
  activeManagerKey: null,
});

export function ScoutingCardProvider({ children }: { children: ReactNode }) {
  const [activeManagerKey, setActiveManagerKey] = useState<string | null>(null);
  const openScoutingCard = useCallback((managerKey: string) => setActiveManagerKey(managerKey), []);
  const closeScoutingCard = useCallback(() => setActiveManagerKey(null), []);

  const value = useMemo(
    () => ({ openScoutingCard, closeScoutingCard, activeManagerKey }),
    [activeManagerKey, closeScoutingCard, openScoutingCard],
  );

  return (
    <ScoutingCardContext.Provider value={value}>
      {children}
      <ScoutingCard managerKey={activeManagerKey} onClose={closeScoutingCard} />
    </ScoutingCardContext.Provider>
  );
}

export function useScoutingCard() {
  return useContext(ScoutingCardContext);
}
