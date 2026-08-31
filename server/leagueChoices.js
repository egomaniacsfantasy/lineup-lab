/**
 * Which of somebody's leagues to actually offer them.
 *
 * The lookup asks Sleeper for BOTH this season and last, on purpose: in the
 * off-season Sleeper's idea of the current season can lag the season a league
 * you just joined is filed under, so asking only for the current one can come
 * back empty for somebody who plainly has leagues.
 *
 * That merge is right and it produced a bad result, because Sleeper does not
 * roll a dynasty league forward. Each season is a NEW league with its own id
 * and the same name, so a dynasty manager saw their league listed twice, a year
 * apart, identical on screen, with no way to tell which one was this year. Pick
 * the wrong one and every number in the product is a year out of date.
 *
 * Two passes, in this order:
 *
 *   1. Drop any league that another league in the list replaced. previous_league_id
 *      is the thread, and both ends of it are already in hand, so this costs
 *      nothing and is exact: it collapses a chain to its newest link rather
 *      than guessing from names or seasons.
 *
 *   2. Then, if anything is left from the current season, show only that.
 *
 * Step 2 is the blunt rule and step 1 is why it is safe. On its own, "hide
 * everything that is not this season" would resurrect the off-season problem
 * the merge exists to solve, so it only applies when there is a current-season
 * league to show. Somebody whose leagues are all still filed under last season
 * sees them, which is better than an empty list, and the stale-season notice
 * takes it from there.
 */
export function visibleLeagues(leagues, currentSeason) {
  const all = Array.isArray(leagues) ? leagues : [];

  const superseded = new Set(
    all
      .map((league) => league?.previousLeagueId)
      .filter(Boolean)
      .map(String),
  );

  const newest = all.filter((league) => !superseded.has(String(league?.id)));

  const current = newest.filter(
    (league) => currentSeason != null && String(league?.season) === String(currentSeason),
  );

  return current.length > 0 ? current : newest;
}
