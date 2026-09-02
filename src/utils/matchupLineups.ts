import type { Player, SlotLabel } from '../types/player';

/**
 * Two starting lineups, paired slot by slot, for the board's detail view.
 *
 * Kept as a leaf module - types only, no app-graph imports - so the node
 * tests can load it directly the way they load matchupSides.
 */

/** A player id the provider uses to mean "this slot is empty". */
const EMPTY_SLOT_IDS = new Set(['', '0', '-1']);

export interface CatalogEntry {
  name: string;
  team: string | null;
  position: string | null;
  injuryStatus: string | null;
}

export interface MeanEntry {
  mean: number;
  unpriced?: boolean;
}

export interface LineupSlotEntry {
  slot: SlotLabel;
  playerId: string | null;
  name: string;
  position: string | null;
  team: string | null;
  injuryStatus: string | null;
  /**
   * The engine's week mean for this player, or null when nothing priced them.
   *
   * Null rather than zero: an empty slot and a player projected to score
   * nothing are different facts, and the board must not print the second one
   * when it only knows the first.
   */
  projection: number | null;
  /**
   * The full player record the shared row components render: headshot, team
   * logo, short name. Built by the caller, because assembling one means
   * knowing about the image proxy and this module is deliberately a leaf that
   * the node tests can import directly. Absent in those tests, which is fine:
   * nothing in the pairing logic reads it.
   */
  player?: Player;
}

export interface LineupPairRow {
  slot: SlotLabel;
  left: LineupSlotEntry | null;
  right: LineupSlotEntry | null;
  /**
   * Which side projects more in this slot. Null when they tie, or when
   * either side has no number - an edge over an unknown is not an edge.
   */
  edge: 'left' | 'right' | null;
}

export interface BuildLineupInput {
  /** Starter ids in slot order, exactly as the provider hands them back. */
  starters: readonly string[];
  /** The league's slot labels, in that same order. */
  labels: readonly SlotLabel[];
  players: Readonly<Record<string, CatalogEntry>>;
  /** Engine week means, keyed by player id. */
  means: Readonly<Record<string, MeanEntry>>;
  /** The provider's own points for this matchup, used only as a fallback. */
  fallback?: Readonly<Record<string, number>>;
  /** Builds the record the headshot components render. See LineupSlotEntry. */
  resolvePlayer?: (id: string) => Player;
}

/**
 * One side's starters, resolved against the catalog and the engine's means.
 *
 * Slot labels come from the league's roster positions by index, which is how
 * both providers align a starters array; a lineup longer than the label list
 * spills into FLEX rather than dropping players on the floor.
 */
export function buildLineup({
  starters,
  labels,
  players,
  means,
  fallback,
  resolvePlayer,
}: BuildLineupInput): LineupSlotEntry[] {
  return starters.map((id, index) => {
    const slot = labels[index] ?? 'FLEX';
    if (id == null || EMPTY_SLOT_IDS.has(id)) {
      return {
        slot,
        playerId: null,
        name: 'Empty',
        position: null,
        team: null,
        injuryStatus: null,
        projection: null,
      };
    }

    const entry = players[id];
    const mean = means[id]?.mean;
    const projection = mean ?? fallback?.[id] ?? null;

    return {
      slot,
      playerId: id,
      name: entry?.name ?? `Player ${id}`,
      position: entry?.position ?? null,
      team: entry?.team ?? null,
      injuryStatus: entry?.injuryStatus ?? null,
      projection: projection == null ? null : Number(projection.toFixed(1)),
      player: resolvePlayer?.(id),
    };
  });
}

/**
 * The two lineups zipped into rows, one row per slot.
 *
 * Leagues run the same roster positions for every team, so the two arrays
 * line up by index. When one side is short - a lineup left incomplete - the
 * row still renders with the other side in it rather than the pairing
 * silently truncating to the shorter team.
 */
export function pairLineups(
  left: readonly LineupSlotEntry[],
  right: readonly LineupSlotEntry[],
): LineupPairRow[] {
  const rows: LineupPairRow[] = [];
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? null;
    const r = right[index] ?? null;
    rows.push({
      slot: l?.slot ?? r?.slot ?? 'FLEX',
      left: l,
      right: r,
      edge: slotEdge(l, r),
    });
  }

  return rows;
}

function slotEdge(
  left: LineupSlotEntry | null,
  right: LineupSlotEntry | null,
): 'left' | 'right' | null {
  const l = left?.projection;
  const r = right?.projection;
  if (l == null || r == null) return null;
  if (l === r) return null;
  return l > r ? 'left' : 'right';
}
