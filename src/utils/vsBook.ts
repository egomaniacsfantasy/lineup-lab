import type { HistoryEntry } from './openAnchors.ts';
import { weekOpen } from './openAnchors.ts';

/**
 * Does this team beat the number?
 *
 * Every other column in the standings measures scoring. This one measures a
 * team against the price we posted on it, which is the one question only a book
 * can ask: not "did you win" but "did you do better than we said you would".
 *
 * It has to be graded on the MARGIN, not on the moneyline. A moneyline alone
 * says who was favoured, and a final score already says who won, so a record
 * built from the two collapses straight back into wins and losses and adds
 * nothing to the table. Against the closing spread, a 2-6 team can be 5-3, and
 * that gap is the entire point of the column.
 *
 * Covering as a favourite and covering as a dog count the same. Whether you
 * were expected to win is already priced into the spread; the only question
 * left is whether you cleared it.
 *
 * Snapshots recorded before spreads were persisted have none, and no spread
 * means no verdict — never a guess, and never a fallback to who won, which
 * would quietly turn this column into a copy of the Record column beside it.
 */

export interface WeekResult {
  week: number;
  rosterId: string;
  points: number;
  opponentPoints: number;
}

export interface VsBookRecord {
  rosterId: string;
  covers: number;
  fails: number;
  pushes: number;
  /** Weeks that had both a stored closing spread and a final score. */
  graded: number;
}

/**
 * The last snapshot of a week is its closing line. Anything later belongs to
 * the following week, and anything earlier is a price that was superseded
 * before the games were played.
 */
export function closingLine(
  history: readonly HistoryEntry[],
  week: number,
): HistoryEntry | null {
  const inWeek = history
    .filter((entry) => entry.week === week)
    .sort((a, b) => a.computedAt - b.computedAt);
  return inWeek.at(-1) ?? weekOpen(history, week);
}

/**
 * A side's closing spread, or null when the snapshot predates spreads being
 * stored.
 *
 * Sign convention follows the board: a favourite's spread is negative, so
 * −2.5 means "give up two and a half".
 */
export function closingSpread(
  history: readonly HistoryEntry[],
  week: number,
  matchupId: number,
  rosterId: string,
): number | null {
  const closing = closingLine(history, week);
  const side = closing?.lines?.find((line) => line.matchupId === matchupId)?.sides?.[rosterId];
  return typeof side?.spread === 'number' ? side.spread : null;
}

/**
 * Did this margin clear this spread?
 *
 * margin is the team's own points minus its opponent's. A −2.5 favourite needs
 * a margin above 2.5; a +2.5 dog needs a margin above −2.5, which a narrow loss
 * satisfies. Exactly on the number is a push and counts as neither.
 */
export function covered(margin: number, spread: number): 'cover' | 'fail' | 'push' {
  const needed = -spread;
  if (Math.abs(margin - needed) < 1e-9) return 'push';
  return margin > needed ? 'cover' : 'fail';
}

/**
 * Records against the closing number, for every team with something to grade.
 *
 * A team with no graded week is omitted entirely rather than returned as 0-0.
 * An empty record renders as a claim that a team has never beaten the number,
 * which is a different statement from having never been graded.
 */
export function vsBookRecords(
  history: readonly HistoryEntry[],
  results: readonly WeekResult[],
  matchupIdFor: (week: number, rosterId: string) => number | null,
): VsBookRecord[] {
  const byRoster = new Map<string, VsBookRecord>();

  for (const result of results) {
    const matchupId = matchupIdFor(result.week, result.rosterId);
    if (matchupId == null) continue;
    const spread = closingSpread(history, result.week, matchupId, result.rosterId);
    if (spread == null) continue;

    const verdict = covered(result.points - result.opponentPoints, spread);
    const record = byRoster.get(result.rosterId) ?? {
      rosterId: result.rosterId,
      covers: 0,
      fails: 0,
      pushes: 0,
      graded: 0,
    };
    if (verdict === 'cover') record.covers += 1;
    else if (verdict === 'fail') record.fails += 1;
    else record.pushes += 1;
    record.graded += 1;
    byRoster.set(result.rosterId, record);
  }

  return [...byRoster.values()];
}

/** "5-3" or "5-3-1". Null when nothing has been graded. */
export function formatVsBook(record: VsBookRecord | null | undefined): string | null {
  if (!record || record.graded === 0) return null;
  return record.pushes > 0
    ? `${record.covers}-${record.fails}-${record.pushes}`
    : `${record.covers}-${record.fails}`;
}
