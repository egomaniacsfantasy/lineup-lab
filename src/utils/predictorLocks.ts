/**
 * Which of this week's games are already decided, and what that does to the
 * picks the Predictor sends.
 *
 * A leaf module on purpose: it imports nothing from the app graph, so the
 * rules below run under the node test runner without a browser.
 *
 * No probability is computed here. The engine has already priced the current
 * week against the points that are banked; this only reads that price and
 * recognises the one it prints as 100.0% against 0.0%. Such a game is over, or
 * as good as, and asking somebody to call it is asking them to confirm the
 * scoreboard.
 */

/** The win probability (0-100) that prints as 100.0%. */
export const DECIDED_AT = 99.95;

export interface LockSide {
  rosterId: string;
  /** 0-100, as the engine priced it. Absent when the week is unpriced. */
  winProb?: number | null;
}

export interface LockPick {
  week: number;
  matchupId: number;
  winnerRosterId: string;
  winnerPoints?: number;
  loserPoints?: number;
}

export interface DecidedGame {
  week: number;
  matchupId: number;
  winnerRosterId: string;
}

/**
 * The roster that has already won, or null while the game is still a game.
 *
 * Both sides have to agree. One side at 100 with the other missing or still
 * holding a chance is a pricing gap rather than a result, and locking a game
 * off half a line would take a live call away from the user.
 */
export function decidedWinner(sides: readonly LockSide[]): string | null {
  if (sides.length !== 2) return null;
  const [a, b] = sides;
  if (typeof a.winProb !== 'number' || typeof b.winProb !== 'number') return null;
  const floor = 100 - DECIDED_AT;
  if (a.winProb >= DECIDED_AT && b.winProb <= floor) return a.rosterId;
  if (b.winProb >= DECIDED_AT && a.winProb <= floor) return b.rosterId;
  return null;
}

/** The user's own calls: anything saved against a game that has since been
 *  decided is dropped, because that game is no longer theirs to call. */
export function openPicks<P extends LockPick>(
  picks: readonly P[],
  decided: readonly DecidedGame[],
): P[] {
  const locked = new Set(decided.map((game) => game.matchupId));
  return picks.filter((pick) => !locked.has(pick.matchupId));
}

/**
 * The pick-set the engine is asked to condition on.
 *
 * Decided games ride along as plain picks with no custom score, so the engine
 * credits the points it already holds for them. They have to be sent: the
 * bracket only opens once no regular-season game is left to simulate, and a
 * decided game that is never forced would keep it shut for ever.
 */
export function picksToSend<P extends LockPick>(
  picks: readonly P[],
  decided: readonly DecidedGame[],
): LockPick[] {
  return [
    ...decided.map((game) => ({
      week: game.week,
      matchupId: game.matchupId,
      winnerRosterId: game.winnerRosterId,
    })),
    ...openPicks(picks, decided),
  ];
}
