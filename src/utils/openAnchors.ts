/**
 * Where a price started, so movement means something.
 *
 * "Zeus's Bolts +475" is a fact. "Zeus's Bolts +900 → +475" is a story, and the
 * only difference between them is knowing where the line opened. Four separate
 * features need that same anchor — movement on the weekly board, movement on
 * the futures board, the season ticket, and the time machine — so it is derived
 * once here rather than four times slightly differently.
 *
 * Two different anchors, and confusing them is the trap:
 *
 *   The WEEK open is the first price posted for a given week. It resets every
 *   week. Board movement is measured against it, which is what makes "the
 *   market moved toward you since Wednesday" a true sentence.
 *
 *   The SEASON open is the first price ever recorded for the league. It never
 *   resets. The ticket and the futures Open column measure against it.
 *
 * Both read the same stored history: server/engine/lineStore.js appends a
 * snapshot whenever the inputs hash changes and stamps it with a trigger, of
 * which 'line opened' is the very first snapshot for a league and 'weekly roll'
 * is the first of each subsequent week. Those triggers are a hint, not the
 * rule — a league whose history was trimmed, or whose first snapshot predates
 * the trigger vocabulary, still has an earliest entry, and the earliest entry
 * is what an open actually is. So order decides and the trigger is never
 * required.
 *
 * Real history only. A week with no snapshot has no open, and nothing here
 * invents one: a fabricated anchor would produce fabricated movement, which is
 * worse than showing none.
 */

export interface HistorySide {
  moneyline: number;
  winProbability: number;
  /* Both optional because history is never rewritten: snapshots taken before
     these were persisted simply do not have them, and code that reads them has
     to treat absence as "cannot answer" rather than as zero. */
  spread?: number;
  projection?: number;
}

export interface HistoryEntry {
  computedAt: number;
  week: number;
  trigger?: string;
  lines?: { matchupId: number; sides: Record<string, HistorySide> }[];
  titleOdds?: Record<string, number>;
  playoffOdds?: Record<string, number>;
  titleProb?: Record<string, number>;
}

/**
 * Percent to a fair American price. No vig: this is the same no-juice
 * conversion the rest of the board uses, so a derived open sits on exactly the
 * same scale as a stored one.
 */
