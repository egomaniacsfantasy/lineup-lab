import { useEffect, useRef, useState } from 'react';
import type { MatchupLine, RosterSlot } from '../../types';
import { DecisionDrawer } from './DecisionDrawer';

interface DecisionPanelProps {
  slot: RosterSlot;
  starterLine: MatchupLine;
  starterGameLine: string;
  starterPlayerProp?: string;
  alternativeLines: MatchupLine[];
  onSelectStarter: () => void;
  onSelectAlternative: (altIndex: number) => void;
  onClose: () => void;
  selectedAlternativeIndex: number | null;
}

export function DecisionPanel(props: DecisionPanelProps) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setIsClosing(false);
  }, [props.slot.starter.id, props.slot.slotLabel]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleClose = () => {
    if (isClosing) {
      return;
    }

    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      props.onClose();
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 260);
  };

  return <DecisionDrawer {...props} isClosing={isClosing} onClose={handleClose} />;
}
