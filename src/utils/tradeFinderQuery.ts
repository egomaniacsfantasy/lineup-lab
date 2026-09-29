import type { ApiCatalogPlayer, ApiTeam, LeaguePricing, TradeSuggestion } from '../services/leagueApi';

/**
 * The finder's ticket: one question with three blanks and a shape.
 *
 * "Get me an RB", "who wants my WR", "what does Bijan cost", "deal with
 * Hermes" are not different features. They are the same search with a
 * different blank pinned, and every one of them maps onto a parameter the
 * engine's finder already accepts. This module is the pure half of that: the
 * query shape, the request it becomes, how a result set is read back against
 * it, and the roster facts the starting points are built from. No React.
 */

export type FinderPosition = 'QB' | 'RB' | 'WR' | 'TE';
export const FINDER_POSITIONS: FinderPosition[] = ['QB', 'RB', 'WR', 'TE'];

export function isFinderPosition(value: string | null | undefined): value is FinderPosition {
  return value === 'QB' || value === 'RB' || value === 'WR' || value === 'TE';
}

export type SlotPick =
  | { kind: 'any' }
  | { kind: 'position'; position: FinderPosition }
  | { kind: 'player'; id: string };

export const ANY_PICK: SlotPick = { kind: 'any' };

export type FinderShape = 'any' | '1-1' | '2-1' | '1-2' | '2-2';

/** Read as "you send N for M": the first number is always yours. */
export const FINDER_SHAPES: { id: FinderShape; label: string; sizes: { give: number; get: number } | null }[] = [
  { id: 'any', label: 'Any', sizes: null },
  { id: '1-1', label: '1 for 1', sizes: { give: 1, get: 1 } },
  { id: '2-1', label: '2 for 1', sizes: { give: 2, get: 1 } },
  { id: '1-2', label: '1 for 2', sizes: { give: 1, get: 2 } },
  { id: '2-2', label: '2 for 2', sizes: { give: 2, get: 2 } },
];

export function shapeSizes(shape: FinderShape) {
  return FINDER_SHAPES.find((entry) => entry.id === shape)?.sizes ?? null;
}

export interface FinderQuery {
  partnerRosterId: number | null;
  send: SlotPick;
  get: SlotPick;
  shape: FinderShape;
}

export const EMPTY_QUERY: FinderQuery = {
  partnerRosterId: null,
  send: ANY_PICK,
  get: ANY_PICK,
  shape: 'any',
};

export const DEFAULT_ACCEPT_FLOOR = 40;

export function isEmptyQuery(query: FinderQuery) {
  return query.partnerRosterId == null
    && query.send.kind === 'any'
    && query.get.kind === 'any'
    && query.shape === 'any';
}

/**
 * Every blank filled with an exact player is not a search, it is a trade.
 * The finder hands that to the builder and prices it rather than scanning
 * for throw-ins nobody asked for.
 */
export function isExactTrade(query: FinderQuery) {
  return query.partnerRosterId != null
    && query.send.kind === 'player'
    && query.get.kind === 'player'
    && query.shape === '1-1';
}

export function queryToRequest(query: FinderQuery) {
  return {
    partnerRosterId: query.partnerRosterId,
    position: query.get.kind === 'position' ? query.get.position : null,
    givePosition: query.send.kind === 'position' ? query.send.position : null,
    givePlayerIds: query.send.kind === 'player' ? [query.send.id] : [],
    getPlayerIds: query.get.kind === 'player' ? [query.get.id] : [],
    shape: shapeSizes(query.shape),
  };
}

/**
 * A pinned get-player fixes the partner: only one manager owns him. Picking
 * him sets the partner, and changing the partner drops a get-player who is
 * not on that roster. This keeps the ticket from ever asking the engine for
 * Hermes Express's player from Apollo Archers.
 */
export function reconcileQuery(query: FinderQuery, teams: ApiTeam[]): FinderQuery {
  if (query.get.kind !== 'player') return query;
  const owner = teams.find((team) => !team.isUser && team.players.includes(query.get.kind === 'player' ? query.get.id : ''));
  if (!owner) return { ...query, get: ANY_PICK };
  if (query.partnerRosterId != null && query.partnerRosterId !== owner.rosterId) {
    return { ...query, get: ANY_PICK };
  }
  return { ...query, partnerRosterId: owner.rosterId };
}

export function suggestionSizes(suggestion: Pick<TradeSuggestion, 'give' | 'get'>) {
  return { give: suggestion.give.length, get: suggestion.get.length };
}

export function matchesShape(suggestion: Pick<TradeSuggestion, 'give' | 'get'>, shape: FinderShape) {
  const sizes = shapeSizes(shape);
  if (!sizes) return true;
  return suggestion.give.length === sizes.give && suggestion.get.length === sizes.get;
}

export function sizesLabel(sizes: { give: number; get: number }) {
  return `${sizes.give} for ${sizes.get}`;
}

/**
 * What the results page leads with. Whatever the ticket pinned is the
 * header, said once; whatever it left open is what varies row to row.
 */
export type FinderLayout = 'get-player' | 'send-player' | 'both-players' | 'open';

export function finderLayout(query: FinderQuery): FinderLayout {
  if (query.get.kind === 'player' && query.send.kind === 'player') return 'both-players';
  if (query.get.kind === 'player') return 'get-player';
  if (query.send.kind === 'player') return 'send-player';
  return 'open';
}

/** Ranked the way the finder scores: your title gain weighted by the chance
 *  they say yes. A steal nobody accepts sits under a fair deal that lands. */
export function finderScore(youDelta: number, acceptance: number) {
  return youDelta * (Math.max(0, Math.min(100, acceptance)) / 100);
}

export interface QueryNames {
  partner?: string | null;
  sendPlayer?: string | null;
  getPlayer?: string | null;
}

/** The ask in one sentence, for the results eyebrow and the empty state. */
export function describeQuery(query: FinderQuery, names: QueryNames = {}) {
  const partner = query.partnerRosterId != null ? (names.partner ?? 'that manager') : 'anyone';
  const send = query.send.kind === 'player'
    ? (names.sendPlayer ?? 'that player')
    : query.send.kind === 'position'
      ? `a ${query.send.position}`
      : 'anything';
  const get = query.get.kind === 'player'
    ? (names.getPlayer ?? 'that player')
    : query.get.kind === 'position'
      ? `a ${query.get.position}`
      : 'anything';
  const sizes = shapeSizes(query.shape);
  const shape = sizes ? `, ${sizesLabel(sizes)}` : '';
  return `With ${partner}, send ${send}, get ${get}${shape}`;
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
  means: NonNullable<LeaguePricing['playerMeans']>,
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
}: {
  teams: ApiTeam[];
  players: Record<string, ApiCatalogPlayer>;
  playerMeans: LeaguePricing['playerMeans'] | null | undefined;
  rosterPositions: string[] | null | undefined;
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
      detail: `Your ${slotOrdinal(upgrade, read.slots)} projects ${read.weakestStarter.toFixed(1)}. The league's projects ${leagueWeakest[upgrade].toFixed(1)}.`,
      badge: { kind: 'position', position: upgrade },
      query: { get: { kind: 'position', position: upgrade } },
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
      query: { send: { kind: 'position', position: sell } },
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
          partnerRosterId: mirror.team.rosterId,
          send: { kind: 'position', position: sell },
          get: { kind: 'position', position: upgrade },
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
  playerMeans: LeaguePricing['playerMeans'] | null | undefined;
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
