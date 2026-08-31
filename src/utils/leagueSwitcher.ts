/**
 * Where the league name can take you.
 *
 * Pulled out of the phone Hub because it is the only part of that switcher
 * with anything to get wrong, and because it could not be tested where it was:
 * the design fixture builds its league list from the one stored connection, so
 * a rendered test can only ever see an account with a single league. A guard
 * for the multi-league case written there would have passed for ever without
 * exercising a line of it.
 */

export interface SwitchableLeague {
  provider: 'sleeper' | 'espn';
  leagueId: string;
  leagueName?: string;
}

/**
 * The leagues worth offering, which is every one except the open one.
 *
 * Keyed by provider AND id, because the two providers mint ids independently
 * and nothing says an ESPN league cannot share a string with a Sleeper one.
 * Comparing ids alone would hide a real league behind an unrelated match.
 */
export function switchableLeagues<T extends SwitchableLeague>(
  leagues: T[] | null | undefined,
  active: SwitchableLeague | null | undefined,
): T[] {
  if (!Array.isArray(leagues)) return [];
  if (!active) return leagues;
  return leagues.filter(
    (league) =>
      league.provider !== active.provider || league.leagueId !== active.leagueId,
  );
}

/**
 * Is the league name a control, or just a label?
 *
 * A lone league dressed as a menu is a promise the screen cannot keep: it
 * opens onto nothing, which reads as broken rather than as empty.
 */
export function canSwitchLeagues(
  leagues: SwitchableLeague[] | null | undefined,
  active: SwitchableLeague | null | undefined,
): boolean {
  return switchableLeagues(leagues, active).length > 0;
}
