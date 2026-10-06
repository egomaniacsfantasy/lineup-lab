import type { ApiCatalogPlayer, ApiTeam, TradeSuggestion } from '../services/leagueApi';
import { getAcceptanceLingo, type AcceptanceLingoTone } from './acceptanceLingo.ts';

/**
 * The finder's ticket: one question with three blanks and a shape.
 *
 * The ticket is the trade sender's standing rules, asked on demand. Every blank
 * is a POOL, "any of these", and an empty pool means no limit:
 *   - partners: the managers to scan (none picked = every manager);
 *   - you send: positions or players of yours that may go (every player sent
 *     comes from the pool);
 *   - you get: positions or players of theirs you would take (every player
 *     received comes from the pool);
 *   - shapes: the package sizes allowed.
 * Each manager is then scanned one at a time by the same per-manager search the
 * sender runs, at the analyzer's full sim count. This module is the pure half:
 * the query shape, the requests it becomes, and how results are read back. No React.
 */

export type FinderPosition = 'QB' | 'RB' | 'WR' | 'TE';
export const FINDER_POSITIONS: FinderPosition[] = ['QB', 'RB', 'WR', 'TE'];

export function isFinderPosition(value: string | null | undefined): value is FinderPosition {
  return value === 'QB' || value === 'RB' || value === 'WR' || value === 'TE';
}

export type SlotPick =
  | { kind: 'any' }
  | { kind: 'position'; positions: FinderPosition[] }
  | { kind: 'player'; ids: string[] };

export const ANY_PICK: SlotPick = { kind: 'any' };

/** An emptied pool is no limit at all, so it reads (and sends) as "any". */
export function normalizePick(pick: SlotPick): SlotPick {
  if (pick.kind === 'position') {
    const positions = FINDER_POSITIONS.filter((position) => pick.positions.includes(position));
    return positions.length ? { kind: 'position', positions } : ANY_PICK;
  }
  if (pick.kind === 'player') {
    const ids = [...new Set(pick.ids.map(String))];
    return ids.length ? { kind: 'player', ids } : ANY_PICK;
  }
  return ANY_PICK;
}

/** Add or remove one position from a leg. Picking a position replaces a player pool. */
export function togglePosition(pick: SlotPick, position: FinderPosition): SlotPick {
  const current = pick.kind === 'position' ? pick.positions : [];
  const next = current.includes(position) ? current.filter((p) => p !== position) : [...current, position];
  return normalizePick({ kind: 'position', positions: next });
}

/** Add or remove one player from a leg. Picking a player replaces a position pool. */
export function togglePlayer(pick: SlotPick, id: string): SlotPick {
  const current = pick.kind === 'player' ? pick.ids : [];
  const next = current.includes(id) ? current.filter((p) => p !== id) : [...current, id];
  return normalizePick({ kind: 'player', ids: next });
}

export type FinderShape = '1-1' | '2-1' | '1-2' | '2-2' | '2-3' | '3-2' | '3-3';

/** Read as "you send N for M": the first number is always yours. */
export const FINDER_SHAPES: { id: FinderShape; label: string; sizes: { give: number; get: number } }[] = [
  { id: '1-1', label: '1 for 1', sizes: { give: 1, get: 1 } },
  { id: '2-1', label: '2 for 1', sizes: { give: 2, get: 1 } },
  { id: '1-2', label: '1 for 2', sizes: { give: 1, get: 2 } },
  { id: '2-2', label: '2 for 2', sizes: { give: 2, get: 2 } },
  { id: '2-3', label: '2 for 3', sizes: { give: 2, get: 3 } },
  { id: '3-2', label: '3 for 2', sizes: { give: 3, get: 2 } },
  { id: '3-3', label: '3 for 3', sizes: { give: 3, get: 3 } },
];

export function shapeSizes(shape: FinderShape) {
  return FINDER_SHAPES.find((entry) => entry.id === shape)?.sizes ?? null;
}

function orderedShapes(shapes: FinderShape[]): FinderShape[] {
  return FINDER_SHAPES.map((entry) => entry.id).filter((id) => shapes.includes(id));
}

