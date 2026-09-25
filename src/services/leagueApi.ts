/**
 * Client for the Odds Gods server API. Provider-agnostic: the browser never
 * talks to Sleeper (or any provider) directly.
 */
import { maybeHandleDesignFixtureRequest } from '../dev/designFixtures';
import type { MatchupHistograms } from '../types/matchup';
import { apiUrl } from './apiBase.ts';

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
  /** Sleeper only: the league this one replaced, or null for a first season. */
  previousLeagueId?: string | null;
}

export interface LeagueSuccessor {
  successor: ApiLeagueSummary | null;
  season?: string;
  reason: 'found' | 'not_rolled_over' | 'already_current' | 'no_user' | 'unsupported_provider';
}

/** Which league replaced the one you have connected. See the route's note. */
export function fetchLeagueSuccessor(leagueId: string, userId: string) {
  return get<LeagueSuccessor>(
    `/api/league/${leagueId}/successor?userId=${encodeURIComponent(userId)}`,
  );
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
  /* When the draft is scheduled, epoch millis. null when the provider does not
     say or the draft is unscheduled. */
  draftAt?: number | null;
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
  /* null when the manager has no printable name — ESPN hands back an
     account handle for anyone who never set a display name, and the provider
     drops those rather than print a serial number as a person. */
  ownerName: string | null;
  teamName: string;
  avatarUrl: string | null;
  players: string[];
  starters: string[];
  /** On the roster, not startable from where they sit: injured reserve. */
  reserve: string[];
  /** Dynasty taxi squad. Same "cannot be started" fact, different reason. */
  taxi?: string[];
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

export interface DraftPick {
  pickNo: number;
  round: number;
  rosterId: number;
  playerId: string;
  isKeeper: boolean;
}

export interface LeagueBootstrap {
  league: ApiLeague;
  teams: ApiTeam[];
  week: number;
  matchups: ApiMatchup[];
  players: Record<string, ApiCatalogPlayer>;
  state: { season: string; week: number; seasonType: string };
  lastUpdated: number;
  /** Present once the league's draft is complete. */
  draftPicks?: DraftPick[] | null;
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
  /** Present only while live mode is on: per-player live points + projected final.
   *  `current` = points scored so far; `projected` = live projected final total
   *  (position-aware, blend for D/ST). Keyed by the same playerId as the lineup. */
  livePlayers?: Record<string, { current: number; projected: number }> | null;
  /** Set by the server's live overlay merge while live mode is on. */
  live?: { at: number; week?: number } | null;
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
    /**
     * The lineups behind the line. For the current week these are the lineups
     * as set; for a future week, the best lineup each roster could field, which
     * is how the engine has always priced a week nobody has played.
     */
    yourStarters?: OptimalSlot[];
    yourBench?: OptimalSlot[];
    opponentStarters?: OptimalSlot[];
    opponentBench?: OptimalSlot[];
    /**
     * This week priced as if BOTH managers fielded their best lineup. Present
     * only on the current week (future weeks are already optimal-vs-optimal).
     *
     * `deltaWinProb` is a MOVEMENT in percentage points, not a price: the
     * engine prices both lineups off one seed so the difference is the lineup
     * change rather than sim noise, and the caller applies it to the win
     * probability already on screen. That way the hypothetical and the real
     * line can never disagree about where the market is now.
     */
    optimal?: OptimalLine | null;
  }[];
}

/** This week with both lineups at their best. See `weeklyLines[].optimal`. */
export interface OptimalLine {
  deltaWinProb: number;
  projection: number;
  opponentProjection: number;
  yourStarters: OptimalSlot[];
  opponentStarters: OptimalSlot[];
}

