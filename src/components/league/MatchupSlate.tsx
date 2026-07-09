import { formatAmericanOdds } from '../../utils/formatOdds';
import type { LeagueWeekMatchup } from '../../mocks/league';
import type { LineHistoryEntry } from '../../services/leagueApi';
import { leagueChartFlags } from '../../config/leagueChartFlags';
import { TeamAvatar } from './TeamAvatar';
import './MatchupSlate.css';

interface MatchupSlateProps {
  matchups: LeagueWeekMatchup[];
  currentWeek: number;
  history?: LineHistoryEntry[] | null;
}

function impliedProbability(odds: number) {
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }

  return 100 / (odds + 100);
}

function historyFor(matchup: LeagueWeekMatchup, history: LineHistoryEntry[] | null | undefined) {
  if (!leagueChartFlags.lineMovement || !history?.length || matchup.matchupId == null) return null;
  const entries = history
    .map((entry) => {
      const line = entry.lines.find((candidate) => candidate.matchupId === matchup.matchupId);
      const aSide = matchup.teamARosterId != null ? line?.sides[String(matchup.teamARosterId)] : null;
      const bSide = matchup.teamBRosterId != null ? line?.sides[String(matchup.teamBRosterId)] : null;
      if (!aSide || !bSide) return null;
      return {
        at: entry.computedAt,
        a: aSide.winProbability,
        b: bSide.winProbability,
        trigger: entry.trigger ?? 'reprice',
      };
    })
    .filter((entry): entry is { at: number; a: number; b: number; trigger: string } => entry !== null);
  return entries.length > 1 ? entries : null;
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function movementWindow(points: { at: number }[]) {
  const first = points[0]?.at;
  if (!first || !points.at(-1)?.at) return '';
  return `since ${timeLabel(first)}`;
}

function polylineFor(points: { at: number; value: number }[], width = 130, height = 40) {
  if (points.length === 0) return '';
  const minAt = Math.min(...points.map((point) => point.at));
  const maxAt = Math.max(...points.map((point) => point.at));
  const timeSpan = Math.max(1, maxAt - minAt);
  return points
    .map((point) => {
      const x = ((point.at - minAt) / timeSpan) * width;
      const y = height - (point.value / 100) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function MatchupSlate({ matchups, currentWeek, history = null }: MatchupSlateProps) {
  const ladderRows = matchups.map((matchup) => {
    const aProb = matchup.teamAWinProb ?? impliedProbability(matchup.teamAOdds) * 100;
    const bProb = matchup.teamBWinProb ?? impliedProbability(matchup.teamBOdds) * 100;
    return { matchup, aProb, bProb };
  });

  return (
    <section aria-labelledby="matchup-slate-title" className="matchup-slate">
      <div className="matchup-slate__header">
        <p className="matchup-slate__kicker">Week {currentWeek} matchups</p>
        <h2 className="matchup-slate__title" id="matchup-slate-title">
          Every game on your league board, priced
        </h2>
      </div>

      {leagueChartFlags.winProbLadder && ladderRows.length > 0 ? (
        <div className="matchup-slate__ladder" aria-label="This week win probability ladder">
          {ladderRows.map(({ matchup, aProb, bProb }) => (
            <div className="matchup-slate__ladder-row" key={`ladder-${matchup.teamA}-${matchup.teamB}`}>
              <TeamAvatar avatarUrl={matchup.teamAAvatarUrl} name={matchup.teamA} />
              <span className="matchup-slate__ladder-track">
                <span className="matchup-slate__ladder-fill" style={{ width: `${Math.max(0, Math.min(100, Math.max(aProb, bProb)))}%` }} />
              </span>
              <TeamAvatar avatarUrl={matchup.teamBAvatarUrl} name={matchup.teamB} />
              <span className="matchup-slate__ladder-number">{aProb.toFixed(1)}%</span>
              <span className="matchup-slate__ladder-number matchup-slate__ladder-number--right">{bProb.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="matchup-slate__rows">
        {matchups.map((matchup) => {
          const aProb = impliedProbability(matchup.teamAOdds);
          const bProb = impliedProbability(matchup.teamBOdds);
          const leftTeam =
            aProb >= bProb
              ? {
                  name: matchup.teamA,
                  record: matchup.teamARecord,
                  odds: matchup.teamAOdds,
                  avatarUrl: matchup.teamAAvatarUrl,
                }
              : {
                  name: matchup.teamB,
                  record: matchup.teamBRecord,
                  odds: matchup.teamBOdds,
                  avatarUrl: matchup.teamBAvatarUrl,
                };
          const rightTeam =
            aProb >= bProb
              ? {
                  name: matchup.teamB,
                  record: matchup.teamBRecord,
                  odds: matchup.teamBOdds,
                  avatarUrl: matchup.teamBAvatarUrl,
                }
              : {
                  name: matchup.teamA,
                  record: matchup.teamARecord,
                  odds: matchup.teamAOdds,
                  avatarUrl: matchup.teamAAvatarUrl,
                };
          const movement = historyFor(matchup, history);

          return (
            <article
              className={[
                'matchup-slate__row',
                matchup.isUserGame ? 'matchup-slate__row--user' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={`${matchup.teamA}-${matchup.teamB}`}
            >
              <div className="matchup-slate__team matchup-slate__team--left">
                {leagueChartFlags.avatars ? (
                  <TeamAvatar avatarUrl={leftTeam.avatarUrl} name={leftTeam.name} />
                ) : null}
                <span className="matchup-slate__team-name">{leftTeam.name}</span>
                <span className="matchup-slate__record">({leftTeam.record})</span>
              </div>

              <div className="matchup-slate__market">
                <span className="matchup-slate__odds">
                  {formatAmericanOdds(leftTeam.odds)}
                </span>
                <span className="matchup-slate__vs">vs</span>
                <span className="matchup-slate__odds">
                  {formatAmericanOdds(rightTeam.odds)}
                </span>
              </div>

              <div className="matchup-slate__team matchup-slate__team--right">
                <span className="matchup-slate__team-name">{rightTeam.name}</span>
                <span className="matchup-slate__record">({rightTeam.record})</span>
                {leagueChartFlags.avatars ? (
                  <TeamAvatar avatarUrl={rightTeam.avatarUrl} name={rightTeam.name} />
                ) : null}
              </div>

              {movement ? (
                <div className="matchup-slate__movement" aria-label={`${matchup.teamA} and ${matchup.teamB} line movement`}>
                  <svg viewBox="0 0 130 40" preserveAspectRatio="none">
                    <polyline className="matchup-slate__movement-line matchup-slate__movement-line--a" points={polylineFor(movement.map((entry) => ({ at: entry.at, value: entry.a })))} />
                    <polyline className="matchup-slate__movement-line matchup-slate__movement-line--b" points={polylineFor(movement.map((entry) => ({ at: entry.at, value: entry.b })))} />
                  </svg>
                  <span className="matchup-slate__movement-note">{movementWindow(movement)}</span>
                </div>
              ) : null}

              {matchup.isUserGame ? (
                <span className="matchup-slate__tag">Your game</span>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
