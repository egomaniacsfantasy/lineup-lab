/**
 * What is allowed to appear under the heading "Best deals in the league".
 *
 * The board had no filter at all. It sorted the league's suggestions by
 * fairness and printed the top fifteen, which means the fifteen least-bad
 * ideas get that heading however bad they are — and in a league where the
 * engine only finds lopsided ideas, the most lopsided one is still labelled
 * a best deal. Sorting is not filtering.
 *
 * Nothing here prices, ranks or re-orders anything. Every judgment below is
 * made from numbers the engine already produced, and the only action taken is
 * to hide a row. A deal this rejects is still a deal the engine found; it is
 * just not one this heading can honestly carry.
 */

export interface DealShape {
  give: readonly { id: string }[];
  get: readonly { id: string }[];
  /** Championship-probability change for each side, in percentage points. */
  youDelta?: number | null;
  partnerDelta?: number | null;
}

export type DealRejection =
  | { reason: 'qb-for-skill'; detail: string }
  | { reason: 'lopsided'; detail: string };

/**
 * Below this much combined championship movement, nobody is being fleeced and
 * the split does not matter. Prevents a 0.10 against 0.02 deal — noise on both
 * sides — from being thrown out for being "unbalanced".
 */
const MATERIAL_TOTAL_PP = 0.5;

/**
 * How much of a deal's total gain one side may take before it stops being a
 * deal and starts being a fleecing.
 *
 * Expressed as a share rather than a fixed number of percentage points on
 * purpose: how far a title price moves depends on how tight the league is, so
 * a threshold in points would be strict in one league and useless in another.
 * 0.75 means one side is taking three times what the other does.
 */
const MAX_ONE_SIDED_SHARE = 0.75;

const SUPERFLEX_SLOTS = new Set(['SUPER_FLEX', 'SUPERFLEX', 'QB/RB/WR/TE', 'Q/W/R/T']);

/**
 * True when a league starts exactly one quarterback.
 *
 * The rule below only holds in single-QB leagues. In superflex a quarterback
 * for a running back is an ordinary trade and often the correct one, so
 * applying the ban there would hide the best ideas on the board rather than
 * the worst.
 */
export function isSingleQbLeague(rosterPositions: readonly string[] | null | undefined) {
  if (!rosterPositions || rosterPositions.length === 0) return false;
  if (rosterPositions.some((slot) => SUPERFLEX_SLOTS.has(slot))) return false;
  return rosterPositions.filter((slot) => slot === 'QB').length <= 1;
}

/**
 * Why this deal cannot be called one of the league's best, or null.
 *
 * @param positionOf player id to position, from the league catalogue.
 */
export function dealRejection(
  deal: DealShape,
  positionOf: (playerId: string) => string | null | undefined,
  rosterPositions: readonly string[] | null | undefined,
): DealRejection | null {
  /* A quarterback straight across for a skill player, in a league that starts
     one quarterback.

     The two sides are not comparable there and the engine's own value gap
     usually says so loudly: a starting QB has a replacement a waiver claim
     away, and the running back does not. Shown side by side as a swap it
     reads as an offer worth considering, which is the one thing it is not. */
  if (deal.give.length === 1 && deal.get.length === 1 && isSingleQbLeague(rosterPositions)) {
    const gave = positionOf(deal.give[0].id);
    const got = positionOf(deal.get[0].id);
    if (gave && got && gave !== got && (gave === 'QB' || got === 'QB')) {
      return {
        reason: 'qb-for-skill',
        detail: `${gave} for ${got} straight across in a one-quarterback league`,
      };
    }
  }

  /* One side taking nearly all of the gain.

     This is the case Andre caught: the engine reported one side up 6.3 points
     of championship probability and the board printed it as a best deal
     anyway, because the board only ever sorted. */
  const you = Math.abs(deal.youDelta ?? 0);
  const partner = Math.abs(deal.partnerDelta ?? 0);
  const total = you + partner;
  if (total >= MATERIAL_TOTAL_PP) {
    const share = Math.max(you, partner) / total;
    if (share > MAX_ONE_SIDED_SHARE) {
      return {
        reason: 'lopsided',
        detail: `one side takes ${Math.round(share * 100)}% of the value`,
      };
    }
  }

  return null;
}

/** The deals this heading can carry, and how many it could not. */
export function acceptableDeals<T extends DealShape>(
  deals: readonly T[],
  positionOf: (playerId: string) => string | null | undefined,
  rosterPositions: readonly string[] | null | undefined,
) {
  const kept: T[] = [];
  const rejected: { deal: T; rejection: DealRejection }[] = [];

  for (const deal of deals) {
    const rejection = dealRejection(deal, positionOf, rosterPositions);
    if (rejection) rejected.push({ deal, rejection });
    else kept.push(deal);
  }

  return { kept, rejected };
}
