import { apiUrl } from './apiBase.ts';

export interface TeamGameContext {
  team: string;
  week: number;
  season: number;
  opponent: string;
  homeAway: 'home' | 'away';
  kickoffIso: string;
  gameId: string;
}

export interface NflScheduleResponse {
  available: boolean;
  season?: number;
  week?: number;
  games?: TeamGameContext[];
  byes?: string[];
  stale?: boolean;
}

export async function fetchNflSchedule(season: number, week: number) {
  const params = new URLSearchParams({
    season: String(season),
    week: String(week),
  });
  const response = await fetch(apiUrl(`/api/nfl/schedule?${params.toString()}`));
  if (!response.ok) {
    return { available: false } satisfies NflScheduleResponse;
  }
  return response.json() as Promise<NflScheduleResponse>;
}
