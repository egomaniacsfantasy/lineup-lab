/**
 * All-play: what your record would be if you had played everybody, every week.
 *
 * A head-to-head record answers two questions at once and tells you which is
 * which: how well you scored, and who you happened to draw. All-play answers
 * only the first. Score the third-highest total in a twelve-team league and you
 * go 9-2 that week whoever you were scheduled against, so a season of all-play
 * records ranks the league by scoring alone, with the schedule taken out.
 *
 * The gap between the two is the schedule's doing, and that is the number
 * people actually want: not "you were unlucky" as a feeling, but 1.8 wins,
 * counted.
 *
 * Nothing here is a forecast. Every number is arithmetic on scores that have
 * already happened — counting, not modelling. That matters for where this is
 * allowed to live: the engine owns predictions, and this predicts nothing.
 *
 * A note on naming. The engine publishes `expWins`, a projection of how many
 * games a team will win this season. The `expectedWins` here is the opposite
 * direction in time: the wins a team's SCORING alone earned in games already
 * played. Same English phrase, different quantity.
 *
 * On screen the retrospective one is xW-L, borrowing the x-prefix convention
 * from xG and xFIP, where it reads as "what should have happened given what you
 * did". The forward-looking one is only ever labelled "Projected wins", and the
 * two live on different tabs. They must never share a screen, let alone a
 * column, because "expected wins" said out loud is ambiguous between them.
 */

export interface WeekScore {
  week: number;
  rosterId: number;
  points: number;
}

export interface AllPlayRow {
  rosterId: number;
  /** Wins and losses against the whole league, week by week. */
  allPlayWins: number;
  allPlayLosses: number;
  allPlayTies: number;
  /** Share of all-play games won, 0-1. The schedule-free measure of scoring. */
  allPlayWinPct: number;
  /** Weeks that counted toward the above. */
  weeksCounted: number;
  /**
   * Wins this team's scoring alone earned: allPlayWinPct × games played.
   * A team scoring dead-average every week earns half a win a week.
   */
  expectedWins: number;
  /** Real head-to-head wins over the same weeks. */
  actualWins: number;
  /**
   * actualWins − expectedWins. Positive means the schedule handed you games
   * your scoring did not earn; negative means it took them away.
   */
  luck: number;
}

/**
 * Which weeks are safe to count.
 *
 * A future week is present in the schedule with every score at zero, and an
 * in-progress week has some teams on zero and some not. Both would be read as
 * "everybody tied" or "half the league got shut out" — the second is worse,
 * because it looks like real data and would hand a blowout all-play record to
 * whoever kicked off early. So a week counts only when every team in it has a
 * non-zero score.
 *
 * A genuine 0.00 is possible and would exclude its week. That is the right
 * trade: excluding one real week understates the sample, while including a
 * half-played one invents results.
 */
export function playedWeeks(scores: WeekScore[]): number[] {
  const byWeek = new Map<number, WeekScore[]>();
  for (const score of scores) {
    byWeek.set(score.week, [...(byWeek.get(score.week) ?? []), score]);
  }
  const complete: number[] = [];
  byWeek.forEach((entries, week) => {
    if (entries.length >= 2 && entries.every((entry) => entry.points > 0)) complete.push(week);
  });
  return complete.sort((a, b) => a - b);
}

/**
 * All-play records for every team.
 *
 * `headToHeadWins` is the real record over the same weeks, supplied by the
 * caller because only it knows who actually played whom. Passing season totals
 * that include weeks this function excluded would make the luck figure compare
 * two different spans, which is why it is a parameter rather than something
 * inferred here.
 */
export function computeAllPlay(
  scores: WeekScore[],
  headToHeadWins: Map<number, number>,
): AllPlayRow[] {
  const weeks = new Set(playedWeeks(scores));
  const rosterIds = [...new Set(scores.map((score) => score.rosterId))].sort((a, b) => a - b);

  const wins = new Map(rosterIds.map((id) => [id, 0]));
  const losses = new Map(rosterIds.map((id) => [id, 0]));
  const ties = new Map(rosterIds.map((id) => [id, 0]));

  for (const week of weeks) {
    const entries = scores.filter((score) => score.week === week);
    for (const team of entries) {
      for (const other of entries) {
        if (other.rosterId === team.rosterId) continue;
        if (team.points > other.points) wins.set(team.rosterId, (wins.get(team.rosterId) ?? 0) + 1);
        else if (team.points < other.points) losses.set(team.rosterId, (losses.get(team.rosterId) ?? 0) + 1);
        else ties.set(team.rosterId, (ties.get(team.rosterId) ?? 0) + 1);
      }
    }
  }

  const weeksCounted = weeks.size;

  return rosterIds.map((rosterId) => {
    const w = wins.get(rosterId) ?? 0;
    const l = losses.get(rosterId) ?? 0;
    const t = ties.get(rosterId) ?? 0;
    const games = w + l + t;
    /* A tie is half a win, the same way it is in a real record. */
    const winPct = games > 0 ? (w + t / 2) / games : 0;
    const expectedWins = winPct * weeksCounted;
    const actualWins = headToHeadWins.get(rosterId) ?? 0;
    return {
      rosterId,
      allPlayWins: w,
      allPlayLosses: l,
      allPlayTies: t,
      allPlayWinPct: winPct,
      weeksCounted,
      expectedWins,
      actualWins,
      luck: actualWins - expectedWins,
    };
  });
}

/**
 * xW-L: the record your scoring earned, to one decimal.
 *
 * Rendered as a record rather than a single number so it can be read straight
 * against the real one — "6-2 actual, 5.0-3.0 expected" lands immediately in a
 * way "6-2" next to "5.0" does not.
 */
export function formatExpectedRecord(row: AllPlayRow): string {
  const losses = Math.max(0, row.weeksCounted - row.expectedWins);
  return `${row.expectedWins.toFixed(1)}-${losses.toFixed(1)}`;
}

/** "9-2" or "9-2-1". */
export function formatAllPlayRecord(row: AllPlayRow): string {
  return row.allPlayTies > 0
    ? `${row.allPlayWins}-${row.allPlayLosses}-${row.allPlayTies}`
    : `${row.allPlayWins}-${row.allPlayLosses}`;
}

/** "+1.8" / "-0.4" / "even". Sign is the whole point, so it is never dropped. */
export function formatLuck(luck: number): string {
  if (Math.abs(luck) < 0.05) return 'even';
  return `${luck > 0 ? '+' : '−'}${Math.abs(luck).toFixed(1)}`;
}

/**
 * One sentence a league-mate would repeat.
 *
 * Deliberately says what the schedule did rather than calling anyone lucky:
 * the same number reads as an accusation or an alibi depending on whose row it
 * is, and the neutral phrasing survives being screenshotted into a group chat.
 */
export function luckSentence(row: AllPlayRow, teamName: string): string {
  if (row.weeksCounted === 0) return 'No completed weeks yet.';
  const record = formatAllPlayRecord(row);
  if (Math.abs(row.luck) < 0.05) {
    return `${teamName} is ${record} against the whole league, and the schedule has been neutral.`;
  }
  const magnitude = Math.abs(row.luck).toFixed(1);
  return row.luck > 0
    ? `${teamName} is ${record} against the whole league, and the schedule is worth ${magnitude} extra wins.`
    : `${teamName} is ${record} against the whole league, and the schedule has cost ${magnitude} wins.`;
}