/** Add or remove one package size. None picked = any size. */
export function toggleShape(shapes: FinderShape[], shape: FinderShape): FinderShape[] {
  return orderedShapes(shapes.includes(shape) ? shapes.filter((s) => s !== shape) : [...shapes, shape]);
}

export function togglePartner(partnerRosterIds: number[], rosterId: number): number[] {
  return partnerRosterIds.includes(rosterId)
    ? partnerRosterIds.filter((id) => id !== rosterId)
    : [...partnerRosterIds, rosterId];
}

export interface FinderQuery {
  /** Managers to scan. Empty = every manager. */
  partnerRosterIds: number[];
  send: SlotPick;
  get: SlotPick;
  /** Package sizes allowed. Empty = any size. */
  shapes: FinderShape[];
}

export const EMPTY_QUERY: FinderQuery = {
  partnerRosterIds: [],
  send: ANY_PICK,
  get: ANY_PICK,
  shapes: [],
};

/* The sender's two thresholds: keep a deal only if your title odds rise at least
   this much, and theirs fall at most this much. The finder opens on every deal
   that helps you at all (minimum 0), with the sender's default limit on what the
   other side gives up, so the board is not led by robberies nobody would take. */
export const DEFAULT_MIN_GAIN = 0;
/* Zero: the other side gives up no title odds, which is "deals that lift both
   sides", the thing the product claims to find. The sheet can loosen it. */
export const DEFAULT_MAX_PARTNER_LOSS = 0;

/** The limits the board applies, kept behind a button. They reset with the ask. */
export interface FinderLimits {
  minGain: number;
  /** null = no limit. */
  maxLoss: number | null;
  /** Hide deals where the other side gives up far more roster value than title
   *  odds can register, which is every robbery of a team already out. */
  hideLopsided: boolean;
}
export const DEFAULT_LIMITS: FinderLimits = { minGain: DEFAULT_MIN_GAIN, maxLoss: DEFAULT_MAX_PARTNER_LOSS, hideLopsided: true };

export function limitsChanged(limits: FinderLimits) {
  return limits.minGain !== DEFAULT_LIMITS.minGain
    || limits.maxLoss !== DEFAULT_LIMITS.maxLoss
    || limits.hideLopsided !== DEFAULT_LIMITS.hideLopsided;
}

/** Under this many percentage points of title odds, a swing is sampling noise
 *  (measured: standard deviation near 1pp at 4,000 sims), so the board shows
 *  it as a tie rather than ranking it. */
export const NOISE_PP = 1;
export function withinNoise(youDelta: number) {
  return youDelta < NOISE_PP;
}

/**
 * Which asks the last background scan can answer by itself.
 *
 * The board scanned every manager and every shape with no pools, so a manager
 * or a shape is a lossless filter over it: the same packages a live scan with
 * that manager or that shape would have simmed. A position is NOT. The engine
 * builds its candidates from the pools it is given, so "their RBs" as a rule
 * sims running-back packages the open scan never tried; filtering the open
 * scan down to running backs leaves two or three. A named player is the same.
 * Both walk the league live, exactly the call the finder made before the
 * board existed.
 */
export function servedByBoard(query: FinderQuery) {
  return query.send.kind === 'any' && query.get.kind === 'any';
}

/** The board's deals that fit the ticket: every player sent from the send
 *  pool, every player received from the get pool, the partner picked, the
 *  shape picked. The same rule the live search applies, applied after. */
export function boardMatches(
  suggestion: Pick<TradeSuggestion, 'give' | 'get' | 'partnerRosterId'>,
  query: FinderQuery,
  players: Record<string, { position: string }>,
) {
  if (query.partnerRosterIds.length && !query.partnerRosterIds.includes(suggestion.partnerRosterId)) return false;
  if (!matchesShapes(suggestion, query.shapes)) return false;
  const fits = (assets: { id: string }[], pick: SlotPick) => {
    if (pick.kind === 'position') return assets.every((asset) => pick.positions.includes(players[asset.id]?.position as FinderPosition));
    if (pick.kind === 'player') return assets.every((asset) => pick.ids.includes(asset.id));
    return true;
  };
  return fits(suggestion.give, query.send) && fits(suggestion.get, query.get);
}

