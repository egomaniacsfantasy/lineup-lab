/**
 * Client for the Odds Gods server API. Provider-agnostic: the browser never
 * talks to Sleeper (or any provider) directly.
 */
import { maybeHandleDesignFixtureRequest } from '../dev/designFixtures';
import type { MatchupHistograms } from '../types/matchup';

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
  // Number of divisions (≥2 means the sim seeds division winners first). null/1
  // = no divisions, seed purely by overall record.
  divisions: number | null;
  // true = playoff bracket re-seeds each round (top remaining seed plays bottom);
  // false/null = classic fixed bracket. Drives simulateSeason's bracket.
  playoffReseed: boolean | null;
  // Whether division winners get seeding priority. null = engine default (ON when
  // divisions ≥ 2); false = seed purely by record even with divisions. Not
  // provider-detected — set via the on-site playoff-settings override.
  divisionWinnerPriority: boolean | null;
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
  // Division id this team belongs to (null when the league has no divisions).
  division: number | null;
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
  // Present only on the user's own current-week matchup side.
  histograms?: MatchupHistograms | null;
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
  finalsOdds?: number;
  avgSeed?: number;
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
    note?: string;
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
  leagueId?: string;
  headline: string;
  detail: string;
  playerId?: string;
  givePlayerId?: string;
  getPlayerId?: string;
  givePlayerIds?: string[];
  getPlayerIds?: string[];
  partnerRosterId?: number;
  partnerGain?: number;
  framing?: 'both_upgrade' | 'near_fair_you_win';
  verdict?: string;
  valueGap?: number;
  acceptanceProbability?: number | null;
  acceptanceReason?: string;
  pricedAt?: number;
  /** Projected points the move adds to your starting lineup. */
  valueGain?: number;
  titleOddsBefore: number;
  titleOddsAfter: number;
}

export interface ScoutingEvidence {
  trait: string;
  text: string;
  weight: number;
}

export interface ScoutingRead {
  manager_key: string;
  provider: 'sleeper' | 'espn';
  league_id: string;
  traits: {
    trade_appetite?: number;
    team_bias?: { team: string; strength: number };
    their_guys?: { player_id: string; seasons: number; leagues: number }[];
    reach_tendency?: number;
    waiver_aggression?: number;
    activity?: number;
    roster_philosophy?: 'rb_heavy' | 'wr_heavy' | 'balanced' | 'late_qb' | null;
    needs?: { weak?: string[]; surplus?: string[] } | null;
    negotiation_style?: string | null;
  };
  evidence: ScoutingEvidence[];
  edit: {
    overrides: Record<string, unknown>;
    untouchables: string[];
    favorite_team: string | null;
    negotiation_style: 'clean' | 'counters' | 'ghosts' | null;
    notes: string | null;
    updated_at: string;
  } | null;
  computed_at: string | null;
  manager: {
    manager_key: string;
    name: string;
    team_name: string;
    roster_id: number | null;
    avatar_url: string | null;
    record: string;
  };
}

export interface ScoutingSuperlative {
  key: 'stingiest' | 'biggest_homer' | 'waiver_shark' | 'fastest_trigger';
  manager_key: string;
  value_text: string;
}

export interface LineHistoryEntry {
  computedAt: number;
  inputsHash: string;
  projectionVersion: string;
  week: number;
  trigger?: string;
  lines: {
    matchupId: number;
    sides: Record<string, { moneyline: number; winProbability: number }>;
  }[];
  titleOdds?: Record<string, number>;
  playoffOdds?: Record<string, number>;
  titleProb?: Record<string, number>;
  playoffProb?: Record<string, number>;
  teamSnapshots?: {
    rosterId: number;
    teamName?: string;
    winProbThisWeek?: number | null;
    titleOdds?: number | null;
    playoffOdds?: number | null;
    trigger?: string;
    computedAt: number;
  }[];
}

export function fetchLineHistory(leagueId: string) {
  return get<{ history: LineHistoryEntry[] }>(`/api/league/${leagueId}/line-history`);
}

function authHeaders(ownerUserId?: string | null) {
  const headers: Record<string, string> = {};
  if (ownerUserId) headers['x-owner-user-id'] = ownerUserId;
  return headers;
}

export function fetchScoutingLeague(
  leagueId: string,
  userId: string,
  ownerUserId?: string | null,
) {
  return get<ScoutingRead[]>(
    `/api/scouting/league/${leagueId}?userId=${encodeURIComponent(userId)}`,
    { headers: authHeaders(ownerUserId) },
  );
}

export function fetchScoutingSuperlatives(leagueId: string) {
  return get<{ superlatives: ScoutingSuperlative[] }>(
    `/api/scouting/league/${leagueId}/superlatives`,
  );
}

