import type { FantasyProvider } from './provider';

/**
 * The league as its own platform shows it.
 *
 * Lived inside MatchupPage as a local helper, which meant every other surface
 * that wanted to send someone back to ESPN or Sleeper either had no link or
 * grew its own copy of the URL shapes.
 */
export function officialLeagueUrl({
  provider,
  leagueId,
  season,
  espnTeamId,
}: {
  provider: FantasyProvider;
  leagueId: string;
  season?: string;
  espnTeamId?: number | null;
}) {
  if (provider === 'sleeper') return `https://sleeper.com/leagues/${leagueId}`;

  const seasonId = season ?? String(new Date().getFullYear());
  const base = 'https://fantasy.espn.com/football';
  if (espnTeamId != null) {
    return `${base}/team?leagueId=${encodeURIComponent(leagueId)}&teamId=${espnTeamId}&seasonId=${encodeURIComponent(seasonId)}`;
  }
  return `${base}/league?leagueId=${encodeURIComponent(leagueId)}&seasonId=${encodeURIComponent(seasonId)}`;
}