export function isEmptyQuery(query: FinderQuery) {
  return query.partnerRosterIds.length === 0
    && query.send.kind === 'any'
    && query.get.kind === 'any'
    && query.shapes.length === 0;
}

/**
 * Every blank filled with one exact player is not a search, it is a trade.
 * The finder hands that to the builder and prices it rather than scanning.
 */
export function isExactTrade(query: FinderQuery) {
  return query.partnerRosterIds.length === 1
    && query.send.kind === 'player' && query.send.ids.length === 1
    && query.get.kind === 'player' && query.get.ids.length === 1
    && query.shapes.length === 1 && query.shapes[0] === '1-1';
}

/**
 * The managers a ticket scans, in roster order. A get-player pool narrows it to
 * the managers who own one of those players (nobody else can deliver them).
 */
export function partnersToScan(query: FinderQuery, teams: ApiTeam[]): number[] {
  const wanted = query.get.kind === 'player' ? query.get.ids : null;
  return teams
    .filter((team) => !team.isUser)
    .filter((team) => query.partnerRosterIds.length === 0 || query.partnerRosterIds.includes(team.rosterId))
    .filter((team) => !wanted || team.players.some((id) => wanted.includes(id)))
    .map((team) => team.rosterId);
}

export interface FinderRules {
  giveAllow: string[];
  getAllow: string[];
  givePositions: FinderPosition[];
  getPositions: FinderPosition[];
}

/** The pools as the sender's rules (empty array = no limit on that pool). */
export function queryToRules(query: FinderQuery): FinderRules {
  return {
    giveAllow: query.send.kind === 'player' ? query.send.ids : [],
    getAllow: query.get.kind === 'player' ? query.get.ids : [],
    givePositions: query.send.kind === 'position' ? query.send.positions : [],
    getPositions: query.get.kind === 'position' ? query.get.positions : [],
  };
}

export function queryToShapes(query: FinderQuery) {
  return query.shapes
    .map((shape) => shapeSizes(shape))
    .filter((sizes): sizes is { give: number; get: number } => sizes != null);
}

/**
 * One scan request per manager PER SHAPE; the client walks them one at a time.
 *
 * A shape is searched by itself so its deals never depend on which other shapes
 * were picked: adding a shape can only add deals, never take one away. (Searched
 * together, the shapes shared one budget and "Any" found fewer deals than picking
 * three shapes did.) No shape picked = every shape on the ticket.
 */
export function queryToRequests(query: FinderQuery, teams: ApiTeam[]) {
  const rules = queryToRules(query);
  const shapes = query.shapes.length ? orderedShapes(query.shapes) : FINDER_SHAPES.map((entry) => entry.id);
  return partnersToScan(query, teams).flatMap((partnerRosterId) =>
    shapes.map((shape) => ({
      partnerRosterId,
      rules,
      shape,
      shapes: [shapeSizes(shape)].filter((sizes): sizes is { give: number; get: number } => sizes != null),
    })));
}

/**
 * Keep the ticket answerable: a send pool only holds your players, a get pool
 * only players an opponent owns, and when managers are picked, only players on
 * THEIR rosters. Anything else is dropped rather than asked for.
 */
export function reconcileQuery(query: FinderQuery, teams: ApiTeam[]): FinderQuery {
  const user = teams.find((team) => team.isUser) ?? null;
  const opponents = teams.filter((team) => !team.isUser);
  const partnerRosterIds = query.partnerRosterIds.filter((id) => opponents.some((team) => team.rosterId === id));
  const pool = partnerRosterIds.length ? opponents.filter((team) => partnerRosterIds.includes(team.rosterId)) : opponents;
  const send = query.send.kind === 'player'
    ? normalizePick({ kind: 'player', ids: query.send.ids.filter((id) => user?.players.includes(id)) })
    : normalizePick(query.send);
  const get = query.get.kind === 'player'
    ? normalizePick({ kind: 'player', ids: query.get.ids.filter((id) => pool.some((team) => team.players.includes(id))) })
    : normalizePick(query.get);
  return { partnerRosterIds, send, get, shapes: orderedShapes(query.shapes) };
}