/** One slot of an engine-built best lineup. */
export interface OptimalSlot {
  slot: string;
  playerId: string | null;
  name: string;
  position: string | null;
  projection: number;
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
    /* spread and projection are absent on snapshots recorded before they were
       persisted, which is why both are optional: history is not rewritten. */
    sides: Record<
      string,
      { moneyline: number; winProbability: number; spread?: number; projection?: number }
    >;
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

export interface PlayerDistribution {
  available: boolean;
  reason?: string;
  week?: number;
  playerId?: string;
  name?: string;
  mean?: number;
  floor?: number;
  ceiling?: number;
  sigmaDown?: number;
  sigmaUp?: number;
  step?: number;
  ladder?: { line: number; over: number; under: number }[];
  histogram?: { lo: number; hi: number; mid: number; prob: number }[];
}

/** Over/under ladder + probability histogram for one player's week (same split-normal
 *  the matchup sims use). week defaults server-side to the league's priced week. */
export function fetchPlayerDistribution(
  leagueId: string,
  playerId: string,
  week: number,
  userId?: string | null,
) {
  const u = userId ? `&userId=${encodeURIComponent(userId)}` : '';
  return get<PlayerDistribution>(
    `/api/league/${leagueId}/player/${encodeURIComponent(playerId)}/distribution?week=${week}${u}`,
  );
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
  return get<{ available: boolean; version: string; source: string; consensusEnabled?: boolean; rankings: BoardRow[] }>(
    `/api/rankings?limit=${limit}${scoringQ}${modelQ}`,
  );
}

export class LeagueApiError extends Error {
  code: string;

