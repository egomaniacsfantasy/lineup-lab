import type { HistoryEntry } from './openAnchors.ts';
import { titleMovement } from './openAnchors.ts';

/**
 * Your preseason ticket, re-marked.
 *
 * The emotional object is "I took this team at +900 and it is +475 now". What
 * makes that land is that the price is a receipt: it was quoted before any of
 * this happened, and it has not been retconned.
 *
 * No money. Not a stake, not a payout, not a cash-out value. The reference
 * mock for this feature showed "$100" and "$174 CASH-OUT VALUE", which is
 * precisely the thing this product must never render: nobody is betting
 * anything, and a dollar figure is the difference between a sportsbook-themed
 * product and something that looks like it takes bets. Value is expressed only
 * in odds, in implied probability, and in a multiplier.
 *
 * The multiplier is the honest version of the cash-out feeling. A position that
 * opened at 10% and is now 17.4% is worth 1.74x what it opened at, because
 * that ratio is exactly what changed: the probability. It invents nothing and
 * needs no currency.
 */

export interface Ticket {
  rosterId: string;
  openOdds: number;
  nowOdds: number;
  openProb: number;
  nowProb: number;
  /** nowProb / openProb. 1.74 means the position is worth 1.74x its open. */
  multiplier: number;
  /** Percentage points, signed. */
  movePp: number;
  direction: 'up' | 'down' | 'flat';
}

/**
 * The user's ticket, or null when there is nothing honest to show.
 *
 * Null rather than a placeholder whenever the season open is missing, the
 * probabilities are absent, or the open is zero. A ticket is a receipt; a
 * fabricated one is worse than none.
 */
export function buildTicket(
  history: readonly HistoryEntry[],
  rosterId: string | number | null | undefined,
): Ticket | null {
  if (rosterId == null) return null;
  const id = String(rosterId);
  const move = titleMovement(history).find((entry) => entry.rosterId === id);
  if (!move) return null;

  const { openProb, nowProb } = move;
  /* Both probabilities are required. A multiplier off a missing or zero open
     is either NaN or infinite, and either one would render as a number. */
  if (openProb == null || nowProb == null || openProb <= 0) return null;

  const movePp = nowProb - openProb;
  return {
    rosterId: id,
    openOdds: move.openOdds,
    nowOdds: move.nowOdds,
    openProb,
    nowProb,
    multiplier: nowProb / openProb,
    movePp,
    direction: Math.abs(movePp) < 0.05 ? 'flat' : movePp > 0 ? 'up' : 'down',
  };
}

/** "1.74x". Only shown when it actually says something. */
export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(2)}x`;
}

/**
 * One line for the ticket, and for the share card built from it.
 *
 * Deliberately about the position rather than about the manager: "your
 * position has improved" survives being screenshotted in a way "you are
 * crushing it" does not, and it stays true whichever direction it went.
 */
export function ticketSentence(ticket: Ticket, teamName: string): string {
  const open = ticket.openProb.toFixed(1);
  const now = ticket.nowProb.toFixed(1);
  if (ticket.direction === 'flat') {
    return `${teamName} opened at ${open}% to win it all and sits at ${now}%. The market has not moved.`;
  }
  const multiplier = formatMultiplier(ticket.multiplier);
  return ticket.direction === 'up'
    ? `${teamName} opened at ${open}% to win it all and is now ${now}%. This position is worth ${multiplier} what it opened at.`
    : `${teamName} opened at ${open}% to win it all and is now ${now}%. This position is worth ${multiplier} what it opened at.`;
}
