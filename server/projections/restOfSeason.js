/**
 * Rest-of-season points for the rankings board.
 *
 * A player's headline value should reflect only the games STILL TO COME: as weeks
 * are played, they drop out of the total. It is per-team, not per-league — once a
 * team's current-week game is final, that week is "played" for its players while
 * everyone else still counts it (a Thursday game finishing puts those players a
 * week ahead of the rest of the league). In-progress games stay counted until
 * final. Off-season / pre-kickoff (currentWeek == null) nothing has elapsed, so
 * rest-of-season equals the full-season total and the board is unchanged.
 */

/** Points from the weeks a player has already PLAYED: every week before the
 *  current one, plus the current week itself only if the player's team is final.
 *  `weekly` is a { "<week>": points } map. */
export function elapsedPoints(weekly, currentWeek, teamFinal) {
  if (currentWeek == null || !weekly) return 0;
  let elapsed = 0;
  for (const [wk, pts] of Object.entries(weekly)) {
    const w = Number(wk);
    if (!Number.isFinite(w)) continue;
    if (w < currentWeek || (w === currentWeek && teamFinal)) elapsed += Number(pts) || 0;
  }
  return elapsed;
}

/** Full-season total minus what's already been played. Returns null when the
 *  full total is null; never negative. */
export function restOfSeasonPoints(seasonTotalFull, weekly, currentWeek, teamFinal) {
  if (seasonTotalFull == null) return null;
  const elapsed = elapsedPoints(weekly, currentWeek, teamFinal);
  return Math.max(0, Number((seasonTotalFull - elapsed).toFixed(2)));
}
