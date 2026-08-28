/**
 * The bet slip: what can go on it, what cannot, and what it is worth.
 *
 * No money anywhere in this file, and none anywhere in the surface built on
 * it. There is no wager, no payout and no balance - a parlay here is a claim
 * about a week that two people can settle between themselves. What we supply
 * is the price that claim deserves.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE PRICE IS FAIR, WHICH IS NOT THE PRICE A BOOK WOULD POST
 *
 * A book multiplies its own juiced legs, so three coin flips pay +600 instead
 * of the +700 the outcome is actually worth. We quote what the outcome is
 * worth. That is the whole point of the product.
 *
 * ────────────────────────────────────────────────────────────────────────
 * SAME-GAME LEGS ARE ALLOWED, AND THEY ARE NOT MULTIPLIED
 *
 * Two markets on one game are not independent, so a slip that multiplied them
 * would quote nonsense. A first version of this file dodged that by allowing
 * only one leg per game. It does not have to: for the pair that actually
 * misprices - a moneyline and a spread on the same game - the joint
 * probability is not a modelling question at all. It is set logic on one
 * number the engine already produced.
 *
 * Write M for the favourite's margin and s for the posted line, so the
 * moneyline is M > 0, laying the points is M > s, and taking them is M < s.
 * P(M > s) = 0.5 because s IS the engine's central estimate of M. Then all
 * four combinations resolve exactly, with nothing estimated:
 *
 *   favourite ML + favourite spread   covering entails winning       0.5
 *   favourite ML + underdog spread    wins but does not cover        P(win) - 0.5
 *   underdog  ML + underdog spread    winning entails covering       P(win)
 *   underdog  ML + favourite spread   cannot both happen             0
 *
 * They sum to 1, which is the check that this is arithmetic and not a guess.
 * The last row is a genuine contradiction and is refused. The second is the
 * middle - the favourite wins by less than the line - and on a -113 game that
 * is a real 3.1% longshot rather than the 26.6% a naive multiply would claim.
 *
 * Totals are treated as independent of sides. That one IS an approximation,
 * and it is a good one: with M = A - B and T = A + B, Cov(M, T) = Var(A) -
 * Var(B), which is about zero for two full fantasy lineups. It is the only
 * approximation in this file and it is the mild one.
 *
 * Exact same-game pricing for every combination, including whatever markets
 * get added later, wants the sim rather than this table. See
 * docs/parlay-engine-memo.md.
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
  /**
   * Spread legs only: this side's posted margin, signed, favourite positive.
   * The same-game table needs to know which side is laying the points, and
   * the display string has already had its sign flipped for the board. */
  spreadValue?: number;
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
 * The joint probability of a moneyline and a spread on the SAME game.
 *
 * Derived, not estimated. See the table at the top of this file: the two
 * events are nested intervals of one margin, so their intersection is one of
 * the two, or the gap between them, or empty.
 *
 * Returns 0 for the one combination that cannot happen, which is what makes
 * this the contradiction test as well as the pricing rule.
 */
function sideJoint(moneyline: ParlayLeg, spread: ParlayLeg): number {
  const posted = spread.spreadValue ?? 0;
  /* The posted line from the MONEYLINE side's point of view: positive when
     the team you took to win is also the team laying the points. */
  const layingPoints = moneyline.selection === spread.selection ? posted : -posted;

  if (layingPoints >= 0) {
    return moneyline.selection === spread.selection
      ? /* Covering entails winning, so the pair is just the spread. */
        spread.probability
      : /* Wins without covering: the gap between the two lines, and never
           negative, since the win probability and the posted margin come from
           two passes of the sim and can disagree in the last decimal. */
        Math.max(0, moneyline.probability - spread.probability);
  }

  return moneyline.selection === spread.selection
    ? /* An underdog that wins has covered, so the pair is just the win. */
      moneyline.probability
    : /* The underdog wins AND the favourite covers. */
      0;
}

/** The moneyline and spread legs of one game, if both were taken. */
function sidePair(legs: readonly ParlayLeg[]): [ParlayLeg, ParlayLeg] | null {
  const moneyline = legs.find((leg) => leg.market === 'moneyline');
  const spread = legs.find((leg) => leg.market === 'spread');
  return moneyline && spread ? [moneyline, spread] : null;
}

