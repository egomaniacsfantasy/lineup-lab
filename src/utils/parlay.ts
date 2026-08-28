/**
 * The bet slip: what can go on it, what cannot, and what it is worth.
 *
 * No money anywhere in this file, and none anywhere in the surface built on
 * it. There is no stake, no payout and no balance - a parlay here is a claim
 * about a week that two people can settle between themselves. What we supply
 * is the price that claim deserves.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE PRICE IS FAIR, WHICH IS NOT THE PRICE A BOOK WOULD POST
 *
 * A book multiplies its own juiced legs, so three coin flips pay +600 instead
 * of the +700 the outcome is actually worth. We multiply the engine's true
 * probabilities and quote the result straight. That is the whole point of the
 * product: the number is what the thing is worth, not what a book could get
 * away with charging for it.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY ONE LEG PER GAME
 *
 * Multiplying probabilities is only correct for INDEPENDENT events, and two
 * markets on the same game are nowhere near independent. Take a game priced
 * at -113 with the favourite laying 2.9:
 *
 *   moneyline      53.1%
 *   spread -2.9    50.0%
 *   multiplied     26.6%   ->   +276
 *   actually       50.0%   ->   +100
 *
 * A team that covers -2.9 has necessarily won, so the parlay is exactly the
 * spread leg. Quoting +276 for it would be the single worst number in the
 * product: not a rounding error, but a price that is wrong by a factor of two
 * in the customer's favour, on a bet they can find by accident in two taps.
 * Totals correlate with sides the same way, less sharply.
 *
 * So a slip takes at most one leg from any one game, and adding a second
 * REPLACES the first rather than refusing it. That is a real sportsbook rule,
 * not a workaround - a book that has not built a same-game model does exactly
 * this, and one that has prices those parlays from a joint distribution
 * rather than by multiplying.
 *
 * Across DIFFERENT games in a week, independence is close enough to true to
 * quote on: two fantasy matchups share no roster, and what couples them at
 * all (two managers starting opposite sides of one NFL game, a defence facing
 * someone's quarterback) is second-order against a full lineup.
 *
 * Same-game parlays are worth building, and the way to build them is NOT to
 * add a correlation fudge here. The sim already produces the joint outcome;
 * it can score a whole leg-set directly and return the exact probability,
 * correlation and all. See docs/parlay-engine-memo.md.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHERE THE NUMBERS COME FROM
 *
 * Moneyline legs carry the engine's own win probability. Spread and total
 * legs are 50% by construction: the line IS the engine's central estimate of
 * the margin and of the combined score, so either side of it is a coin flip.
 * Nothing in this file derives a probability of its own.
 */

import { impliedProbability } from './formatOdds.ts';

export type LegMarket = 'moneyline' | 'spread' | 'total';

/** How each market is named wherever a leg is written out in words. */
export const MARKET_LABEL: Record<LegMarket, string> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Total',
};

/** 'a' and 'b' are the two teams; totals take a direction instead. */
export type LegSelection = 'a' | 'b' | 'over' | 'under';

/**
 * A line set at the middle of the distribution is a coin flip on either side.
 *
 * This is the reason spreads and totals are quoted at +100 everywhere in the
 * product: not a placeholder for a real number, but the real number. If the
 * engine ever posts a line away from its own central estimate, this stops
 * being true and the leg needs its own probability from the sim.
 */
export const EVEN_MONEY_PROBABILITY = 0.5;

export interface ParlayLeg {
  /** The game this leg belongs to. One leg per game, so this is the slot. */
  matchupId: number;
  market: LegMarket;
  selection: LegSelection;
  /** Probability this leg hits, 0..1, straight from the engine. */
  probability: number;
  /** Who or what was taken: a team name, or Over / Under. */
  label: string;
  /** The number taken with it: "-2.9", "239.5", or empty for a moneyline. */
  line: string;
  /** This leg's own American price. */
  price: number;
  /** For the slip's own use: the game, in words. */
  matchupLabel: string;
}

/** Identifies a selection exactly. Two taps on the same key are a toggle. */
export function legKey(leg: Pick<ParlayLeg, 'matchupId' | 'market' | 'selection'>): string {
  return `${leg.matchupId}:${leg.market}:${leg.selection}`;
}

/**
 * What tapping a cell does to the slip.
 *
 * Three cases, and the third is the one that matters:
 *   - the same cell again      -> take it off (a toggle, as a book does)
 *   - a cell on a fresh game   -> add it
 *   - any cell on a game that  -> REPLACE that game's leg
 *     is already on the slip
 *
 * The replace case covers every conflict rule at once: both sides of a
 * moneyline, both sides of a spread, over and under, and the correlated
 * cross-market pairs that are the actual danger. Refusing the tap with an
 * error would be worse UX and no safer.
 */
