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

/** A named ranking set: a whole model the user can save, switch, and load. */
export interface ModelSet {
  id: string;
  name: string;
  overlay: Overlay;
  flags: Flags;
  updatedAt?: string | null;
}

interface Persisted {
  sets: ModelSet[];
  activeId: string;
}

const LS_KEY = 'og.olympus.model-overlay';

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `set-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  }
}

function freshSet(name = 'My board'): ModelSet {
  return { id: newId(), name, overlay: {}, flags: {}, updatedAt: null };
}

function readLocal(): Persisted {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.sets?.length) {
      return { sets: parsed.sets as ModelSet[], activeId: parsed.activeId ?? parsed.sets[0].id };
    }
    // Migrate the old single-overlay shape ({ overlay, flags }) into one set.
    if (parsed?.overlay) {
      const s: ModelSet = { ...freshSet(), overlay: parsed.overlay, flags: parsed.flags ?? {} };
      return { sets: [s], activeId: s.id };
    }
  } catch {
    // fall through to a default
  }
  const s = freshSet();
  return { sets: [s], activeId: s.id };
}

function activeOf(p: Persisted): ModelSet {
  return p.sets.find((s) => s.id === p.activeId) ?? p.sets[0];
}

/** base64(UTF-8 JSON) for the x-olympus-overlay header. null = pure Franco. */
export function encodeOverlay(overlay: Overlay): string | null {
  if (Object.keys(overlay).length === 0) return null;
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(overlay))));
  } catch {
    return null;
  }
}

interface ModelOverlayValue {
  // ── Active set (drives the book) ──
  overlay: Overlay;
  flags: Flags;
  overlayVersion: number;
  overrideCount: number;
  setPlayerBase: (playerId: string, base: number | null) => void;
  setPlayerWeekly: (playerId: string, week: number, points: number | null) => void;
  clearPlayer: (playerId: string) => void;
  toggleFlag: (playerId: string, kind: 'high' | 'low') => void;
  reset: () => void;
  // ── Named sets ──
  sets: Array<{ id: string; name: string; count: number; updatedAt?: string | null }>;
  activeSetId: string;
  activeSetName: string;
  createSet: (name?: string) => void;
  renameSet: (id: string, name: string) => void;
  deleteSet: (id: string) => void;
  switchSet: (id: string) => void;
}

const ModelOverlayContext = createContext<ModelOverlayValue | null>(null);

export function ModelOverlayProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Persisted>(() => {
    const initial = readLocal();
    setProjectionOverlay(encodeOverlay(activeOf(initial).overlay));
    return initial;
  });
  const [overlayVersion, setOverlayVersion] = useState(0);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);
  const stateRef = useRef<Persisted>(state);

  const persistRemote = useCallback((sets: ModelSet[], activeId: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    const rows = sets.map((s) => ({
      id: s.id,
      user_id: uid,
      name: s.name,
      overlay: s.overlay,
      flags: s.flags,
      is_active: s.id === activeId,
      updated_at: s.updatedAt ?? new Date().toISOString(),
    }));
    void supabase
      .from('olympus_models')
      .upsert(rows, { onConflict: 'id' })
      .then(() => undefined, () => undefined);
  }, []);

  // Commit a whole new sets-state: header (from active overlay) + persistence.
  const commit = useCallback(
    (next: Persisted) => {
      stateRef.current = next;
      setState(next);
      setProjectionOverlay(encodeOverlay(activeOf(next).overlay));
      setOverlayVersion((v) => v + 1);
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        // private mode: session-only
      }
      persistRemote(next.sets, next.activeId);
    },
    [persistRemote],
  );

  // On login, the account's saved sets are the source of truth (cross-device).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from('olympus_models')
      .select('id, name, overlay, flags, is_active, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const rows = data ?? [];
        if (rows.length === 0) {
          return;
        }
        const sets: ModelSet[] = rows.map((r) => ({
          id: r.id as string,
          name: (r.name as string) ?? 'My board',
          overlay: (r.overlay as Overlay) ?? {},
          flags: (r.flags as Flags) ?? {},
          updatedAt: (r.updated_at as string | null) ?? (r.created_at as string | null) ?? null,
        }));
        const activeRow = rows.find((r) => r.is_active) ?? rows[0];
        const next: Persisted = { sets, activeId: activeRow.id as string };
        stateRef.current = next;
        setState(next);
        setProjectionOverlay(encodeOverlay(activeOf(next).overlay));
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
  }, [user, persistRemote]);

  // Apply an edit to the active set's overlay/flags.
  const editActive = useCallback(
    (fn: (set: ModelSet) => ModelSet) => {
      const prev = stateRef.current;
      const act = activeOf(prev);
      const nextSet = fn(act);
      commit({
        sets: prev.sets.map((s) =>
          s.id === act.id ? { ...nextSet, updatedAt: new Date().toISOString() } : s,
        ),
        activeId: prev.activeId,
      });
    },
    [commit],
  );

  const setPlayerBase = useCallback(
    (playerId: string, base: number | null) => {
      editActive((set) => {
        const current = set.overlay[playerId] ?? {};
        const nextPlayer: PlayerOverride = { ...current };
        if (base == null) delete nextPlayer.base;
        else nextPlayer.base = Math.round(base * 10) / 10;
        const overlay = { ...set.overlay };
        if (nextPlayer.base == null && !nextPlayer.weekly) delete overlay[playerId];
        else overlay[playerId] = nextPlayer;
        return { ...set, overlay };
      });
    },
    [editActive],
  );

  const setPlayerWeekly = useCallback(
    (playerId: string, week: number, points: number | null) => {
      editActive((set) => {
        const current = set.overlay[playerId] ?? {};
        const weekly = { ...(current.weekly ?? {}) };
        if (points == null) delete weekly[String(week)];
        else weekly[String(week)] = Math.round(points * 10) / 10;
        const nextPlayer: PlayerOverride = { ...current };
        if (Object.keys(weekly).length === 0) delete nextPlayer.weekly;
        else nextPlayer.weekly = weekly;
        const overlay = { ...set.overlay };
        if (nextPlayer.base == null && !nextPlayer.weekly) delete overlay[playerId];
        else overlay[playerId] = nextPlayer;
        return { ...set, overlay };
      });
    },
    [editActive],
  );

  const clearPlayer = useCallback(
    (playerId: string) => {
      editActive((set) => {
        const overlay = { ...set.overlay };
        delete overlay[playerId];
        return { ...set, overlay };
      });
    },
    [editActive],
  );

  const toggleFlag = useCallback(
    (playerId: string, kind: 'high' | 'low') => {
      editActive((set) => {
        const flags = { ...set.flags };
        if (flags[playerId] === kind) delete flags[playerId];
        else flags[playerId] = kind;
        return { ...set, flags };
      });
    },
    [editActive],
  );

  const reset = useCallback(() => {
    editActive((set) => ({ ...set, overlay: {}, flags: {} }));
  }, [editActive]);

  const createSet = useCallback(
    (name?: string) => {
      const prev = stateRef.current;
      const s = freshSet(name?.trim() || `Board ${prev.sets.length + 1}`);
      commit({ sets: [...prev.sets, s], activeId: s.id });
    },
    [commit],
  );

  const renameSet = useCallback(
    (id: string, name: string) => {
      const prev = stateRef.current;
      commit({
        sets: prev.sets.map((s) =>
          s.id === id
            ? { ...s, name: name.trim() || s.name, updatedAt: new Date().toISOString() }
            : s,
        ),
        activeId: prev.activeId,
      });
    },
    [commit],
  );

  const deleteSet = useCallback(
    (id: string) => {
      const prev = stateRef.current;
      const remaining = prev.sets.filter((s) => s.id !== id);
      const sets = remaining.length ? remaining : [freshSet()];
      const activeId = prev.activeId === id ? sets[0].id : prev.activeId;
      const uid = userIdRef.current;
      if (uid) {
        void supabase.from('olympus_models').delete().eq('id', id).then(() => undefined, () => undefined);
      }
      commit({ sets, activeId });
    },
    [commit],
  );

  const switchSet = useCallback(
    (id: string) => {
      const prev = stateRef.current;
      if (id === prev.activeId || !prev.sets.some((s) => s.id === id)) return;
      commit({ sets: prev.sets, activeId: id });
    },
    [commit],
  );

  const active = activeOf(state);
  const value = useMemo<ModelOverlayValue>(
    () => ({
      overlay: active.overlay,
      flags: active.flags,
      overlayVersion,
      overrideCount: Object.keys(active.overlay).length,
      setPlayerBase,
      setPlayerWeekly,
      clearPlayer,
      toggleFlag,
      reset,
      sets: state.sets.map((s) => ({
        id: s.id,
        name: s.name,
        count: Object.keys(s.overlay).length,
        updatedAt: s.updatedAt ?? null,
      })),
      activeSetId: active.id,
      activeSetName: active.name,
      createSet,
      renameSet,
      deleteSet,
      switchSet,
    }),
    [
      active,
      state.sets,
      overlayVersion,
      setPlayerBase,
      setPlayerWeekly,
      clearPlayer,
      toggleFlag,
      reset,
      createSet,
      renameSet,
      deleteSet,
      switchSet,
    ],
  );

  return <ModelOverlayContext.Provider value={value}>{children}</ModelOverlayContext.Provider>;
}

export function useModelOverlay() {
  const ctx = useContext(ModelOverlayContext);
  if (!ctx) throw new Error('useModelOverlay must be used within ModelOverlayProvider');
  return ctx;
}
