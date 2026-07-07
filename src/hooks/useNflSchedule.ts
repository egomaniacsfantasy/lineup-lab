import { useEffect, useMemo, useState } from 'react';
import { fetchNflSchedule, type TeamGameContext } from '../services/nflSchedule';

type ScheduleState =
  | { status: 'loading'; games: TeamGameContext[]; byes: string[] }
  | { status: 'ready'; games: TeamGameContext[]; byes: string[]; stale?: boolean }
  | { status: 'unavailable'; games: TeamGameContext[]; byes: string[] };

const scheduleCache = new Map<string, Promise<ScheduleState> | ScheduleState>();

function cacheKey(season: number, week: number) {
  return `${season}:${week}`;
}

async function loadSchedule(season: number, week: number): Promise<ScheduleState> {
  const response = await fetchNflSchedule(season, week);
  if (!response.available || !response.games || !response.byes) {
    return { status: 'unavailable', games: [], byes: [] };
  }
  return {
    status: 'ready',
    games: response.games,
    byes: response.byes,
    stale: response.stale,
  };
}

export function useNflSchedule(season: number | null, week: number | null) {
  const [state, setState] = useState<ScheduleState>(() => ({
    status: season && week ? 'loading' : 'unavailable',
    games: [],
    byes: [],
  }));

  useEffect(() => {
    if (!season || !week) {
      return;
    }

    const key = cacheKey(season, week);
    const cached = scheduleCache.get(key);
    let cancelled = false;

    if (cached && !(cached instanceof Promise)) {
      Promise.resolve().then(() => {
        if (!cancelled) setState(cached);
      });
      return;
    }

    const promise = cached instanceof Promise ? cached : loadSchedule(season, week);
    if (!cached) scheduleCache.set(key, promise);
    Promise.resolve().then(() => {
      if (!cancelled) setState({ status: 'loading', games: [], byes: [] });
    });

    promise
      .then((next) => {
        scheduleCache.set(key, next);
        if (!cancelled) setState(next);
      })
      .catch(() => {
        const next: ScheduleState = { status: 'unavailable', games: [], byes: [] };
        scheduleCache.set(key, next);
        if (!cancelled) setState(next);
      });

    return () => {
      cancelled = true;
    };
  }, [season, week]);

  return useMemo(() => {
    if (!season || !week) {
      return {
        status: 'unavailable' as const,
        byTeam: new Map<string, TeamGameContext>(),
        byes: new Set<string>(),
      };
    }

    const byTeam = new Map(state.games.map((game) => [game.team, game]));
    return {
      status: state.status,
      byTeam,
      byes: new Set(state.byes),
    };
  }, [season, state, week]);
}
