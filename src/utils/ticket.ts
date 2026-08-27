import type { HistoryEntry } from './openAnchors.ts';
import { americanFromPercent, titleMovement } from './openAnchors.ts';

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
  /**
   * One closing price per week, oldest first.
   *
   * Per-week rather than per-snapshot on purpose. The raw history samples
   * several times a day, so drawn straight it was a line of intraday jitter
   * rather than a season: a ticket six days old produced a chart with a shape,
   * and a shape reads as a trend whether or not one is there.
   */
  series: { week: number; prob: number }[];
  /** The best this ticket was ever worth, and when. */
  peak: { prob: number; odds: number; week: number } | null;
  /** Where this price sat in the league book, then and now. */
  rankOpen: number | null;
  rankNow: number | null;
  fieldSize: number | null;
  /** Weeks between the open and the latest snapshot, inclusive. */
  weeksHeld: number | null;
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

  /* One point per week: the price that week closed at. Snapshots with no title
     book are skipped rather than plotted at zero — a gap in the record is not a
     week the ticket was worthless. */
  const byWeek = new Map<number, { week: number; prob: number }>();
  for (const entry of [...history].sort((left, right) => left.computedAt - right.computedAt)) {
    const prob = entry.titleProb?.[id];
    if (prob == null) continue;
    byWeek.set(entry.week, { week: entry.week, prob });
  }
  const series = [...byWeek.values()].sort((left, right) => left.week - right.week);

  /* The high-water mark. This is the "you could have cashed out at" number,
     which is most of what makes a ticket worth re-reading, and it is a
     maximum over prices already recorded rather than anything re-simulated. */
  const best = series.reduce<{ week: number; prob: number } | null>(
    (top, point) => (top == null || point.prob > top.prob ? point : top),
    null,
  );

  /* Rank in the league book, then and now. Both are counts of teams priced
     shorter than this one in a snapshot that already exists — a reading of the
     engine's order, not a re-ordering of it. */
  const rankIn = (book: Record<string, number> | undefined) => {
    if (!book) return null;
    const mine = book[id];
    if (mine == null) return null;
    return Object.values(book).filter((prob) => prob > mine).length + 1;
  };
  const sorted = [...history].sort((left, right) => left.computedAt - right.computedAt);
  const openBook = sorted.find((entry) => entry.titleProb?.[id] != null)?.titleProb;
  const nowBook = [...sorted].reverse().find((entry) => entry.titleProb?.[id] != null)?.titleProb;

  const firstWeek = series[0]?.week ?? null;
  const lastWeek = series[series.length - 1]?.week ?? null;

  return {
    rosterId: id,
    openOdds: move.openOdds,
    nowOdds: move.nowOdds,
    openProb,
    nowProb,
    multiplier: nowProb / openProb,
    movePp,
    direction: Math.abs(movePp) < 0.05 ? 'flat' : movePp > 0 ? 'up' : 'down',
    series,
    peak: best
      ? { prob: best.prob, odds: americanFromPercent(best.prob), week: best.week }
      : null,
    rankOpen: rankIn(openBook),
    rankNow: rankIn(nowBook),
    fieldSize: nowBook ? Object.keys(nowBook).length : null,
    weeksHeld:
      firstWeek != null && lastWeek != null ? Math.max(1, lastWeek - firstWeek + 1) : null,
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