export function suggestionSizes(suggestion: Pick<TradeSuggestion, 'give' | 'get'>) {
  return { give: suggestion.give.length, get: suggestion.get.length };
}

export function matchesShapes(suggestion: Pick<TradeSuggestion, 'give' | 'get'>, shapes: FinderShape[]) {
  if (shapes.length === 0) return true;
  return shapes.some((shape) => {
    const sizes = shapeSizes(shape);
    return sizes != null && suggestion.give.length === sizes.give && suggestion.get.length === sizes.get;
  });
}

/**
 * The sender's keep rule: your title odds rise (by at least `minGain` points)
 * and the partner's fall by at most `maxPartnerLoss` points (null = no limit).
 */
export function passesLimits(
  suggestion: Pick<TradeSuggestion, 'youDelta' | 'partnerDelta'>,
  minGain: number,
  maxPartnerLoss: number | null,
) {
  if (!(suggestion.youDelta > 0) || suggestion.youDelta < minGain) return false;
  return maxPartnerLoss == null || suggestion.partnerDelta >= -maxPartnerLoss;
}

/** Ranked the way the sender ranks: your title gain, biggest first. */
export function rankDeals<T extends { suggestion: Pick<TradeSuggestion, 'youDelta' | 'partnerDelta'> }>(entries: T[]): T[] {
  return [...entries].sort((a, b) =>
    b.suggestion.youDelta - a.suggestion.youDelta || b.suggestion.partnerDelta - a.suggestion.partnerDelta);
}

export function sizesLabel(sizes: { give: number; get: number }) {
  return `${sizes.give} for ${sizes.get}`;
}

/**
 * What the results page leads with. A leg pinned to ONE player is the header,
 * said once; anything wider varies row to row.
 */
export type FinderLayout = 'get-player' | 'send-player' | 'both-players' | 'open';

export function pinnedPlayer(pick: SlotPick): string | null {
  return pick.kind === 'player' && pick.ids.length === 1 ? pick.ids[0] : null;
}

export function finderLayout(query: FinderQuery): FinderLayout {
  const get = pinnedPlayer(query.get);
  const send = pinnedPlayer(query.send);
  if (get && send) return 'both-players';
  if (get) return 'get-player';
  if (send) return 'send-player';
  return 'open';
}

export interface QueryNames {
  partners?: string[];
  sendPlayers?: string[];
  getPlayers?: string[];
}

function listWords(words: string[], limit = 2) {
  if (words.length <= limit) return words.join(' or ');
  return `${words.slice(0, limit).join(', ')} or ${words.length - limit} more`;
}

export function pickWords(pick: SlotPick, names: string[] | undefined) {
  if (pick.kind === 'player') {
    return names?.length ? listWords(names) : `${pick.ids.length} ${pick.ids.length === 1 ? 'player' : 'players'}`;
  }
  if (pick.kind === 'position') return pick.positions.length === 1 ? `a ${pick.positions[0]}` : pick.positions.join(' or ');
  return 'anything';
}

export function partnersWords(query: FinderQuery, names: string[] | undefined) {
  if (query.partnerRosterIds.length === 0) return 'anyone';
  if (names?.length) return listWords(names);
  return `${query.partnerRosterIds.length} ${query.partnerRosterIds.length === 1 ? 'manager' : 'managers'}`;
}

export function shapesWords(shapes: FinderShape[]) {
  if (shapes.length === 0) return 'any shape';
  return shapes.map((shape) => FINDER_SHAPES.find((entry) => entry.id === shape)?.label ?? shape).join(' or ');
}

