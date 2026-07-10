import { useState } from 'react';
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

function pointXFor(timestamp: number, points: { at: number }[], width = 130) {
  const minAt = Math.min(...points.map((point) => point.at));
  const maxAt = Math.max(...points.map((point) => point.at));
  const timeSpan = Math.max(1, maxAt - minAt);
  return ((timestamp - minAt) / timeSpan) * width;
}

function movementTakeaway(matchup: LeagueWeekMatchup, points: { a: number; b: number }[]) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return 'No move yet.';
  const aMove = last.a - first.a;
  const bMove = last.b - first.b;
  const aAbs = Math.abs(aMove);
  const bAbs = Math.abs(bMove);
  const team = aAbs >= bAbs ? matchup.teamA : matchup.teamB;
  const move = aAbs >= bAbs ? aMove : bMove;
  if (Math.abs(move) < 0.05) return 'Line held steady.';
  return `${team} moved ${move > 0 ? 'up' : 'down'} ${Math.abs(move).toFixed(1)} pts.`;
}

export function MatchupSlate({ matchups, currentWeek, history = null }: MatchupSlateProps) {
  const [expandedMatchup, setExpandedMatchup] = useState<{
    matchup: LeagueWeekMatchup;
    movement: NonNullable<ReturnType<typeof historyFor>>;
  } | null>(null);
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
                <button
                  className="matchup-slate__movement"
                  aria-label={`${matchup.teamA} and ${matchup.teamB} line movement`}
                  onClick={() => setExpandedMatchup({ matchup, movement })}
                  type="button"
                >
                  <span className="matchup-slate__movement-head">
                    <span>
                      <span className="matchup-slate__movement-title">Line movement</span>
                      <span className="matchup-slate__movement-subtitle">Win probability across reprices.</span>
                    </span>
                    <span className="matchup-slate__inspect">Inspect</span>
                  </span>
                  <svg viewBox="0 0 130 40" preserveAspectRatio="none">
                    {[25, 50, 75].map((tick) => (
                      <line className="matchup-slate__movement-grid" key={`grid-${tick}`} x1="0" x2="130" y1={40 - (tick / 100) * 40} y2={40 - (tick / 100) * 40} />
                    ))}
                    <polyline className="matchup-slate__movement-line matchup-slate__movement-line--a" points={polylineFor(movement.map((entry) => ({ at: entry.at, value: entry.a })))} />
                    <polyline className="matchup-slate__movement-line matchup-slate__movement-line--b" points={polylineFor(movement.map((entry) => ({ at: entry.at, value: entry.b })))} />
                  </svg>
                  <span className="matchup-slate__movement-axis">
                    <span>0%</span>
                    <span>Win prob</span>
                    <span>100%</span>
                  </span>
                  <span className="matchup-slate__movement-note">{movementWindow(movement)} · {movementTakeaway(matchup, movement)}</span>
                </button>
              ) : null}

              {matchup.isUserGame ? (
                <span className="matchup-slate__tag">Your game</span>
              ) : null}
            </article>
          );
        })}
      </div>
      {expandedMatchup ? (
        <div
          aria-modal="true"
          className="matchup-slate__modal"
          onClick={() => setExpandedMatchup(null)}
          role="dialog"
        >
          <div className="matchup-slate__modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="matchup-slate__modal-close" onClick={() => setExpandedMatchup(null)} type="button">
              Close
            </button>
            <h3 className="matchup-slate__modal-title">Line movement</h3>
            <p className="matchup-slate__movement-subtitle">
              X-axis is reprice time. Y-axis is win probability.
            </p>
            <div className="matchup-slate__movement-chart">
              <span className="matchup-slate__detail-axis matchup-slate__detail-axis--y">Win probability</span>
              <svg viewBox="0 0 130 100" preserveAspectRatio="none">
                {[25, 50, 75].map((tick) => (
                  <line className="matchup-slate__movement-grid" key={`modal-grid-${tick}`} x1="0" x2="130" y1={100 - tick} y2={100 - tick} />
                ))}
                <polyline className="matchup-slate__movement-line matchup-slate__movement-line--a" points={polylineFor(expandedMatchup.movement.map((entry) => ({ at: entry.at, value: entry.a })), 130, 100)} />
                <polyline className="matchup-slate__movement-line matchup-slate__movement-line--b" points={polylineFor(expandedMatchup.movement.map((entry) => ({ at: entry.at, value: entry.b })), 130, 100)} />
                {expandedMatchup.movement.map((entry) => (
                  <circle className="matchup-slate__movement-dot" cx={pointXFor(entry.at, expandedMatchup.movement)} cy={100 - entry.a} key={`dot-a-${entry.at}`} r="1.7" />
                ))}
                {expandedMatchup.movement.map((entry) => (
                  <circle className="matchup-slate__movement-dot matchup-slate__movement-dot--b" cx={pointXFor(entry.at, expandedMatchup.movement)} cy={100 - entry.b} key={`dot-b-${entry.at}`} r="1.7" />
                ))}
              </svg>
              <span className="matchup-slate__detail-axis matchup-slate__detail-axis--x">Reprice time</span>
            </div>
            <div className="matchup-slate__legend">
              <span><TeamAvatar avatarUrl={expandedMatchup.matchup.teamAAvatarUrl} name={expandedMatchup.matchup.teamA} /> {expandedMatchup.matchup.teamA}</span>
              <span><TeamAvatar avatarUrl={expandedMatchup.matchup.teamBAvatarUrl} name={expandedMatchup.matchup.teamB} /> {expandedMatchup.matchup.teamB}</span>
            </div>
            <div className="matchup-slate__event-list">
              {expandedMatchup.movement.map((entry) => (
                <div className="matchup-slate__event-row" key={`event-${entry.at}`}>
                  <span>{timeLabel(entry.at)}</span>
                  <span>{expandedMatchup.matchup.teamA} {entry.a.toFixed(1)}% · {expandedMatchup.matchup.teamB} {entry.b.toFixed(1)}%</span>
                  <span>{entry.trigger}</span>
                </div>
              ))}
            </div>
            <p className="matchup-slate__movement-note">{movementTakeaway(expandedMatchup.matchup, expandedMatchup.movement)}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