export function saveScoutingEdit(
  leagueId: string,
  managerKey: string,
  ownerUserId: string,
  body: {
    overrides: Record<string, unknown>;
    untouchables: string[];
    favorite_team: string | null;
    negotiation_style: 'clean' | 'counters' | 'ghosts' | null;
    notes: string | null;
  },
) {
  return get<{ ok: boolean; edit: ScoutingRead['edit'] }>(
    `/api/scouting/edits/${leagueId}/${encodeURIComponent(managerKey)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders(ownerUserId) },
      body: JSON.stringify(body),
    },
  );
}

const LINE_FETCH_TIMEOUT_MS = 45_000;

export function fetchLines(leagueId: string, userId: string, opts?: { house?: boolean }) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), LINE_FETCH_TIMEOUT_MS);

  return get<LeaguePricing>(
    `/api/league/${leagueId}/lines?userId=${encodeURIComponent(userId)}`,
    {
      ...(opts?.house ? { headers: { 'x-skip-overlay': '1' } } : {}),
      signal: controller.signal,
    },
  ).finally(() => window.clearTimeout(timeout));
}

export interface LiveStatus {
  on: boolean;
  at: number;
  leagues?: number;
  cycleMs?: number;
}

/** Is live in-game mode on right now (tells the client to poll ~30s). Public. */
export async function fetchLiveStatus(): Promise<LiveStatus> {
  try {
    const res = await fetch(apiUrl('/api/live/status'));
    if (!res.ok) return { on: false, at: 0 };
    return (await res.json()) as LiveStatus;
  } catch {
    return { on: false, at: 0 };
  }
}

/** Admin: turn live in-game mode on/off. */
export async function setLiveModeAdmin(on: boolean, password: string): Promise<LiveStatus> {
  const res = await fetch(apiUrl('/api/admin/live'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
    body: JSON.stringify({ on }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : 'live_toggle_failed');
  return (await res.json()) as LiveStatus;
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

/** The projection board: agreement-weighted, scoring-specific season totals for
 *  the value-over-replacement board. Pass the league's scoring so PPR / half /
 *  standard return the right numbers. */
export interface PlayoffSettings {
  divisions: number | null;
  hasDivisions: boolean;
  divisionWinnerPriority: boolean | null;
  playoffReseed: boolean;
  detected: { playoffReseed: boolean | null };
  override: { divisionWinnerPriority?: boolean | null; playoffReseed?: boolean | null } | null;
}

export function fetchPlayoffSettings(leagueId: string) {
  return get<PlayoffSettings>(`/api/league/${leagueId}/playoff-settings`);
}

export function savePlayoffSettings(
  leagueId: string,
  patch: { divisionWinnerPriority?: boolean | null; playoffReseed?: boolean | null },
) {
  return get<{ ok: boolean }>(`/api/league/${leagueId}/playoff-settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function fetchBoard(limit = 800, scoring?: string, modelOnly = false) {
  const scoringQ = scoring ? `&scoring=${encodeURIComponent(scoring)}` : '';
  const modelQ = modelOnly ? '&model=1' : '';
  return get<{ available: boolean; version: string; source: string; rankings: BoardRow[] }>(
    `/api/rankings?limit=${limit}${scoringQ}${modelQ}`,
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
/**
 * Where /api lives.
 *
 * On the web this is empty, so paths stay relative and resolve against
 * whatever host is serving the app. Inside the iOS shell the bundle is served
 * from capacitor://localhost, where a relative /api resolves to an origin that
 * does not exist and EVERY request fails. The native build sets
 * VITE_API_BASE_URL to the real API so the same code works in both.
 */
declare const __API_BASE__: string | undefined;

/* `import.meta.env?.VITE_API_BASE_URL` looked right and shipped dead: Vite only
   substitutes the exact text `import.meta.env.VITE_API_BASE_URL`, so the `?.`
   defeated it and the bundle kept a runtime lookup on an empty object. Every
   native request then fell back to a relative path and failed. __API_BASE__ is
   a define, so it is a literal by the time it reaches the bundle, and the
   typeof guard keeps this module importable outside a Vite build. */
const API_BASE = (typeof __API_BASE__ === 'string' ? __API_BASE__ : '').replace(/\/$/, '');

export function apiUrl(path: string) {
  if (!API_BASE) return path;
  return path.startsWith('/') ? `${API_BASE}${path}` : path;
}

function withContext(path: string, init: RequestInit = {}): [string, RequestInit] {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  // Opt-out sentinel: fetch the house (pure-Franco) line for side-by-side baselines.
  const skipOverlay = headers['x-skip-overlay'];
  delete headers['x-skip-overlay'];
  if (overlayHeader && !skipOverlay) headers['x-olympus-overlay'] = overlayHeader;

  if (apiContext.provider !== 'espn') return [apiUrl(path), { ...init, headers }];

  const separator = path.includes('?') ? '&' : '?';
  const url = apiUrl(`${path}${separator}provider=espn&season=${encodeURIComponent(
    apiContext.season ?? '',
  )}`);
  if (apiContext.espnS2) headers['x-espn-s2'] = apiContext.espnS2;
  if (apiContext.swid) headers['x-espn-swid'] = apiContext.swid;
  return [url, { ...init, headers }];
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const [url, decorated] = withContext(path, init);
  const fixture = await maybeHandleDesignFixtureRequest(url, decorated);
  if (fixture !== null) return fixture as T;
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

export type EspnLoginResult =
  | {
      status: 'connected';
      league: { id: string; name: string; season: string; totalTeams: number; scoringFamily: string };
      teams: EspnTeamSummary[];
      espnS2?: string;
      swid?: string;
    }
  | { status: 'otp_required'; challengeId: string; message: string }
  | { status: 'fallback'; reason: string; message: string };

export function startEspnLogin(body: {
  leagueId: string;
  season: string;
  email: string;
  password: string;
  otp?: string;
  challengeId?: string;
}): Promise<EspnLoginResult> {
  return get<EspnLoginResult>('/api/espn/login/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function trackEspnConnectEvent(event: string, payload: Record<string, unknown> = {}) {
  return fetch(apiUrl('/api/telemetry/event'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      area: 'espn_connect',
      event,
      payload,
      at: Date.now(),
    }),
    keepalive: true,
  }).catch(() => undefined);
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

export interface TradeSideStat {
  playoffProb: number;
  titleProb: number;
  avgSeed: number;
  expWins: number;
  // Current-week matchup win %. null off-season (no scheduled matchup).
  weekWinProb?: number | null;
}
export interface TradeSideDelta {
  rosterId: number;
  teamName: string;
  isUser: boolean;
  before: TradeSideStat;
  after: TradeSideStat;
  delta: TradeSideStat;
}
export interface TradeAnalysis {
  available: boolean;
  reason?: string;
  maxRoster?: number;
  dropsNeeded?: { you: number; partner: number };
  drops?: { you: { playerId: string; name: string }[]; partner: { playerId: string; name: string }[] };
  warnings?: { you: string | null; partner: string | null };
  you?: TradeSideDelta;
  partner?: TradeSideDelta;
}

export interface TradeRationaleSection {
  label: string;
  facts: string[];
}

export interface TradeRationaleResponse {
  available: boolean;
  source: 'structured' | 'narrated';
  cached: boolean;
  narration: string | null;
  structured: {
    summary: string;
    sections: TradeRationaleSection[];
  };
  factors: unknown;
}

export function analyzeTradeApi(
  leagueId: string,
  body: { userId: string; partnerRosterId: number; give: string[]; get: string[]; userDrops?: string[] | null },
): Promise<TradeAnalysis> {
  return get<TradeAnalysis>(`/api/league/${leagueId}/trade-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface TradeCounter {
  available: boolean;
  reason?: string;
  needed?: boolean;
  whoAdds?: 'you' | 'them';
  add?: { id: string; name: string }[];
  before?: { youDelta: number; partnerDelta: number };
  after?: { youDelta: number; partnerDelta: number };
}
export function fetchTradeCounter(
  leagueId: string,
  body: { userId: string; partnerRosterId: number; give: string[]; get: string[]; userDrops?: string[] | null; target?: number },
): Promise<TradeCounter> {
  return get<TradeCounter>(`/api/league/${leagueId}/trade-counter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface TradeSuggestion {
  partnerRosterId: number;
  partnerName: string;
  give: { id: string; name: string }[];
  get: { id: string; name: string }[];
  youDelta: number;
  partnerDelta: number;
  youPlayoffDelta?: number;
  partnerPlayoffDelta?: number;
  youWeekDelta?: number | null;
  partnerWeekDelta?: number | null;
}
export interface TradeSuggestions {
  available: boolean;
  reason?: string;
  suggestions?: TradeSuggestion[];
  debug?: { enumerated: number; scanned: number; resimmed: number; positive: number; ms: number };
}
export function fetchTradeSuggestions(
  leagueId: string,
  body: {
    userId: string;
    partnerRosterId?: number | null;
    position?: 'QB' | 'RB' | 'WR' | 'TE' | null;
    readsByRoster?: Record<number, { friendliness: number; relationship: number }>;
  },
): Promise<TradeSuggestions> {
  return get<TradeSuggestions>(`/api/league/${leagueId}/trade-suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function fetchTradeRationale(
  leagueId: string,
  body: {
    userId: string;
    partnerRosterId: number;
    give: string[];
    get: string[];
    traits: TradeTraits;
    userDrops?: string[] | null;
  },
): Promise<TradeRationaleResponse> {
  return get<TradeRationaleResponse>(`/api/league/${leagueId}/trade-rationale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
