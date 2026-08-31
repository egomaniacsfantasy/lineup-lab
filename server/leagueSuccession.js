/**
 * Which league replaced the one someone has connected.
 *
 * Sleeper gives a league a new id every season and threads them together with
 * previous_league_id. A dynasty league connected last year keeps answering for
 * ever with last year's rosters: nothing errors, it is a healthy response
 * about the wrong year. This walks the chain the other way round. Of the
 * leagues this user is in THIS season, which one traces back to the one they
 * have open?
 *
 * Its own module because the walk is the only part with anything to get
 * wrong, and inside a route handler it could not be tested without standing
 * up an HTTP server and a Sleeper.
 */

/* Usually the chain is one step: this season's league points straight at last
   season's. The bound is for a league connected several seasons ago, and it
   exists at all because a chain that loops back on itself must not become an
   unbounded walk across someone else's API. */
export const MAX_CHAIN = 6;

/**
 * @returns {{ successor: object|null, season: string, reason: string }}
 */
export async function findSuccessorLeague(provider, leagueId, userId) {
  if (provider.providerId !== 'sleeper') {
    /* ESPN keeps one league id across seasons and picks the year with a
       parameter, so there is no chain and it cannot go stale this way. */
    return { successor: null, season: null, reason: 'unsupported_provider' };
  }

  const [league, state] = await Promise.all([
    provider.getLeague(leagueId),
    provider.getSeasonState(),
  ]);
  if (!league) return { successor: null, season: null, reason: 'league_not_found' };

  const season = state?.season ?? null;
  if (String(league.season) === String(season)) {
    return { successor: null, season, reason: 'already_current' };
  }
  if (!userId) return { successor: null, season, reason: 'no_user' };

  const candidates = (await provider.getLeagues(userId, season)) ?? [];

  const reaches = async (startId) => {
    let id = startId;
    const walked = new Set();
    for (let step = 0; step < MAX_CHAIN && id; step += 1) {
      if (String(id) === String(leagueId)) return true;
      /* A league that lists itself, or two that list each other, would
         otherwise spin until the step bound saved us. Cheaper and clearer to
         notice we have been here. */
      if (walked.has(String(id))) return false;
      walked.add(String(id));
      const previous = await provider.getLeague(id);
      id = previous?.previousLeagueId ?? null;
    }
    return false;
  };

  for (const candidate of candidates) {
    if (await reaches(candidate.previousLeagueId)) {
      return { successor: candidate, season, reason: 'found' };
    }
  }

  /* The common answer in August: the commissioner has not created this
     season's league yet, so there is nothing to switch to and telling someone
     to reconnect sends them looking for a league that does not exist. */
  return { successor: null, season, reason: 'not_rolled_over' };
}