/** The ask in one sentence, for the results eyebrow and the empty state. */
export function describeQuery(query: FinderQuery, names: QueryNames = {}) {
  const shape = query.shapes.length ? `, ${shapesWords(query.shapes)}` : '';
  return `With ${partnersWords(query, names.partners)}, send ${pickWords(query.send, names.sendPlayers)}, get ${pickWords(query.get, names.getPlayers)}${shape}`;
}

/* ── What a player is worth from here ──────────────────────────────────────

   The picker used to show pricing's per-player mean, which is the projection
   for the CURRENT week and is replaced by the real score the moment a game
   goes final. From Sunday night until the week rolls over that is a list of
   box scores, sorted by them, and the starting points were derived from it:
   one bad Sunday made a position look like the weakest slot on the roster.

   A trade is a rest-of-season decision, so the number is one too: projected
   fantasy points per game over the games still to come, from the same sheet
   the engine prices with, plus where that ranks at the position. */

export type ValueBasis = 'ros' | 'week';

/** A value per player id. Pricing's playerMeans fits; so does the outlook. */
export type PlayerValues = Record<string, { mean: number }>;

export interface BoardRowLike {
  playerId: string;
  position: string;
  mean: number;
  /** Rest-of-season points as the board serves it; null when unknown. */
  seasonTotal: number | null;
  weekly: Record<string, number>;
}

export interface PlayerOutlook {
  /** Projected fantasy points per game over the games still to come. */
  perGame: number;
  /** Rank at the position by that figure, across the whole board. 1 is best. */
  positionRank: number;
  position: string;
}

/**
 * Per game over the weeks left.
 *
 * A bye is a week with no points, so it is not a game and does not drag the
 * average down. Whether the current week still counts depends on whether the
 * player's game is final, which the board already knows and bakes into its
 * rest-of-season total: if that total matches the weeks after this one, this
 * week has been played and is left out; otherwise it is still to come.
 * With no usable weeks the sheet's own per-game mean stands in.
 */
export function restOfSeasonPerGame(row: BoardRowLike, week: number | null | undefined): number {
  const current = week ?? 1;
  const entries = Object.entries(row.weekly ?? {})
    .map(([key, points]) => ({ week: Number(key), points: Number(points) }))
    .filter((entry) => Number.isFinite(entry.week) && Number.isFinite(entry.points));
  const after = entries.filter((entry) => entry.week > current && entry.points > 0);
  const thisWeek = entries.find((entry) => entry.week === current && entry.points > 0) ?? null;
  const sum = (list: { points: number }[]) => list.reduce((total, entry) => total + entry.points, 0);

  let games = after;
  if (thisWeek) {
    const withThisWeek = [...after, thisWeek];
    const total = row.seasonTotal;
    const played = total != null
      && Math.abs(total - sum(after)) < Math.abs(total - sum(withThisWeek));
    if (!played) games = withThisWeek;
  }
  if (games.length === 0) return row.mean;
  return sum(games) / games.length;
}

export function buildOutlooks(
  rows: readonly BoardRowLike[],
  week: number | null | undefined,
): Map<string, PlayerOutlook> {
  const scored = rows.map((row) => ({ row, perGame: restOfSeasonPerGame(row, week) }));
  const out = new Map<string, PlayerOutlook>();
  const byPosition = new Map<string, typeof scored>();
  for (const entry of scored) {
    const list = byPosition.get(entry.row.position) ?? [];
    list.push(entry);
    byPosition.set(entry.row.position, list);
  }
  for (const [position, list] of byPosition) {
    list
      .sort((a, b) => b.perGame - a.perGame)
      .forEach((entry, index) => {
        if (out.has(entry.row.playerId)) return;
        out.set(entry.row.playerId, { perGame: entry.perGame, positionRank: index + 1, position });
      });
  }
  return out;
}

/** The outlook in the shape the roster reads take, for players it covers. */
export function outlookValues(outlooks: ReadonlyMap<string, PlayerOutlook>): PlayerValues {
  const values: PlayerValues = {};
  for (const [id, outlook] of outlooks) values[id] = { mean: outlook.perGame };
  return values;
}

/* ── Starting points ────────────────────────────────────────────────────── */