export function americanFromPercent(percent: number): number {
  const p = percent / 100;
  return p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

/** Oldest first. The stored file is append-ordered, but nothing guarantees it. */
function byTime(history: readonly HistoryEntry[]): HistoryEntry[] {
  return [...history].sort((a, b) => a.computedAt - b.computedAt);
}

/**
 * The first snapshot recorded for a week, or null when that week has none.
 */
export function weekOpen(
  history: readonly HistoryEntry[],
  week: number,
): HistoryEntry | null {
  return byTime(history).find((entry) => entry.week === week) ?? null;
}

/** The first snapshot ever recorded for this league. */
export function seasonOpen(history: readonly HistoryEntry[]): HistoryEntry | null {
  return byTime(history)[0] ?? null;
}

/** The newest snapshot. */
export function latestSnapshot(history: readonly HistoryEntry[]): HistoryEntry | null {
  return byTime(history).at(-1) ?? null;
}

export interface SideMove {
  matchupId: number;
  rosterId: string;
  openMoneyline: number;
  nowMoneyline: number;
  openWinProbability: number;
  nowWinProbability: number;
  /** Percentage POINTS, not percent. 57% from 55% is +2.0, never "+3.6%". */
  movePp: number;
}

/**
 * Movement for every side priced this week, against this week's open.
 *
 * Returns an empty list rather than zeroes when there is no open to measure
 * against. A row of "0.0" is a claim that the line has not moved, which is a
 * different statement from "we have nothing to compare it to".
 */
export function weekMovement(
  history: readonly HistoryEntry[],
  week: number,
): SideMove[] {
  const open = weekOpen(history, week);
  const now = latestSnapshot(history.filter((entry) => entry.week === week));
  if (!open || !now || open.computedAt === now.computedAt) return [];

  const openByMatchup = new Map(open.lines?.map((line) => [line.matchupId, line.sides]) ?? []);
  const moves: SideMove[] = [];

  for (const line of now.lines ?? []) {
    const openSides = openByMatchup.get(line.matchupId);
    if (!openSides) continue;
    for (const [rosterId, side] of Object.entries(line.sides ?? {})) {
      const openSide = openSides[rosterId];
      if (!openSide) continue;
      moves.push({
        matchupId: line.matchupId,
        rosterId,
        openMoneyline: openSide.moneyline,
        nowMoneyline: side.moneyline,
        openWinProbability: openSide.winProbability,
        nowWinProbability: side.winProbability,
        movePp: side.winProbability - openSide.winProbability,
      });
    }
  }
  return moves;
}

export type FuturesMarket = 'title' | 'playoff';

export interface TitleMove {
  rosterId: string;
  openOdds: number;
  nowOdds: number;
  openProb: number | null;
  nowProb: number | null;
  /** Percentage points of title probability. Null when probability is absent. */
  movePp: number | null;
}

/**
 * Season-long movement in a futures market: the opening book against today's.
 *
 * This is what the futures Open column and the ticket both read. A team absent
 * from the opening book — one that joined late, or a league whose first
 * snapshot predates it — is omitted rather than anchored to today, which would
 * render as "no movement" for a team we simply cannot speak about.
 *
 * Playoff odds carry no stored probability alongside them the way title odds
 * do, so movePp is null there and the caller shows the two prices instead of a
 * points figure.
 *
 * Older snapshots stored the probability and not the price. Rather than leave
 * those leagues with a blank Open column, the price is derived from the stored
 * probability — the same percent-to-American-odds conversion the board already
 * performs on every live number, applied to a figure the sim genuinely
 * produced. That is a display transform, not an invention; the alternative is
 * hiding real history because of the shape it happens to be stored in.
 */
export function marketMovement(
  history: readonly HistoryEntry[],
  market: FuturesMarket = 'title',
  /* Omit for the season book, which is what futures and the ticket quote.
     Pass a week to ask the narrower question the weekly board asks: what has
     this week done to the title market? Those are different stories — a team
     can be well up on the season and down on the week. */
  week?: number,
): TitleMove[] {
  const scoped = week == null ? history : history.filter((entry) => entry.week === week);
  const open = week == null ? seasonOpen(history) : weekOpen(history, week);
  const now = latestSnapshot(scoped);
  if (!open || !now || open.computedAt === now.computedAt) return [];

  const probOf = (entry: HistoryEntry) => (market === 'playoff' ? undefined : entry.titleProb);

  /* A stored price wins. Where there is none, one is derived from the stored
     probability so history recorded before prices were persisted still reads. */
  const oddsOf = (entry: HistoryEntry): Record<string, number> => {
    const stored = (market === 'playoff' ? entry.playoffOdds : entry.titleOdds) ?? {};
    const probs = probOf(entry);
    if (!probs) return stored;
    const out: Record<string, number> = { ...stored };
    for (const [rosterId, prob] of Object.entries(probs)) {
      if (out[rosterId] == null && prob > 0 && prob < 100) out[rosterId] = americanFromPercent(prob);
    }
    return out;
  };

  const moves: TitleMove[] = [];
  for (const [rosterId, nowOdds] of Object.entries(oddsOf(now))) {
    const openOdds = oddsOf(open)[rosterId];
    if (openOdds == null) continue;
    const openProb = probOf(open)?.[rosterId] ?? null;
    const nowProb = probOf(now)?.[rosterId] ?? null;
    moves.push({
      rosterId,
      openOdds,
      nowOdds,
      openProb,
      nowProb,
      movePp: openProb != null && nowProb != null ? nowProb - openProb : null,
    });
  }
  return moves;
}

/** The title market, which is the one the ticket is written against. */
export function titleMovement(history: readonly HistoryEntry[]): TitleMove[] {
  return marketMovement(history, 'title');
}

/**
 * "+2.1" / "-0.8" / null.
 *
 * Null below the threshold rather than "0.0", so the board can leave the cell
 * empty. A line that has genuinely not moved should show nothing; printing
 * "0.0" on nine rows is noise that makes the two rows that did move harder to
 * find. The unit is percentage points and is labelled as such by the caller,
 * never as a percent.
 */
export function formatMovePp(movePp: number | null, threshold = 0.05): string | null {
  if (movePp == null || Math.abs(movePp) < threshold) return null;
  return `${movePp > 0 ? '+' : '−'}${Math.abs(movePp).toFixed(1)}`;
}
