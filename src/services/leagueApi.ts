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
  leagueType: 'redraft' | 'keeper' | 'dynasty';
  bestBall: boolean;
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
  playoffClinched?: boolean;
  playoffOdds: number;
  finalsProb?: number;
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
  /** The user's engine-priced line for every scheduled week. */
  weeklyLines?: {
    week: number;
    opponentRosterId: number;
    opponentName: string;
    moneyline: number;
    winProb: number;
    projection: number;
    opponentProjection: number;
  }[];
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
  givePlayerId?: string;
  getPlayerId?: string;
  /** Projected points the move adds to your starting lineup. */
  valueGain?: number;
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

export function fetchLines(leagueId: string, userId: string, opts?: { house?: boolean }) {
  return get<LeaguePricing>(
    `/api/league/${leagueId}/lines?userId=${encodeURIComponent(userId)}`,
    opts?.house ? { headers: { 'x-skip-overlay': '1' } } : undefined,
  );
}

export interface BoardRow {
  rank: number;
  playerId: string;
  name: string;
  position: string;
  team: string;
  mean: number;
  stdev: number | null;
  floor: number | null;
  ceiling: number | null;
  seasonTotal: number | null;
  weekly: Record<string, number>;
  tier: number | null;
  derived: boolean;
}

/** Franco's projection board (the house line), the base for Build Your Own Rankings. */
export function fetchBoard(limit = 800) {
  return get<{ available: boolean; version: string; source: string; rankings: BoardRow[] }>(
    `/api/rankings?limit=${limit}`,
  );
}

export class LeagueApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Provider context for the active connection. Sleeper needs nothing; ESPN
 * threads its season + (for private leagues) the user's own cookies through
 * every request — query for the season, headers for the secrets.
 */
interface ApiContext {
  provider: 'sleeper' | 'espn';
  season?: string;
  espnS2?: string | null;
  swid?: string | null;
}

let apiContext: ApiContext = { provider: 'sleeper' };

export function setApiContext(context: ApiContext) {
  apiContext = context;
}

/**
 * The user's "Build Your Own Rankings" overlay, base64-encoded, sent on every
 * request so the engine prices off their model. null = pure Franco (house).
 */
let overlayHeader: string | null = null;

export function setProjectionOverlay(encoded: string | null) {
  overlayHeader = encoded;
}

/** Decorate a request path + init with the active provider + overlay context. */
function withContext(path: string, init: RequestInit = {}): [string, RequestInit] {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  // Opt-out sentinel: fetch the house (pure-Franco) line for side-by-side baselines.
  const skipOverlay = headers['x-skip-overlay'];
  delete headers['x-skip-overlay'];
  if (overlayHeader && !skipOverlay) headers['x-olympus-overlay'] = overlayHeader;

  if (apiContext.provider !== 'espn') return [path, { ...init, headers }];

  const separator = path.includes('?') ? '&' : '?';
  const url = `${path}${separator}provider=espn&season=${encodeURIComponent(
    apiContext.season ?? '',
  )}`;
  if (apiContext.espnS2) headers['x-espn-s2'] = apiContext.espnS2;
  if (apiContext.swid) headers['x-espn-swid'] = apiContext.swid;
  return [url, { ...init, headers }];
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const [url, decorated] = withContext(path, init);
  const response = await fetch(url, decorated);
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

export interface EspnTeamSummary {
  rosterId: number;
  ownerId: string | null;
  teamName: string;
  ownerName: string;
  record: { wins: number; losses: number; ties: number };
}

/**
 * Probe an ESPN league. Pass cookies only for a private league. Throws a
 * LeagueApiError with code 'espn_private' when the league needs them.
 */
export function connectEspn(
  leagueId: string,
  season: string,
  creds?: { espnS2: string; swid: string },
) {
  const headers: Record<string, string> = {};
  if (creds) {
    headers['x-espn-s2'] = creds.espnS2;
    headers['x-espn-swid'] = creds.swid;
  }
  return get<{
    league: { id: string; name: string; season: string; totalTeams: number; scoringFamily: string };
    teams: EspnTeamSummary[];
  }>(`/api/espn/connect/${encodeURIComponent(leagueId)}?season=${encodeURIComponent(season)}`, {
    headers,
  });
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
  const [url, init] = withContext(`/api/league/${leagueId}/refresh`, { method: 'POST' });
  return fetch(url, init);
}

export interface TradeTraits {
  /** 1–10: pushover ↔ ruthless shark. */
  toughness: number;
  /** 1–10: ghosts every offer ↔ trades constantly. */
  dealAppetite: number;
  /** Their favorite NFL team (Sleeper abbr), or null. */
  fandomTeam: string | null;
  /** 1–10: how big a homer they are for that team. */
  fandomLevel: number;
}

export interface TradeResult {
  available: boolean;
  reason?: string;
  you?: {
    teamName: string;
    titleBefore: number;
    titleAfter: number;
    titleProbBefore: number;
    titleProbAfter: number;
    valueDelta: number;
    depthBefore: Record<string, number>;
    depthAfter: Record<string, number>;
  };
  them?: {
    teamName: string;
    titleBefore: number;
    titleAfter: number;
    valueDelta: number;
  };
  verdict?: string;
  acceptance?: { band: string; probability: number; reasons: string[] };
  /** Player value (points over replacement) you give minus you get. >0 = you overpay. */
  valueGap?: number;
  /** When the deal is lopsided, the throw-in(s) that even it out. */
  fairCounter?: {
    whoAdds: 'you' | 'them';
    teamName: string;
    allDepth: boolean;
    add: { id: string; name: string; value: number; starter: boolean }[];
    gapBefore: number;
    gapAfter: number;
  } | null;
  bestPlayer?: { name: string; toThem: boolean };
  isDepthPackage?: boolean;
}

export function priceTrade(
  leagueId: string,
  body: {
    userId: string;
    partnerRosterId: number;
    give: string[];
    get: string[];
    traits: TradeTraits;
  },
): Promise<TradeResult> {
  return get<TradeResult>(`/api/league/${leagueId}/trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