export function toggleLeg(legs: readonly ParlayLeg[], leg: ParlayLeg): ParlayLeg[] {
  const key = legKey(leg);
  if (legs.some((existing) => legKey(existing) === key)) {
    return legs.filter((existing) => legKey(existing) !== key);
  }
  const withoutGame = legs.filter((existing) => existing.matchupId !== leg.matchupId);
  return [...withoutGame, leg];
}

export function removeLeg(legs: readonly ParlayLeg[], key: string): ParlayLeg[] {
  return legs.filter((existing) => legKey(existing) !== key);
}

/**
 * The leg a tap would replace, if any.
 *
 * The UI needs this to say so before the tap rather than after it, so a slip
 * never silently loses a selection the user still wanted.
 */
export function conflictingLeg(
  legs: readonly ParlayLeg[],
  leg: Pick<ParlayLeg, 'matchupId' | 'market' | 'selection'>,
): ParlayLeg | null {
  const key = legKey(leg);
  return (
    legs.find((existing) => existing.matchupId === leg.matchupId && legKey(existing) !== key) ?? null
  );
}

/**
 * The probability every leg hits, 0..1.
 *
 * A plain product, which is exactly and only valid because legs come from
 * different games. See the note at the top of this file.
 */
export function parlayProbability(legs: readonly ParlayLeg[]): number | null {
  if (legs.length === 0) return null;
  return legs.reduce((product, leg) => product * leg.probability, 1);
}

/**
 * The same conversion the engine uses, kept identical on purpose.
 *
 * Guards only the 0 and 1 singularity, where American odds are infinite, so a
 * long parlay stays a finite number rather than becoming Infinity on screen.
 * Even money is quoted +100 and never -100, which is the house convention
 * everywhere else in the product.
 */
export function americanFromProbability(probability: number): number {
  const p = Math.min(1 - 1e-9, Math.max(1e-9, probability));
  const american = p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
  return american === -100 ? 100 : american;
}

/** The slip's price. One leg prices as itself; no legs has no price. */
export function parlayPrice(legs: readonly ParlayLeg[]): number | null {
  const probability = parlayProbability(legs);
  return probability == null ? null : americanFromProbability(probability);
}

/**
 * The probability behind a price the engine already quoted.
 *
 * Moneyline legs are built from this rather than from the matchup's win
 * probability field directly, so a leg and the cell it was tapped from can
 * never disagree: the price on screen IS the leg's probability.
 */
export function probabilityFromPrice(american: number): number {
  return impliedProbability(american) / 100;
}

/* ────────────────────────────────────────────────────────────────────────
   Leg builders.

   Here rather than in the card so that which probability belongs to which
   market is stated once, in the file that documents why, and can be tested
   without rendering anything. They take primitives, not a matchup: this
   module has no opinion about the shape of a league. */

interface LegContext {
  matchupId: number;
  matchupLabel: string;
  teamName: string;
  selection: 'a' | 'b';
}

/** The engine's own price, and the probability that price stands for. */
export function moneylineLeg(context: LegContext & { price: number }): ParlayLeg {
  return {
    matchupId: context.matchupId,
    market: 'moneyline',
    selection: context.selection,
    /* Read back off the quoted price rather than off the win-probability
       field it came from. The two agree to within rounding, and taking the
       price means a slip can always be checked by hand against the numbers
       on the cards - which, for a product whose pitch is that its numbers
       are honest, is worth more than the third decimal. */
    probability: probabilityFromPrice(context.price),
    label: context.teamName,
    line: '',
    price: context.price,
    matchupLabel: context.matchupLabel,
  };
}

/** A side of the spread. Even money: the line is the engine's own middle. */
export function spreadLeg(context: LegContext & { line: string }): ParlayLeg {
  return {
    matchupId: context.matchupId,
    market: 'spread',
    selection: context.selection,
    probability: EVEN_MONEY_PROBABILITY,
    label: context.teamName,
    line: context.line,
    price: americanFromProbability(EVEN_MONEY_PROBABILITY),
    matchupLabel: context.matchupLabel,
  };
}

/** Over or under the projected combined score. Even money, same reason. */
export function totalLeg(context: {
  matchupId: number;
  matchupLabel: string;
  selection: 'over' | 'under';
  total: number;
}): ParlayLeg {
  return {
    matchupId: context.matchupId,
    market: 'total',
    selection: context.selection,
    probability: EVEN_MONEY_PROBABILITY,
    label: context.selection === 'over' ? 'Over' : 'Under',
    line: context.total.toFixed(1),
    price: americanFromProbability(EVEN_MONEY_PROBABILITY),
    matchupLabel: context.matchupLabel,
  };
}
