/**
 * Season anchors — THE single source for kickoff dates. Every rendered
 * date traces back here (served to the client via /api/state).
 *
 * 2026 NFL kickoff is WEDNESDAY, September 9, 2026 (Seahawks host the
 * Patriots, 8:20 PM ET — Super Bowl 60 rematch, unusual Wednesday
 * opener; do not "correct" it to Thursday). First Sunday slate is
 * September 13, 2026.
 */
export const SEASON_ANCHORS = {
  season: '2026',
  kickoffIso: '2026-09-09T20:20:00-04:00',
  kickoffLabel: 'Wednesday, September 9, 2026',
  kickoffShort: 'September 9',
  kickoffWeekday: 'Wednesday',
  firstSundayIso: '2026-09-13',
  firstSundayLabel: 'Sunday, September 13, 2026',
};

/**
 * Season state is COMPUTED from Sleeper /state/nfl (+ the league's
 * playoff settings), never chosen by the user.
 *
 * @returns 'OFFSEASON' | 'IN_SEASON' | 'LEAGUE_PLAYOFFS' | 'COMPLETE'
 */
export function computeSeasonState(state, league = null) {
  const seasonType = state?.seasonType ?? state?.season_type ?? 'off';
  const week = state?.week ?? 0;

  if (seasonType === 'regular') {
    const playoffStart = league?.playoffWeekStart ?? 15;
    if (week >= playoffStart) return 'LEAGUE_PLAYOFFS';
    if (week >= 1) return 'IN_SEASON';
    return 'OFFSEASON';
  }

  if (seasonType === 'post') {
    // NFL playoffs: the fantasy regular season + league playoffs are over.
    return 'COMPLETE';
  }

  // 'off' and 'pre' are both the pre-kickoff world.
  return 'OFFSEASON';
}
