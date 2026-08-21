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
 * The fantasy week to price.
 *
 * Sleeper's /state/nfl reports the NFL's week, and during August that is a
 * PRESEASON week: right now it answers week 2, season_type "pre", leg 0. That
 * number was being used to index the league's own schedule, so the hub priced
 * fantasy week 2 while fantasy week 1 had not been played, and the title-odds
 * chart drew a decline across two weeks nobody had played.
 *
 * Preseason and off-season both price week 1, which is the next week that
 * will actually score. The regular season indexes normally.
 */
export function resolveFantasyWeek(state) {
  const seasonType = state?.seasonType ?? state?.season_type ?? 'off';
  if (seasonType !== 'regular' && seasonType !== 'post') return 1;
  const raw = state?.displayWeek ?? state?.week ?? 1;
  return Math.max(1, Math.min(raw, 18));
}

/** True while the NFL has not started the regular season. */
export function isPreseason(state) {
  const seasonType = state?.seasonType ?? state?.season_type ?? 'off';
  return seasonType !== 'regular' && seasonType !== 'post';
}

/**
 * Season state is COMPUTED from Sleeper /state/nfl (+ the league's
 * playoff settings), never chosen by the user.
 *
 * There is NO off-season state: before kickoff everyone lives in the
 * Week 1 view. The board prices Week 1 the moment projections exist.
 *
 * @returns 'IN_SEASON' | 'LEAGUE_PLAYOFFS' | 'COMPLETE'
 */
export function computeSeasonState(state, league = null) {
  const seasonType = state?.seasonType ?? state?.season_type ?? 'off';
  const week = state?.week ?? 0;

  if (seasonType === 'regular') {
    const playoffStart = league?.playoffWeekStart ?? 15;
    if (week >= playoffStart) return 'LEAGUE_PLAYOFFS';
    return 'IN_SEASON';
  }

  if (seasonType === 'post') {
    // NFL playoffs: the fantasy regular season + league playoffs are over.
    return 'COMPLETE';
  }

  // 'off' and 'pre' both resolve to the Week 1 view.
  return 'IN_SEASON';
}
