import type { LeagueBootstrap } from '../services/leagueApi';

/**
 * A league that has not drafted.
 *
 * Everything the Hub prices is derived from a roster, so before a draft the
 * whole page is arithmetic on zero: 0.0 projected points, +100 against +100,
 * a 50/50 win bar, an empty bench described as "no bench options this week",
 * and a market that, with every player in the league unrostered, will happily
 * suggest claiming Bijan Robinson for +48.5%. None of it is wrong exactly —
 * it is all a correct answer to a question nobody has asked yet.
 *
 * Two tests, because either one alone lies. `status` comes straight from the
 * provider and is authoritative when it is set, but ESPN infers it from the
 * current matchup period and a league that is mid-draft or freshly drafted can
 * disagree with itself. Empty rosters are the ground truth the pricing
 * actually depends on.
 */
export function isLeaguePreDraft(bootstrap: {
  league: Pick<LeagueBootstrap['league'], 'status'>;
  teams: { players: string[] }[];
}) {
  if (bootstrap.teams.length === 0) return false;
  return (
    bootstrap.league.status === 'pre_draft' ||
    bootstrap.teams.every((team) => team.players.length === 0)
  );
}

/** "Sunday, August 30 at 8:00 PM" — null when the provider gave us nothing. */
export function formatDraftTime(draftAt: number | null | undefined) {
  if (!draftAt || !Number.isFinite(draftAt)) return null;
  const when = new Date(draftAt);
  if (Number.isNaN(when.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(when);
}
