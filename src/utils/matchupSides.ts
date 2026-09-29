/**
 * The two sides of one matchup, and the conversion between a probability and
 * a price.
 *
 * A leaf module on purpose: it imports nothing from the app graph, so the
 * invariant below can be tested by the node runner without standing up a
 * browser. It used to live in lineupComparison, which reaches into the player
 * manifest and therefore cannot be imported by a test at all.
 */

export function roundTo(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * A probability, priced.
 *
 * The guard is the singularity only, matching the engine's own probToAmerican:
 * american odds are infinite at a genuine 0 or 1, and everything short of that
 * is a real price. It used to clamp to [1%, 99%], which quietly capped every
 * lopsided game at -9900/+9900 and produced this, on a week-3 game that was
 * already decided:
 *
 *     your side  [check]        (the engine's own price, past off-the-board)
 *     their side +9900          (this clamp, a price for a 1% chance)
 *     the bar    100.0% / 0.0%
 *
 * Three numbers, two of which disagree with the third. The engine had already
 * called it; only the derived side was still quoting a live market. Past the
 * off-the-board threshold formatOdds prints a check and a dash, which is the
 * pair a decided game should read as.
 */
export function winProbabilityToMoneyline(winProbability: number) {
  const probability = Math.min(Math.max(winProbability / 100, 1e-9), 1 - 1e-9);

  if (probability >= 0.5) {
    return -Math.round((probability / (1 - probability)) * 100);
  }

  return Math.round(((1 - probability) / probability) * 100);
}

/**
 * The other side of a two-team game.
 *
 * Everything about the opponent's line is a mirror of yours, so it is derived
 * rather than tracked: their probability is 100 minus yours, their price is
 * that probability converted, their spread is yours negated, and the total is
 * shared.
 *
 * The invariant that matters: in a two-team game exactly one side can be the
 * favourite. Because the two probabilities sum to 100, exactly one of them is
 * above even money, so the two prices can never carry the same sign. Deriving
 * the price from the probability is what guarantees that; deriving it by
 * arithmetic on another price does not, and did not.
 */
export function opponentLineFrom(yours: {
  winProbability: number;
  projection: number;
  spread: number;
  total: number;
}) {
  const winProbability = roundTo(100 - yours.winProbability);
  return {
    moneyline: winProbabilityToMoneyline(winProbability),
    winProbability,
    projection: roundTo(yours.total - yours.projection),
    spread: roundTo(yours.spread * -1),
    total: yours.total,
  };
}
