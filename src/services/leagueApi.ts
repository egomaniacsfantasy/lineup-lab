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
  playoffTeams: number | null;
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

export interface PricedSide {
  moneyline: number;
  winProbability: number;
  projection: number;
  spread: number;
  total: number;
  unpricedStarters: string[];
  zeroedStarters: string[];
}

export interface PricedLine {
  matchupId: number;
  week: number;
  computedAt: number;
  inputsHash: string;
  sides: Record<string, PricedSide>;
}

export interface UserSwap {
  slotIndex: number;
  slotLabel: string;
  starterId: string;
  benchId: string;
  starterMean: number;
  benchMean: number;
  deltaWinProb: number;
  resultingWinProb: number;
  resultingMoneyline: number;
  resultingProjection: number;
}

export interface PricedFuture {
  rosterId: number;
  teamName: string;
  record: { wins: number; losses: number; ties: number };
  projWins?: number;
  projLosses?: number;
  projRecord?: string;
  playoffProb: number;
  playoffOdds: number;
  titleProb: number;
  championOdds: number;
  finalsOdds: number;
  isUser: boolean;
}

export interface LeaguePricing {
  available: boolean;
  reason?: string;
  projectionVersion?: string;
  computedAt?: number;
  inputsHash?: string;
  week?: number;
  scoringNote?: string | null;
  lines?: PricedLine[];
  userSwaps?: UserSwap[];
  playerMeans?: Record<string, { mean: number; stdev: number; unpriced: boolean; zeroed: boolean; derived: boolean }>;
  futures?: PricedFuture[];
  draftWrapped?: DraftWrappedReal | null;
  movers?: MarketMover[];
  leagueMedian?: { mean: number; sigma: number };
  /** Latest recorded title odds per week (real history only). */
  titleHistory?: { week: number; odds: Record<string, number>; at: number }[];
}

export interface DraftWrappedReal {
  teamName: string;
  leagueName: string;
  grade: string;
  ratio: number;
  boldestPick: { playerId: string; name: string; pickNo: number; reach: number } | null;
  unpricedPicks: number;
  totalPicks: number;
  toughestWeek: { week: number; opponent: string; odds: number; winProb: number } | null;
  easiestWeek: { week: number; opponent: string; odds: number; winProb: number } | null;
}

export interface MarketMover {
  kind: 'waiver' | 'trade';
  headline: string;
  detail: string;
  playerId?: string;
  titleOddsBefore: number;
  titleOddsAfter: number;
}

export interface LineHistoryEntry {
  computedAt: number;
  inputsHash: string;
  projectionVersion: string;
  week: number;
  lines: {
    matchupId: number;
    sides: Record<string, { moneyline: number; winProbability: number }>;
  }[];
}

export function fetchLineHistory(leagueId: string) {
  return get<{ history: LineHistoryEntry[] }>(`/api/league/${leagueId}/line-history`);
}

export function fetchLines(leagueId: string, userId: string) {
  return get<LeaguePricing>(
    `/api/league/${leagueId}/lines?userId=${encodeURIComponent(userId)}`,
  );
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
