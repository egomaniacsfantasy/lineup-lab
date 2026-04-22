/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Player } from '../types';
import { PlayerDetailPanel } from '../components/player/PlayerDetailPanel';

export interface PlayerDetailRequest {
  player?: Player;
  slug: string;
  projection?: number;
  floor?: number;
  ceiling?: number;
  gameLine?: string;
  comparedSlotIndex?: number;
}

interface PlayerDetailContextValue {
  isOpen: boolean;
  openPlayerDetail: (request: PlayerDetailRequest) => void;
  closePlayerDetail: () => void;
}

const PlayerDetailContext = createContext<PlayerDetailContextValue>({
  isOpen: false,
  openPlayerDetail: () => {},
  closePlayerDetail: () => {},
});

interface PlayerDetailProviderProps {
  children: ReactNode;
}

export function PlayerDetailProvider({ children }: PlayerDetailProviderProps) {
  const [activePlayer, setActivePlayer] = useState<PlayerDetailRequest | null>(null);

  const openPlayerDetail = useCallback((request: PlayerDetailRequest) => {
    setActivePlayer(request);
  }, []);

  const closePlayerDetail = useCallback(() => {
    setActivePlayer(null);
  }, []);

  const value = useMemo(
    () => ({
      isOpen: activePlayer !== null,
      openPlayerDetail,
      closePlayerDetail,
    }),
    [activePlayer, closePlayerDetail, openPlayerDetail],
  );

  return (
    <PlayerDetailContext.Provider value={value}>
      {children}
      <PlayerDetailPanel
        onClose={closePlayerDetail}
        playerDetail={activePlayer}
      />
    </PlayerDetailContext.Provider>
  );
}

export function usePlayerDetail() {
  return useContext(PlayerDetailContext);
}
