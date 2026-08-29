import type { LeagueBootstrap } from '../services/leagueApi.ts';

/**
 * What a connected league can and cannot be asked.
 *
 * One place, because the answer was being worked out in five: the header, the
 * tab bar, the trade page, the Hub's deals module and a labs toggle. Four of
 * them agreed and the fifth did not, which is how a dynasty league ended up
 * with no Trades tab and a trade module on its Hub anyway.
 */

/**
 * Trades are a redraft feature.
 *
 * In a dynasty or keeper league the assets are not just this year's roster:
 * draft picks, and players valued for seasons the sim does not run, are half
 * of what changes hands. The engine prices a rest-of-season, so every number
 * it puts on a dynasty trade is answering a question nobody in that league is
 * asking. A wrong price offered confidently is worse than no price.
 *
 * This used to be escapable with a labs flag, which is exactly how the broken
 * surface got in front of people: the flag was on. When dynasty trades are
 * genuinely priced, this becomes a real capability rather than a toggle.
 */
export function tradesSupported(bootstrap: LeagueBootstrap | null | undefined): boolean {
  if (!bootstrap) return false;
  return bootstrap.league.leagueType === 'redraft';
}

/**
 * Is this league from a season that has already finished?
 *
 * Sleeper gives a dynasty league a NEW league id every season and chains them
 * with previous_league_id. A league connected last year therefore keeps
 * answering for ever, with last year's rosters, last year's records and
 * prices built on both. Nothing about it errors: it is a perfectly healthy
 * response to a question about the wrong year.
 *
 * The league's own season against the provider's current one is the whole
 * test, and both already arrive on the bootstrap.
 */
export function connectedSeasonIsStale(bootstrap: LeagueBootstrap | null | undefined): boolean {
  if (!bootstrap) return false;
  const league = bootstrap.league.season;
  const now = bootstrap.state?.season;
  if (!league || !now) return false;
  return String(league) !== String(now);
}
