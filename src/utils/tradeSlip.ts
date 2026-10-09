/*
 * The slip: what the builder can say about a trade before the engine has
 * priced it. Everything here is read straight off the lineup the provider
 * serves and the per-game sheet the finder already uses, so nothing on the
 * slip is a projection the engine did not make. The sim still decides the
 * price; this is the weight of what moves and where it lands in a lineup.
 */

import type { ApiCatalogPlayer, ApiTeam } from '../services/leagueApi';
import { isFinderPosition, type PlayerOutlook, type PlayerValues } from './tradeFinderQuery.ts';

/**
 * The starting slots in lineup order, named the way a manager says them:
 * QB, RB1, RB2, WR1, WR2, TE, FLEX, K, DEF. A position with one slot keeps
 * its bare name. Bench, reserve and taxi slots are not starting slots.
 */
export function slotLabels(rosterPositions: readonly string[] | null | undefined): string[] {
  const positions = (rosterPositions ?? []).filter((slot) => !isBenchSlot(slot));
  const total = new Map<string, number>();
  for (const slot of positions) total.set(slot, (total.get(slot) ?? 0) + 1);
  const seen = new Map<string, number>();
  return positions.map((slot) => {
    const n = (seen.get(slot) ?? 0) + 1;
    seen.set(slot, n);
    return (total.get(slot) ?? 0) > 1 ? `${slot}${n}` : slot;
  });
}

function isBenchSlot(slot: string) {
  return slot === 'BN' || slot === 'IR' || slot === 'TAXI';
}

/**
 * Which slot each starter holds, read off the lineup the provider serves:
 * the nth starter sits in the nth starting slot. Nobody else is a starter.
 */
export function lineupSlots(
  team: Pick<ApiTeam, 'starters'>,
  rosterPositions: readonly string[] | null | undefined,
): Map<string, string> {
  const labels = slotLabels(rosterPositions);
  const out = new Map<string, string>();
  (team.starters ?? []).forEach((id, index) => {
    if (!id || id === '0') return;
    const label = labels[index] ?? null;
    if (label) out.set(id, label);
  });
  return out;
}

/** The slot a rostered player holds, or where he sits if he does not start. */
export function slotOf(
  id: string,
  slots: ReadonlyMap<string, string>,
  team: Pick<ApiTeam, 'reserve' | 'taxi'>,
): string {
  const slot = slots.get(id);
  if (slot) return slot;
  if ((team.reserve ?? []).includes(id)) return 'IR';
  if ((team.taxi ?? []).includes(id)) return 'Taxi';
  return 'Bench';
}

/**
 * The starter a manager is thinnest at: of the starters at a position the
 * finder prices (QB, RB, WR, TE), the one ranked lowest at his position by
 * rest-of-season per game. Ties go to the lower per-game figure.
 */
export function weakestStarter(
  team: Pick<ApiTeam, 'starters'>,
  players: Record<string, ApiCatalogPlayer>,
  outlooks: ReadonlyMap<string, PlayerOutlook> | null,
  slots: ReadonlyMap<string, string>,
): { id: string; slot: string; perGame: number; rank: number; position: string } | null {
  if (!outlooks) return null;
  let worst: { id: string; slot: string; perGame: number; rank: number; position: string } | null = null;
  for (const id of team.starters ?? []) {
    const position = players[id]?.position;
    const outlook = outlooks.get(id);
    const slot = slots.get(id);
    if (!isFinderPosition(position) || !outlook || !slot) continue;
    const candidate = { id, slot, perGame: outlook.perGame, rank: outlook.positionRank, position };
    if (
      !worst
      || candidate.rank > worst.rank
      || (candidate.rank === worst.rank && candidate.perGame < worst.perGame)
    ) {
      worst = candidate;
    }
  }
  return worst;
}

export interface NamedPlayer {
  id: string;
  name: string;
  perGame: number;
}

export interface SendRead {
  /** The slot he holds in the lineup his manager set, or 'bench'. */
  slot: string;
  /** The best player on the bench who could take his slot, by value. */
  replacement: NamedPlayer | null;
}

const FLEX_POSITIONS = ['RB', 'WR', 'TE'];

function valueOf(values: PlayerValues | null, id: string) {
  return values?.[id]?.mean ?? 0;
}

function named(id: string, players: Record<string, ApiCatalogPlayer>, values: PlayerValues | null): NamedPlayer {
  return { id, name: players[id]?.name ?? id, perGame: valueOf(values, id) };
}

/**
 * What sending a player does to your lineup: the slot he holds in the
 * lineup you set, and who on your bench would take it. The slot comes from
 * the provider, not from a ranking, so it agrees with the roster list. The
 * replacement is the best bench player by rest-of-season value who could
 * fill it (anyone flex-eligible for a flex slot), skipping anyone else in
 * the deal and anyone on reserve.
 */
