import { useEffect, useRef, useState } from 'react';
import {
  clearDismissedTradeSignatures,
  dismissTradeSignature,
  readDismissedTradeSignatures,
  restoreTradeSignature,
} from '../utils/tradeMarket';

const TOAST_MS = 5_000;

export function useDismissedTradeSuggestions(leagueId: string | null, week: number | null) {
  const [dismissedSignatures, setDismissedSignatures] = useState<Set<string>>(new Set());
  const [pendingUndoSignature, setPendingUndoSignature] = useState<string | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!leagueId || week == null) {
      setDismissedSignatures(new Set());
      return;
    }
    setDismissedSignatures(readDismissedTradeSignatures(leagueId, week));
  }, [leagueId, week]);

  useEffect(() => () => {
    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
    }
  }, []);

  const clearUndoTimer = () => {
    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const dismiss = (signature: string) => {
    if (!leagueId || week == null) return;
    setDismissedSignatures(dismissTradeSignature(leagueId, week, signature));
    setPendingUndoSignature(signature);
    clearUndoTimer();
    undoTimerRef.current = window.setTimeout(() => {
      setPendingUndoSignature(null);
      undoTimerRef.current = null;
    }, TOAST_MS);
  };

  const undo = () => {
    if (!leagueId || week == null || !pendingUndoSignature) return;
    setDismissedSignatures(restoreTradeSignature(leagueId, week, pendingUndoSignature));
    setPendingUndoSignature(null);
    clearUndoTimer();
  };

  const restoreAll = () => {
    if (!leagueId || week == null) return;
    setDismissedSignatures(clearDismissedTradeSignatures(leagueId, week));
    setPendingUndoSignature(null);
    clearUndoTimer();
  };

  return {
    dismissedSignatures,
    dismiss,
    undo,
    restoreAll,
    pendingUndoSignature,
  };
}
