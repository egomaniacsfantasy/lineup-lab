/**
 * Client for the Olympus server API. Provider-agnostic: the browser never
 * talks to Sleeper (or any provider) directly.
 */

export interface ProviderUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ApiLeagueSummary {
  id: string;
  providerId: string;
  name: string;
  season: string;
  totalTeams: number;
  scoringFamily: 'ppr' | 'half-ppr' | 'standard';
  hasCustomScoring: boolean;
  status: 'pre_draft' | 'drafting' | 'in_season' | 'complete';
}

export interface ApiLeague extends ApiLeagueSummary {
  scoringSettings: Record<string, number>;
  rosterPositions: string[];
  playoffWeekStart: number | null;
  lastScoredWeek: number | null;
  regularSeasonWeeks: number;
}

export interface ApiTeam {
  rosterId: number;
  teamId: string;
  ownerId: string | null;
  ownerName: string;
  teamName: string;
  avatarUrl: string | null;
  players: string[];
  starters: string[];
  reserve: string[];
  record: { wins: number; losses: number; ties: number };
  pointsFor: number;
  pointsAgainst: number;
  isUser: boolean;
}

export interface ApiMatchup {
  matchupId: number;
  week: number;
  rosterId: number;
  points: number;
  playersPoints: Record<string, number>;
  starters: string[];
  players: string[];
}

export interface ApiCatalogPlayer {
  id: string;
  name: string;
  team: string | null;
  position: string;
  status: string | null;
  injuryStatus: string | null;
}

export interface LeagueBootstrap {
  league: ApiLeague;
  teams: ApiTeam[];
  week: number;
  matchups: ApiMatchup[];
  players: Record<string, ApiCatalogPlayer>;
  state: { season: string; week: number; seasonType: string };
  lastUpdated: number;
}

export interface ScheduleWeek {
  week: number;
  matchups: ApiMatchup[];
}

export class LeagueApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new LeagueApiError(
      body?.error ?? 'request_failed',
      body?.message ?? 'Something went wrong talking to the league service.',
    );
  }

  return body as T;
}

export function connectUsername(username: string) {
  return get<{ user: ProviderUser; season: string; leagues: ApiLeagueSummary[] }>(
    `/api/connect/${encodeURIComponent(username)}`,
  );
}

export function fetchBootstrap(leagueId: string, userId: string) {
  return get<LeagueBootstrap>(
    `/api/league/${leagueId}/bootstrap?userId=${encodeURIComponent(userId)}`,
  );
}

export function fetchSchedule(leagueId: string) {
  return get<{ weeks: ScheduleWeek[]; lastUpdated: number }>(
    `/api/league/${leagueId}/schedule`,
  );
}

export function refreshLeague(leagueId: string) {
  return fetch(`/api/league/${leagueId}/refresh`, { method: 'POST' });
}
