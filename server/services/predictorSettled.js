/**
 * Weeks that are over but not yet in the standings.
 *
 * A provider settles a finished week into each team's record some time after
 * the last game ends, and the app moves on to the next week before that. For
 * that stretch the finished week is in neither place the Predictor counts:
 * not in the records, and not among the games left to call. Every team reads
 * one game short.
 *
 * The league context already fetches those weeks' final matchups so the sim
 * can pin them (`priorFinalMatchups`). This reshapes the same rows into
 * results the Predictor can show as final and force, at their real scores.
 * Display plumbing only: nothing is priced here.
 *
 * @param {Record<string, Array<{matchupId: number|null, rosterId: number|string, points?: number}>>} priorFinalMatchups
 * @returns {Array<{week: number, matchupId: number, sides: Array<{rosterId: string, points: number}>}>}
 */
export function settledResults(priorFinalMatchups) {
  const out = [];
  for (const [week, rows] of Object.entries(priorFinalMatchups ?? {})) {
    const byMatchup = new Map();
    for (const row of rows ?? []) {
      if (row?.matchupId == null) continue;            // a fantasy bye week
      byMatchup.set(row.matchupId, [...(byMatchup.get(row.matchupId) ?? []), row]);
    }
    for (const [matchupId, pair] of byMatchup) {
      if (pair.length !== 2) continue;
      const sides = pair.map((row) => ({ rosterId: String(row.rosterId), points: Number(row.points) }));
      if (sides.some((side) => !Number.isFinite(side.points))) continue;
      out.push({ week: Number(week), matchupId: Number(matchupId), sides });
    }
  }
  return out.sort((a, b) => a.week - b.week || a.matchupId - b.matchupId);
}
