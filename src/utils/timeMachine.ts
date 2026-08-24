import type { HistoryEntry } from './openAnchors.ts';
import { americanFromPercent } from './openAnchors.ts';
import { closingLine } from './vsBook.ts';

/**
 * The board as it stood, any week you like.
 *
 * This is the thing nothing else in the category can do. Every competitor
 * recomputes a number and shows you today's answer; none of them keeps what
 * they said last month, so none of them can be held to it. We keep every
 * snapshot, so the product can produce receipts: you were 8.3% a month ago.
 *
 * Strictly a reader of stored history. It re-renders prices that were actually
 * quoted at the time and never re-simulates the past with today's projections,
 * which would be a much easier feature and a completely dishonest one — the
 * whole value is that the old number is the old number.
 *
 * Weeks with no snapshot simply do not exist here. A season that began before
 * we were pricing it has no early weeks, and inventing them by interpolating
 * between the ones we have would fabricate exactly the receipts this feature
 * exists to make trustworthy.
 */

export interface WeekMark {
  week: number;
  at: number;
  /** Title odds by roster id, as quoted at that week's close. */
  odds: Record<string, number>;
  /** Title probability by roster id, where the snapshot stored it. */
  prob: Record<string, number>;
}

/** Every week we can actually speak about, oldest first. */
export function availableWeeks(history: readonly HistoryEntry[]): number[] {
  const weeks = new Set<number>();
  for (const entry of history) {
    if (entry.week != null && (entry.titleOdds || entry.titleProb)) weeks.add(entry.week);
  }
  return [...weeks].sort((a, b) => a - b);
}

/**
 * The book as of a given week, read from that week's closing snapshot.
 *
 * The close, not the open: "where the market had you at the end of week 3" is
 * the honest reading of "as of week 3", because that is the number that stood
 * when the week finished.
 */
export function boardAsOf(
  history: readonly HistoryEntry[],
  week: number,
): WeekMark | null {
  const entry = closingLine(history, week);
  if (!entry) return null;
  const prob = entry.titleProb ?? {};
  const stored = entry.titleOdds ?? {};
  if (Object.keys(stored).length === 0 && Object.keys(prob).length === 0) return null;

  /* A stored price wins; where a snapshot kept only the probability, the price
     is derived with the same percent-to-American conversion the live board
     runs. Otherwise the board rewinds to a week of blank prices purely because
     of the shape that week happened to be stored in. */
  const odds: Record<string, number> = { ...stored };
  for (const [rosterId, value] of Object.entries(prob)) {
    if (odds[rosterId] == null && value > 0 && value < 100) {
      odds[rosterId] = americanFromPercent(value);
    }
  }
  return { week, at: entry.computedAt, odds, prob };
}

export interface WeekDelta {
  rosterId: string;
  thenOdds: number | null;
  nowOdds: number | null;
  thenProb: number | null;
  nowProb: number | null;
  /** Percentage points from then to now. Null when either side is missing. */
  movePp: number | null;
}

/**
 * Then against now, for every team on either board.
 *
 * A team present in one and not the other is still returned, with the missing
 * side null, because "this team was not on the board in week 3" is itself a
 * fact worth rendering rather than a row to drop.
 */
export function compareToNow(
  then: WeekMark | null,
  now: WeekMark | null,
): WeekDelta[] {
  if (!then || !now) return [];
  const rosterIds = new Set([
    ...Object.keys(then.odds),
    ...Object.keys(then.prob),
    ...Object.keys(now.odds),
    ...Object.keys(now.prob),
  ]);

  return [...rosterIds].map((rosterId) => {
    const thenProb = then.prob[rosterId] ?? null;
    const nowProb = now.prob[rosterId] ?? null;
    return {
      rosterId,
      thenOdds: then.odds[rosterId] ?? null,
      nowOdds: now.odds[rosterId] ?? null,
      thenProb,
      nowProb,
      movePp: thenProb != null && nowProb != null ? nowProb - thenProb : null,
    };
  });
}

/**
 * One line of receipts for the user's own team.
 *
 * Written to be quotable: the point of the feature is that somebody can say
 * "I was eight percent a month ago" and have the product back them up.
 */
export function receiptSentence(
  delta: WeekDelta | null | undefined,
  teamName: string,
  week: number,
): string | null {
  if (!delta || delta.thenProb == null || delta.nowProb == null) return null;
  const then = delta.thenProb.toFixed(1);
  const now = delta.nowProb.toFixed(1);
  if (Math.abs(delta.movePp ?? 0) < 0.05) {
    return `${teamName} was ${then}% after Week ${week}, and is ${now}% now. Nothing has changed.`;
  }
  const direction = (delta.movePp ?? 0) > 0 ? 'up' : 'down';
  const size = Math.abs(delta.movePp ?? 0).toFixed(1);
  /* Percentage points, never "points": this product renders fantasy points on
     nearly every other surface and the two must not share a word. */
  return `${teamName} was ${then}% after Week ${week}. Now ${now}%, ${direction} ${size} percentage points.`;
}