/**
 * Can these two legs both come in?
 *
 * Two kinds of no. Two selections in the same market on one game are the
 * obvious one: a team cannot win and lose, a game cannot go over and under.
 * The other is the underdog moneyline against the favourite's spread, which
 * looks like two different bets and is in fact a bet against itself.
 *
 * Everything else on one game is allowed and priced by the table above,
 * including the pairs that add nothing.
 */
export function contradicts(one: ParlayLeg, other: ParlayLeg): boolean {
  if (one.matchupId !== other.matchupId) return false;
  if (one.market === other.market) return one.selection !== other.selection;

  const pair = sidePair([one, other]);
  return pair != null && sideJoint(pair[0], pair[1]) <= 0;
}

/** Everything on the slip that a new selection would knock off. */
export function contradictingLegs(
  legs: readonly ParlayLeg[],
  leg: ParlayLeg,
): ParlayLeg[] {
  return legs.filter((existing) => contradicts(existing, leg));
}

/**
 * What tapping a cell does to the slip.
 *
 *   - the same cell again        -> take it off, as a book toggles
 *   - anything it contradicts    -> that comes off, this goes on
 *   - anything else              -> added, same game or not
 *
 * Replacing rather than refusing: tapping the other side of a market is how
 * people change their mind, and an error message there would be answering a
 * question nobody asked.
 */
export function toggleLeg(legs: readonly ParlayLeg[], leg: ParlayLeg): ParlayLeg[] {
  const key = legKey(leg);
  if (legs.some((existing) => legKey(existing) === key)) {
    return legs.filter((existing) => legKey(existing) !== key);
  }
  return [...legs.filter((existing) => !contradicts(existing, leg)), leg];
}

export function removeLeg(legs: readonly ParlayLeg[], key: string): ParlayLeg[] {
  return legs.filter((existing) => legKey(existing) !== key);
}

/**
 * One game's legs, priced together.
 *
 * Sides resolve exactly against each other; a total multiplies in, because a
 * combined score and a margin are near enough to independent. See the header.
 */
function gameProbability(legs: readonly ParlayLeg[]): number {
  const total = legs.find((leg) => leg.market === 'total');
  const totalFactor = total ? total.probability : 1;
  const pair = sidePair(legs);
  if (pair) return sideJoint(pair[0], pair[1]) * totalFactor;

  const side = legs.find((leg) => leg.market !== 'total');
  return (side ? side.probability : 1) * totalFactor;
}

/**
 * The probability every leg hits, 0..1.
 *
 * Grouped by game first, because legs on one game are related and legs on
 * different games are not. See the note at the top of this file.
 */
export function parlayProbability(legs: readonly ParlayLeg[]): number | null {
  if (legs.length === 0) return null;

  const byGame = new Map<number, ParlayLeg[]>();
  legs.forEach((leg) => {
    byGame.set(leg.matchupId, [...(byGame.get(leg.matchupId) ?? []), leg]);
  });

  /* Multiplying ACROSS games, never within one. Different fantasy matchups
     share no roster, and what couples them at all (two managers on opposite
     sides of one NFL game, a defence facing someone's quarterback) is
     second-order against full lineups. */
  return [...byGame.values()].reduce((product, game) => product * gameProbability(game), 1);
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
export function spreadLeg(
  context: LegContext & { line: string; spreadValue: number },
): ParlayLeg {
  return {
    matchupId: context.matchupId,
    market: 'spread',
    selection: context.selection,
    probability: EVEN_MONEY_PROBABILITY,
    label: context.teamName,
    line: context.line,
    spreadValue: context.spreadValue,
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

/**
 * Legs that are already guaranteed by the rest of the slip.
 *
 * Taking a favourite's spread and then its moneyline is allowed, and it
 * should be: it is a coherent pair of picks. But the second one changes
 * nothing, because covering the spread already entailed winning, and a slip
 * that grew by a leg while the price stood still reads as broken.
 *
 * Worked out by removal rather than by another table, so it stays true for
 * whatever combinations exist later.
 */
export function impliedLegKeys(legs: readonly ParlayLeg[]): Set<string> {
  const whole = parlayProbability(legs);
  const implied = new Set<string>();
  if (whole == null || legs.length < 2) return implied;

  legs.forEach((leg) => {
    const key = legKey(leg);
    const without = parlayProbability(legs.filter((other) => legKey(other) !== key));
    if (without != null && Math.abs(without - whole) < 1e-9) implied.add(key);
  });
  return implied;
}
