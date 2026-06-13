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
import { setProjectionOverlay } from '../services/leagueApi';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

/** One player's override: absolute points the user set, not deltas. */
export interface PlayerOverride {
  base?: number;
  weekly?: Record<string, number>;
}

export type Overlay = Record<string, PlayerOverride>;
/** "I want to revisit this guy" — too high / too low. Does not move the line. */
export type Flags = Record<string, 'high' | 'low'>;

const LS_KEY = 'og.olympus.model-overlay';

interface Persisted {
  overlay: Overlay;
  flags: Flags;
}

function readLocal(): Persisted {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Persisted>) : null;
    return { overlay: parsed?.overlay ?? {}, flags: parsed?.flags ?? {} };
  } catch {
    return { overlay: {}, flags: {} };
  }
}

/** base64(UTF-8 JSON) for the x-olympus-overlay header. null = pure Franco. */
export function encodeOverlay(overlay: Overlay): string | null {
  const keys = Object.keys(overlay);
  if (keys.length === 0) return null;
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(overlay))));
  } catch {
    return null;
  }
}

function pushHeader(overlay: Overlay) {
  setProjectionOverlay(encodeOverlay(overlay));
}

interface ModelOverlayValue {
  overlay: Overlay;
  flags: Flags;
  /** Bumps on every change; the league context watches it to reprice. */
  overlayVersion: number;
  /** How many players the user has moved off Franco. */
  overrideCount: number;
  setPlayerBase: (playerId: string, base: number | null) => void;
  setPlayerWeekly: (playerId: string, week: number, points: number | null) => void;
  clearPlayer: (playerId: string) => void;
  toggleFlag: (playerId: string, kind: 'high' | 'low') => void;
  reset: () => void;
}

const ModelOverlayContext = createContext<ModelOverlayValue | null>(null);

export function ModelOverlayProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Read local + set the header synchronously on first render, so the very
  // first pricing fetch (a child effect) already carries the user's model.
  const [{ overlay, flags }, setState] = useState<Persisted>(() => {
    const initial = readLocal();
    pushHeader(initial.overlay);
    return initial;
  });
  const [overlayVersion, setOverlayVersion] = useState(0);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);
  // Always-fresh snapshot so setters can read current state without stale
  // closures. Updated only in commit + the login load, never during render.
  const stateRef = useRef<Persisted>({ overlay, flags });

  // Persist (local now, Supabase best-effort) and re-push the header on change.
  const commit = useCallback((next: Persisted) => {
    stateRef.current = next;
    setState(next);
    pushHeader(next.overlay);
    setOverlayVersion((v) => v + 1);
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // private mode: lives for the session
    }
    const uid = userIdRef.current;
    if (uid) {
      void supabase
        .from('olympus_models')
        .upsert(
          { user_id: uid, overlay: next.overlay, flags: next.flags, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )
        .then(() => undefined, () => undefined);
    }
  }, []);

  // On login, the account's saved model is the source of truth (cross-device).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from('olympus_models')
      .select('overlay, flags')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next = {
          overlay: (data.overlay as Overlay) ?? {},
          flags: (data.flags as Flags) ?? {},
        };
        stateRef.current = next;
        setState(next);
        pushHeader(next.overlay);
        setOverlayVersion((v) => v + 1);
        try {
          window.localStorage.setItem(LS_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setPlayerBase = useCallback(
    (playerId: string, base: number | null) => {
      const prev = stateRef.current;
      const current = prev.overlay[playerId] ?? {};
      const nextPlayer: PlayerOverride = { ...current };
      if (base == null) delete nextPlayer.base;
      else nextPlayer.base = Math.round(base * 10) / 10;
      const overlayNext = { ...prev.overlay };
      if (nextPlayer.base == null && !nextPlayer.weekly) delete overlayNext[playerId];
      else overlayNext[playerId] = nextPlayer;
      commit({ overlay: overlayNext, flags: prev.flags });
    },
    [commit],
  );

  const setPlayerWeekly = useCallback(
    (playerId: string, week: number, points: number | null) => {
      const prev = stateRef.current;
      const current = prev.overlay[playerId] ?? {};
      const weekly = { ...(current.weekly ?? {}) };
      if (points == null) delete weekly[String(week)];
      else weekly[String(week)] = Math.round(points * 10) / 10;
      const nextPlayer: PlayerOverride = { ...current };
      if (Object.keys(weekly).length === 0) delete nextPlayer.weekly;
      else nextPlayer.weekly = weekly;
      const overlayNext = { ...prev.overlay };
      if (nextPlayer.base == null && !nextPlayer.weekly) delete overlayNext[playerId];
      else overlayNext[playerId] = nextPlayer;
      commit({ overlay: overlayNext, flags: prev.flags });
    },
    [commit],
  );

  const clearPlayer = useCallback(
    (playerId: string) => {
      const prev = stateRef.current;
      const overlayNext = { ...prev.overlay };
      delete overlayNext[playerId];
      commit({ overlay: overlayNext, flags: prev.flags });
    },
    [commit],
  );

  const toggleFlag = useCallback(
    (playerId: string, kind: 'high' | 'low') => {
      const prev = stateRef.current;
      const flagsNext = { ...prev.flags };
      if (flagsNext[playerId] === kind) delete flagsNext[playerId];
      else flagsNext[playerId] = kind;
      commit({ overlay: prev.overlay, flags: flagsNext });
    },
    [commit],
  );

  const reset = useCallback(() => {
    commit({ overlay: {}, flags: {} });
  }, [commit]);

  const value = useMemo(
    () => ({
      overlay,
      flags,
      overlayVersion,
      overrideCount: Object.keys(overlay).length,
      setPlayerBase,
      setPlayerWeekly,
      clearPlayer,
      toggleFlag,
      reset,
    }),
    [overlay, flags, overlayVersion, setPlayerBase, setPlayerWeekly, clearPlayer, toggleFlag, reset],
  );

  return <ModelOverlayContext.Provider value={value}>{children}</ModelOverlayContext.Provider>;
}

export function useModelOverlay() {
  const ctx = useContext(ModelOverlayContext);
  if (!ctx) throw new Error('useModelOverlay must be used within ModelOverlayProvider');
  return ctx;
}