export function sendRead(
  playerId: string,
  team: Pick<ApiTeam, 'players' | 'reserve' | 'taxi'>,
  slots: ReadonlyMap<string, string>,
  giveIds: readonly string[],
  players: Record<string, ApiCatalogPlayer>,
  values: PlayerValues | null,
): SendRead {
  const slot = slots.get(playerId);
  if (!slot) return { slot: 'bench', replacement: null };
  const position = players[playerId]?.position;
  const eligible = slot.startsWith('FLEX') || slot.startsWith('SUPER')
    ? FLEX_POSITIONS
    : position ? [position] : [];
  const gone = new Set(giveIds);
  const unavailable = new Set([...(team.reserve ?? []), ...(team.taxi ?? [])]);
  const bench = team.players
    .filter((id) => !slots.has(id) && !gone.has(id) && !unavailable.has(id))
    .filter((id) => eligible.includes(players[id]?.position ?? ''))
    .sort((a, b) => valueOf(values, b) - valueOf(values, a));
  return { slot, replacement: bench[0] ? named(bench[0], players, values) : null };
}

export interface GetRead {
  /** 'starts' when he takes a starting slot, 'bench' when he does not, null when the slip cannot say. */
  kind: 'starts' | 'bench' | null;
  /** The slot he takes: one a sent player vacated, or the one he wins from a starter. */
  slot: string | null;
  /** The starter he pushes to the bench, when he wins a slot rather than fills one. */
  displaced: NamedPlayer | null;
  /** The starter he sits behind, when he does not start. */
  behind: NamedPlayer | null;
}

/**
 * Where an incoming player lands in your lineup. He fills a slot at his
 * position that a sent player vacates, if there is one; failing that he
 * takes the slot of your weakest starter there if he is worth more per game
 * than that starter; otherwise he is bench depth behind that starter. Two
 * incoming players at the same position are seated best first, so the
 * second one sees the slots the first one took.
 */
export function getRead(
  playerId: string,
  you: Pick<ApiTeam, 'players'>,
  slots: ReadonlyMap<string, string>,
  giveIds: readonly string[],
  getIds: readonly string[],
  players: Record<string, ApiCatalogPlayer>,
  values: PlayerValues | null,
): GetRead {
  const position = players[playerId]?.position;
  if (!isFinderPosition(position)) return { kind: null, slot: null, displaced: null, behind: null };
  const at = (id: string) => players[id]?.position === position;
  const gone = new Set(giveIds);

  /* Slots at his position that leave with the players you send. */
  const vacated = giveIds
    .filter((id) => at(id) && slots.get(id)?.startsWith(position))
    .map((id) => slots.get(id) as string)
    .sort();
  /* Starters you keep at his position, weakest first. */
  const kept = you.players
    .filter((id) => at(id) && !gone.has(id) && slots.get(id)?.startsWith(position))
    .sort((a, b) => valueOf(values, a) - valueOf(values, b));
  /* Everyone coming in at his position, best first; his place in that line. */
  const incoming = [...new Set(getIds)]
    .filter(at)
    .sort((a, b) => valueOf(values, b) - valueOf(values, a));
  const place = incoming.indexOf(playerId);
  if (place === -1) return { kind: null, slot: null, displaced: null, behind: null };

  if (place < vacated.length) {
    return { kind: 'starts', slot: vacated[place], displaced: null, behind: null };
  }
  const target = kept[place - vacated.length];
  if (target && valueOf(values, playerId) > valueOf(values, target)) {
    return {
      kind: 'starts',
      slot: slots.get(target) ?? null,
      displaced: named(target, players, values),
      behind: null,
    };
  }
  const wall = target ?? kept[kept.length - 1];
  return {
    kind: 'bench',
    slot: null,
    displaced: null,
    behind: wall ? named(wall, players, values) : null,
  };
}

/** One line on what an incoming player does to your lineup. */
export function getWords(read: GetRead): string | null {
  if (!read.kind) return null;
  if (read.kind === 'bench') {
    return read.behind
      ? `Bench, behind ${read.behind.name} (${read.behind.perGame.toFixed(1)}).`
      : 'Bench.';
  }
  const starts = read.slot ? `Starts at ${read.slot}.` : 'Starts.';
  return read.displaced ? `${starts} ${read.displaced.name} to the bench.` : starts;
}

/** One line on what sending a player does to your lineup. */
export function sendWords(read: SendRead): string | null {
  if (read.slot === 'bench') return 'From your bench.';
  return read.replacement
    ? `Your ${read.slot}. ${read.replacement.name} starts instead (${read.replacement.perGame.toFixed(1)}).`
    : `Your ${read.slot}, with nobody on the bench to take it.`;
}

/** Per game across a side of the deal, for the players the sheet covers. */
export function sidePerGame(ids: readonly string[], values: PlayerValues | null): number | null {
  if (!values) return null;
  const known = ids.filter((id) => values[id] != null);
  if (known.length === 0) return null;
  return known.reduce((total, id) => total + valueOf(values, id), 0);
}

/**
 * The weight of the deal in one line, before any price: who sends more per
 * game. Under a twentieth of a point a game is even.
 */
export function netWords(inPerGame: number | null, outPerGame: number | null): string | null {
  if (inPerGame == null || outPerGame == null) return null;
  const diff = outPerGame - inPerGame;
  if (Math.abs(diff) < 0.05) return 'Even per game.';
  return diff > 0
    ? `You send ${diff.toFixed(1)} more per game.`
    : `You get ${(-diff).toFixed(1)} more per game.`;
}