export interface StartingPoint {
  id: string;
  title: string;
  detail: string;
  /** What the tile stands for: a position glyph or a manager's initials. */
  badge: { kind: 'position'; position: FinderPosition } | { kind: 'team'; rosterId: number };
  query: Partial<FinderQuery>;
}

interface PositionRead {
  position: FinderPosition;
  /** Dedicated starting slots at this position. */
  slots: number;
  /** Rostered at this position. */
  rostered: number;
  /** Projected mean of the weakest dedicated starter, 0 when a slot is empty. */
  weakestStarter: number;
}

function readTeam(
  team: ApiTeam,
  players: Record<string, ApiCatalogPlayer>,
  means: PlayerValues,
  slotsByPosition: Record<FinderPosition, number>,
): Record<FinderPosition, PositionRead> {
  const out = {} as Record<FinderPosition, PositionRead>;
  for (const position of FINDER_POSITIONS) {
    const rostered = team.players
      .filter((id) => players[id]?.position === position)
      .map((id) => means[id]?.mean ?? 0)
      .sort((a, b) => b - a);
    const slots = slotsByPosition[position];
    out[position] = {
      position,
      slots,
      rostered: rostered.length,
      weakestStarter: slots > 0 ? (rostered[slots - 1] ?? 0) : 0,
    };
  }
  return out;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function slotOrdinal(position: FinderPosition, slots: number) {
  return slots > 1 ? `${position}${slots}` : position;
}

/**
 * Three suggested fills, from roster facts rather than a fixed list, so the
 * row changes with the roster and never grows into a menu:
 *   1. the starting slot furthest under the league's, to upgrade;
 *   2. the position with the most bench bodies, to sell from;
 *   3. the manager whose surplus and shortage mirror yours.
 * Returns fewer when the facts do not support one, and nothing at all
 * without per-player means (pricing not yet run).
 */
export function deriveStartingPoints({
  teams,
  players,
  playerMeans,
  rosterPositions,
  basis = 'week',
}: {
  teams: ApiTeam[];
  players: Record<string, ApiCatalogPlayer>;
  playerMeans: PlayerValues | null | undefined;
  rosterPositions: string[] | null | undefined;
  /** What the values are: rest of season per game, or this week alone. The
   *  sentence under each point says which, so it never claims a season read
   *  off one week's number. */
  basis?: ValueBasis;
}): StartingPoint[] {
  const means = playerMeans ?? null;
  const user = teams.find((team) => team.isUser) ?? null;
  if (!means || !user || !rosterPositions?.length) return [];

  const slotsByPosition = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<FinderPosition, number>;
  for (const slot of rosterPositions) if (isFinderPosition(slot)) slotsByPosition[slot] += 1;

  const reads = new Map(teams.map((team) => [team.rosterId, readTeam(team, players, means, slotsByPosition)]));
  const mine = reads.get(user.rosterId)!;
  const opponents = teams.filter((team) => !team.isUser);

  const leagueWeakest = {} as Record<FinderPosition, number>;
  for (const position of FINDER_POSITIONS) {
    leagueWeakest[position] = median(teams.map((team) => reads.get(team.rosterId)![position].weakestStarter));
  }

  const points: StartingPoint[] = [];

  /* 1. Upgrade: the slot that trails the league's by the most. */
  const deficit = FINDER_POSITIONS
    .filter((position) => mine[position].slots > 0)
    .map((position) => ({ position, gap: leagueWeakest[position] - mine[position].weakestStarter }))
    .sort((a, b) => b.gap - a.gap)[0] ?? null;
  const upgrade = deficit && deficit.gap >= 0.5 ? deficit.position : null;
  if (upgrade) {
    const read = mine[upgrade];
    points.push({
      id: `upgrade-${upgrade}`,
      title: `Upgrade ${upgrade}`,
      detail: basis === 'ros'
        ? `Your ${slotOrdinal(upgrade, read.slots)} projects ${read.weakestStarter.toFixed(1)} a game from here on. The league's projects ${leagueWeakest[upgrade].toFixed(1)}.`
        : `Your ${slotOrdinal(upgrade, read.slots)} projects ${read.weakestStarter.toFixed(1)} this week. The league's projects ${leagueWeakest[upgrade].toFixed(1)}.`,
      badge: { kind: 'position', position: upgrade },
      query: { get: { kind: 'position', positions: [upgrade] } },
    });
  }

  /* 2. Sell: the position with the most bodies past its starting slots. */
  const surplus = FINDER_POSITIONS
    .filter((position) => position !== upgrade)
    .map((position) => ({ position, bench: mine[position].rostered - mine[position].slots }))
    .sort((a, b) => b.bench - a.bench)[0] ?? null;
  const sell = surplus && surplus.bench >= 2 ? surplus.position : null;
  if (sell) {
    const read = mine[sell];
    points.push({
      id: `sell-${sell}`,
      title: `Sell from ${sell} depth`,
      detail: `You carry ${read.rostered}, ${read.rostered - read.slots} ride the bench.`,
      badge: { kind: 'position', position: sell },
      query: { send: { kind: 'position', positions: [sell] } },
    });
  }

  /* 3. Mirror: a manager strong where you are thin and thin where you are
        deep. Needs both halves to be a mirror; otherwise nobody is named. */
  if (upgrade && sell) {
    const mirror = opponents
      .map((team) => {
        const theirs = reads.get(team.rosterId)!;
        const gives = theirs[upgrade].weakestStarter - mine[upgrade].weakestStarter;
        const wants = mine[sell].weakestStarter - theirs[sell].weakestStarter;
        return { team, fit: Math.min(gives, wants), sum: gives + wants };
      })
      .filter((entry) => entry.fit > 0)
      .sort((a, b) => b.sum - a.sum)[0] ?? null;
    if (mirror) {
      points.push({
        id: `mirror-${mirror.team.rosterId}`,
        title: `Deal with ${mirror.team.teamName}`,
        detail: `Deep at ${upgrade}, thin at ${sell}. Your mirror.`,
        badge: { kind: 'team', rosterId: mirror.team.rosterId },
        query: {
          partnerRosterIds: [mirror.team.rosterId],
          send: { kind: 'position', positions: [sell] },
          get: { kind: 'position', positions: [upgrade] },
        },
      });
    }
  }

  return points;
}

/** The pickers' subline under each position tile. */
export function positionSublines({
  team,
  players,
  playerMeans,
  rosterPositions,
}: {
  team: ApiTeam;
  players: Record<string, ApiCatalogPlayer>;
  playerMeans: PlayerValues | null | undefined;
  rosterPositions: string[] | null | undefined;
}): Record<FinderPosition, { starter: string | null; rostered: number }> {
  const slotsByPosition = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<FinderPosition, number>;
  for (const slot of rosterPositions ?? []) if (isFinderPosition(slot)) slotsByPosition[slot] += 1;
  const read = playerMeans ? readTeam(team, players, playerMeans, slotsByPosition) : null;
  const out = {} as Record<FinderPosition, { starter: string | null; rostered: number }>;
  for (const position of FINDER_POSITIONS) {
    const rostered = team.players.filter((id) => players[id]?.position === position).length;
    const entry = read?.[position];
    out[position] = {
      starter: entry && entry.slots > 0 ? `${slotOrdinal(position, entry.slots)} ${entry.weakestStarter.toFixed(1)}` : null,
      rostered,
    };
  }
  return out;
}

/* ── Reading a deal ──────────────────────────────────────────────────────── */

/** The player a deal is about: the incoming player worth the most from here. */
export function headlinePlayer(suggestion: Pick<TradeSuggestion, 'get'>, values: PlayerValues | null): string {
  const best = [...suggestion.get].sort((a, b) => (values?.[b.id]?.mean ?? 0) - (values?.[a.id]?.mean ?? 0))[0];
  return best?.id ?? '';
}

/** Players on one side, the most valuable first. */
export function orderAssets<T extends { id: string }>(assets: T[], values: PlayerValues | null): T[] {
  return [...assets].sort((a, b) => (values?.[b.id]?.mean ?? 0) - (values?.[a.id]?.mean ?? 0));
}

export interface DealGroup<T> {
  headlineId: string;
  best: T;
  others: T[];
}

/**
 * One lane per player you would land. The best package for him leads; the
 * other ways to get him fold under it. Groups rank by their best deal.
 */
export function groupDeals<T extends { suggestion: Pick<TradeSuggestion, 'get' | 'youDelta' | 'partnerDelta'> }>(
  entries: T[],
  values: PlayerValues | null,
): DealGroup<T>[] {
  const ranked = rankDeals(entries);
  const groups = new Map<string, DealGroup<T>>();
  for (const entry of ranked) {
    const id = headlinePlayer(entry.suggestion, values);
    const group = groups.get(id);
    if (group) group.others.push(entry);
    else groups.set(id, { headlineId: id, best: entry, others: [] });
  }
  return [...groups.values()];
}

export type Standing = 'contender' | 'bubble' | 'out';

/** What a manager is playing for, from his playoff odds. */
export function standingOf(playoffProb: number | null | undefined): Standing {
  if (playoffProb == null) return 'bubble';
  if (playoffProb >= 60) return 'contender';
  if (playoffProb >= 15) return 'bubble';
  return 'out';
}

/** Roster value the OTHER side gains per game: what they receive minus what
 *  they send, in rest-of-season points per game. Negative = they give up value. */
export function partnerValueDelta(suggestion: Pick<TradeSuggestion, 'give' | 'get'>, values: PlayerValues | null) {
  const sum = (assets: { id: string }[]) => assets.reduce((total, asset) => total + (values?.[asset.id]?.mean ?? 0), 0);
  return sum(suggestion.give) - sum(suggestion.get);
}

/** The value gap at which a deal stops being a trade and becomes a favour.
 *  Four points a game is roughly a starter for a bench piece. */
export const LOPSIDED_PPG = 4;

/**
 * A deal title odds cannot see. A team already out of the race has no title
 * odds to lose, so "their title falls at most 0" is satisfied by handing over
 * a starter for a bench piece. Roster value catches it when title odds do not.
 */
export function isLopsided(valueDelta: number) {
  return valueDelta <= -LOPSIDED_PPG;
}

/**
 * A lopsided deal is a no; otherwise the acceptance model's word, read from
 * the one band map so the vocabulary cannot drift (a lopsided deal borrows
 * the band a 35% read falls in rather than naming it here).
 */
export function acceptanceWord(lopsided: boolean, acceptance: number | null): { word: string; tone: AcceptanceLingoTone } {
  const band = getAcceptanceLingo(lopsided ? 35 : acceptance);
  if (!band) return { word: 'Unread', tone: 'neutral' };
  return { word: band.label, tone: band.tone };
}

/**
 * What sending a player does to your lineup: the slot he holds at his
 * position by rest-of-season value, and who would start instead.
 */
export function sendConsequence(
  playerId: string,
  team: Pick<ApiTeam, 'players'>,
  players: Record<string, ApiCatalogPlayer>,
  values: PlayerValues | null,
  rosterPositions: string[] | null | undefined,
): { slot: string | null; replacement: { id: string; name: string; perGame: number } | null } {
  const position = players[playerId]?.position;
  if (!isFinderPosition(position)) return { slot: null, replacement: null };
  const slots = (rosterPositions ?? []).filter((entry) => entry === position).length;
  const ranked = team.players
    .filter((id) => players[id]?.position === position)
    .sort((a, b) => (values?.[b]?.mean ?? 0) - (values?.[a]?.mean ?? 0));
  const rank = ranked.indexOf(playerId) + 1;
  if (rank === 0) return { slot: null, replacement: null };
  const starter = slots > 0 && rank <= slots;
  const next = starter ? ranked[slots] ?? null : null;
  return {
    slot: starter ? `${position}${rank}` : 'bench',
    replacement: next ? { id: next, name: players[next]?.name ?? next, perGame: values?.[next]?.mean ?? 0 } : null,
  };
}