  /**
   * Will this succeed if we simply wait?
   *
   * A rate limit and a dead connection arrive through the same path, and the
   * app used to treat every failure as the second: a 429 from clicking around
   * too fast made the League tab offer to RECONNECT a league that was working
   * perfectly. Telling somebody their account is broken when it is not costs
   * more than the error it was reporting.
   */
  retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
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

export { apiUrl } from './apiBase.ts';

/** Decorate a request path + init with the active provider + overlay context.
 *  Exported so leaf service modules (e.g. the Predictor) send the SAME provider
 *  context — without it, an ESPN league falls back to the Sleeper provider. */
export function withContext(path: string, init: RequestInit = {}): [string, RequestInit] {
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

  /* A deploy restarts the API, and every request in that window comes back 502
     from the platform rather than from us. That is a few seconds of a bad
     gateway presented to the user as a failure they did something to cause.
     One retry after a short pause covers a restart; anything still failing
     after that is a real fault and is reported as one. Retrying is only safe
     for reads, so a request with a method is left alone. */
  const isRead = !decorated.method || decorated.method.toUpperCase() === 'GET';

  /* A bad gateway rejects fast and the retry above handles it. A connection
     accepted and then never answered does not reject at all, which is the
     state a platform restart can leave a socket in, and fetch waits on it
     forever. The user gets a button that spins for as long as they are willing
     to watch it. Thirty seconds is well past the slowest real response (a cold
     pricing run) and well short of anyone's patience. */
  const REQUEST_TIMEOUT_MS = 30_000;
  const send = () => fetch(url, { ...decorated, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  /* A deploy takes the API away for the best part of a minute, and every
     request in that window fails at the connection rather than with a status:
     fetch rejects with a TypeError whose message is the browser's own words,
     "Load failed" in Safari and "Failed to fetch" in Chrome.

     Both problems were live at once. That rejection was not retried at all —
     only a TimeoutError was — and it was rethrown untouched, so the browser's
     internal string was rendered to the user as the entire explanation. The
     result is a black page reading "Load failed" every time anybody deploys,
     which is exactly what Andre was looking at.

     One retry at 1.2s never spanned a restart either. The waits below add up to
     roughly twelve seconds across four attempts, which covers a normal restart,
     while still giving up long before anyone would keep waiting. Reads only:
     replaying a POST could double a write. */
  const RETRY_WAITS_MS = [1_200, 3_000, 8_000];

  const isNetworkFailure = (error: unknown) =>
    error instanceof TypeError
    || (error instanceof DOMException && error.name === 'NetworkError');
  const isTimeout = (error: unknown) =>
    error instanceof DOMException && error.name === 'TimeoutError';

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  let response: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_WAITS_MS.length; attempt += 1) {
    if (attempt > 0) await wait(RETRY_WAITS_MS[attempt - 1]);
    try {
      response = await send();
    } catch (caught) {
      lastError = caught;
      /* A write, or something that is not the connection failing, is the
         caller's problem and is not replayed. */
      if (!isRead || !(isNetworkFailure(caught) || isTimeout(caught))) {
        throw isTimeout(caught)
          ? new LeagueApiError(
              'request_timeout',
              'That request took too long and was given up on. Try again in a moment.',
            )
          : caught;
      }
      continue;
    }
    /* The platform answers for a service that is still coming up. Same
       treatment: wait and ask again. */
    if (isRead && [502, 503, 504].includes(response.status)) {
      lastError = null;
      continue;
    }
    break;
  }

  if (!response || (isRead && [502, 503, 504].includes(response.status))) {
    /* Never the browser's own words. "Load failed" tells the reader nothing
       and cannot be reported to us usefully. */
    throw new LeagueApiError(
      lastError ? 'connection_failed' : 'service_unavailable',
      'We could not reach Odds Gods just then. It is usually back within a minute.',
    );
  }
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    /* When the server hands back JSON it carries a message worth showing, so
       show it. When it does not — an unhandled exception reaches Express's
       default handler, which answers with an HTML page — body is null and the
       old code printed one generic sentence for every possible failure. That
       sentence is unreportable: it cannot be told apart from a timeout, a bad
       gateway or a crash. The status goes in so it can be. */
    /* The server now carries the real failure in `detail`. Showing it beats
       hiding it: "The league provider did not respond" sent us to look at
       Sleeper when the fault was ours, twice. The friendly line still leads. */
    const friendly =
      body?.message ??
      `The league service answered ${response.status}. If this keeps happening, that status is the thing to report.`;
    throw new LeagueApiError(
      body?.error ?? `request_failed_${response.status}`,
      body?.detail && body.detail !== friendly ? `${friendly} (${body.detail})` : friendly,
      /* The server says so for a rate limit; 429 and 5xx are transient by
         definition whoever sent them. */
      Boolean(body?.retryable) || response.status === 429 || response.status >= 500,
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
  /* null when ESPN only offers a machine handle for this account. */
  ownerName: string | null;
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
    /* The roster the signed-in ESPN account owns, matched from the SWID
       cookie. null when there is nothing to match (a public league, no
       sign-in) or when the match is ambiguous (someone co-owning two teams). */
    yourRosterId: number | null;
    /* Only send a season when there is one.

       A league URL copied out of ESPN usually has no seasonId in it, so this
       sent `?season=` and the server's `??` fallback did not fire on an empty
       string. The provider then built a URL with an empty season segment and
       ESPN answered 404, which the user read as "we couldn't reach that
       league" about a league that was public and reachable. The server refuses
       a blank season now too; both ends, because either alone leaves the hole
       open from the other side. */
  }>(
    `/api/espn/connect/${encodeURIComponent(leagueId)}${
      season && season.trim() ? `?season=${encodeURIComponent(season.trim())}` : ''
    }`,
    { headers },
  );
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
  /* A fetch with no timeout waits forever, and this one drives a headless
     browser through a login, so "forever" is a real outcome: the button sat on
     CONNECTING with nothing behind it and no way to tell a slow sign-in from a
     dead one. The worker gives up at 30s, so 60s here is past any honest
     answer it could still be about to send. */
  const controller = new AbortController();
  /* The worker enforces its own budget (LOGIN_TIMEOUT_MS) and answers with a
     real reason when it expires, so the client's job is only to stop an
     infinite wait — not to cut the worker off mid-answer. Measured round trips
     are 33-37s at the current 30s worker budget, so this sits well clear of it
     and of a raised one. */
  const timer = setTimeout(() => controller.abort(), 120_000);
  return get<EspnLoginResult>('/api/espn/login/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return {
          status: 'fallback',
          reason: 'timeout',
          message:
            'ESPN sign-in did not answer in time. Try again, or use the connector on a computer.',
        } satisfies EspnLoginResult;
      }
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

/**
 * One line in the funnel.
 *
 * keepalive so an event fired on the way out of the page still lands, and it
 * swallows its own failures: telemetry is never a reason for a screen to break.
 * The server strips anything that looks like a credential before logging, so
 * payloads stay small and boring by design.
 */
export function trackEvent(area: string, event: string, payload: Record<string, unknown> = {}) {
  return fetch(apiUrl('/api/telemetry/event'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ area, event, payload, at: Date.now() }),
    keepalive: true,
  }).catch(() => undefined);
}

export function trackEspnConnectEvent(event: string, payload: Record<string, unknown> = {}) {
  return trackEvent('espn_connect', event, payload);
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
  // week: null = drop needed now (targetStart); a number = a DEFERRED drop that
  // fires when an IR stash returns and reclaims his active slot (whenReturns names him).
  drops?: {
    you: { playerId: string; name: string; week?: number | null; whenReturns?: string | null }[];
    partner: { playerId: string; name: string; week?: number | null; whenReturns?: string | null }[];
  };
  warnings?: { you: string | null; partner: string | null };
  you?: TradeSideDelta;
  partner?: TradeSideDelta;
  // Every other team in the league, most-affected first (by |Δ championship %|).
  league?: TradeSideDelta[];
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
  debug?: Record<string, number>;
}
export function fetchTradeSuggestions(
  leagueId: string,
  body: {
    userId: string;
    partnerRosterId?: number | null;
    position?: 'QB' | 'RB' | 'WR' | 'TE' | null;
    // Must-include targets to build trades around: `getPlayerIds` = opponent
    // players every trade must acquire, `givePlayerIds` = your players every trade
    // must send. Multiple per side; both may be set at once. Narrows the search.
    givePlayerIds?: string[];
    getPlayerIds?: string[];
    readsByRoster?: Record<number, { friendliness: number; relationship: number }>;
  },
): Promise<TradeSuggestions> {
  return get<TradeSuggestions>(`/api/league/${leagueId}/trade-suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface SetLineupMove {
  name: string;
  from: string;
  to: string;
  benched: boolean;
}
export interface SetLineupResult {
  available: boolean;
  applied?: boolean;
  reason?: string;
  moves?: SetLineupMove[];
  count?: number;
  detail?: string | null;
}
// ESPN "set optimal lineup": confirm:false previews the moves, confirm:true
// applies them to the real ESPN team. ESPN-only (server returns unsupported_provider otherwise).
export function setEspnLineup(
  leagueId: string,
  body: { userId: string; confirm: boolean },
): Promise<SetLineupResult> {
  return get<SetLineupResult>(`/api/league/${leagueId}/set-lineup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface AutopilotState {
  enabled: boolean;
  canWrite?: boolean;
  lastRun?: number | null;
  lastResult?: {
    at: number;
    applied: boolean;
    count?: number;
    moves?: SetLineupMove[];
    reason?: string | null;
  } | null;
}
// ── Trade sender: standing rules -> background per-manager scan -> suggested
// offers on the hub -> "Send on ESPN" behind a confirm.
export interface TradeSenderSettings {
  partners: number[];
  giveAllow: string[];
  protect: string[];
  givePositions: string[];
  getPositions: string[];
  minYouDelta: number;
  maxPartnerLoss: number;
  mode: 'suggest' | 'auto';
  autoCap: number | null;
}
export interface TradeSenderOffer {
  id: string;
  partnerRosterId: number;
  partnerName: string;
  give: { id: string; name: string }[];
  get: { id: string; name: string }[];
  youDelta: number;
  partnerDelta: number;
  youPlayoffDelta?: number;
  partnerPlayoffDelta?: number;
  drops?: {
    you: { id: string; name: string }[];
    youLater?: { id: string; name: string; week: number; whenReturns: string }[];
    partner: { id: string; name: string }[];
  };
  sent: { at: number; espnTransactionId: string | null; state?: TradeOfferState } | null;
}
export type TradeOfferState = 'pending' | 'accepted' | 'processed' | 'declined' | 'canceled' | 'expired';
export interface SentTradeOffer {
  at: number;
  offerId: string;
  partnerName: string;
  give: { id: string; name: string }[];
  get: { id: string; name: string }[];
  drops?: { id: string; name: string }[];
  youDelta: number;
  partnerDelta: number;
  espnTransactionId: string | null;
  state?: TradeOfferState;
  closedBy?: string;
  // Latest re-price of the offer while it was out (every scan re-checks it).
  recheck?: { at: number; youDelta: number; partnerDelta: number | null };
  belowRules?: boolean;
}
export interface IncomingTradeOffer {
  id: string;
  fromTeamId: number;
  partnerName: string;
  give: { id: string; name: string }[];
  get: { id: string; name: string }[];
  youDelta: number | null;
  partnerDelta: number | null;
  drops: { id: string; name: string; week: number | null; whenReturns: string | null }[];
  recommendation: 'accept' | 'decline' | null;
  reason: string;
  status: 'pending' | 'accepted' | 'declined';
  handledBy: string | null;
  expirationDate: number | null;
  staleAfterAccept?: boolean;
}
export interface TradeSenderState {
  enabled: boolean;
  settings: TradeSenderSettings;
  suggestions: TradeSenderOffer[];
  lastScan: {
    at: number;
    reason?: string;
    ms?: number;
    managers?: number;
    error?: string | null;
  } | null;
  scanning: boolean;
  canSend: boolean;
  provider?: 'espn' | 'sleeper';
  sentOffers: SentTradeOffer[];
  awaitingTrade: { offerId: string; espnTransactionId: string; since: number } | null;
  dropSendReady: boolean;
  incoming: IncomingTradeOffer[];
  responseReady: boolean;
  autoSend: {
    at: number;
    sent: number;
    usedThisWeek?: number;
    reason?: string | null;
  } | null;
  myPlayers: { id: string; name: string; position: string | null }[];
  managers: { rosterId: number; teamName: string; ownerName: string | null }[];
}
export function getTradeSenderState(leagueId: string, userId: string): Promise<TradeSenderState> {
  return get<TradeSenderState>(
    `/api/league/${leagueId}/trade-sender?userId=${encodeURIComponent(userId)}`,
    { method: 'GET' },
  );
}
export function saveTradeSender(
  leagueId: string,
  body: { userId: string; enabled?: boolean; settings?: TradeSenderSettings },
): Promise<{ enabled: boolean; settings: TradeSenderSettings }> {
  return get(`/api/league/${leagueId}/trade-sender`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
export function scanTradeSenderNow(leagueId: string, userId: string): Promise<{ scanning: boolean }> {
  return get(`/api/league/${leagueId}/trade-sender/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}
export function sendTradeOffer(
  leagueId: string,
  body: { userId: string; offerId: string; confirm: boolean },
): Promise<{ sent: boolean; reason?: string; espnTransactionId?: string | null }> {
  return get(`/api/league/${leagueId}/trade-sender/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function cancelTradeOffer(
  leagueId: string,
  body: { userId: string; espnTransactionId: string },
): Promise<{ canceled: boolean; reason?: string }> {
  return get(`/api/league/${leagueId}/trade-sender/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Save THIS manager's own ESPN login (read by the connector) for the league, so
// autopilot writes act as him. Refuses a different ESPN account than his team's.
export function linkEspnLogin(
  leagueId: string,
  body: { espnS2: string; swid: string; userId: string },
): Promise<{ linked: boolean; reason?: string; yourRosterId?: number | null }> {
  return get(`/api/league/${leagueId}/espn-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function respondToTradeOffer(
  leagueId: string,
  body: { userId: string; proposalId: string; action: 'ACCEPT' | 'DECLINE' },
): Promise<{ done: boolean; reason?: string }> {
  return get(`/api/league/${leagueId}/trade-sender/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getAutopilotState(leagueId: string, userId: string): Promise<AutopilotState> {
  return get<AutopilotState>(`/api/league/${leagueId}/autopilot?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
}
export function setAutopilotState(
  leagueId: string,
  body: { userId: string; enabled: boolean },
): Promise<{ enabled: boolean; reason?: string }> {
  return get<{ enabled: boolean; reason?: string }>(`/api/league/${leagueId}/autopilot`, {
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
