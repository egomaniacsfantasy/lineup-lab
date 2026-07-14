import { useMemo, useState } from 'react';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { isMaterialMove } from '../../utils/leagueMovement';
import type { LeagueWeekMatchup } from '../../mocks/league';
import type { LineHistoryEntry } from '../../services/leagueApi';
import { leagueChartFlags } from '../../config/leagueChartFlags';
import { LeagueMovementChip } from './LeagueMovementChip';
import { TeamAvatar } from './TeamAvatar';
import './MatchupSlate.css';

interface MatchupSlateProps {
  matchups: LeagueWeekMatchup[];
  currentWeek: number;
  history?: LineHistoryEntry[] | null;
}

type RawMovement = {
  at: number;
  a: number;
  b: number;
  trigger: string;
};

type BoardTeam = {
  side: 'a' | 'b';
  rosterId?: number;
  name: string;
  record: string;
  odds: number;
  winProb: number;
  projection?: number;
  avatarUrl?: string | null;
  isUser?: boolean;
};

function impliedProbability(odds: number) {
  if (odds < 0) {
    return (Math.abs(odds) / (Math.abs(odds) + 100)) * 100;
  }

  return (100 / (odds + 100)) * 100;
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
    .filter((entry): entry is RawMovement => entry !== null)
    .sort((left, right) => left.at - right.at);
  return entries.length > 1 ? entries : null;
}

function dayLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function closingByDay(points: RawMovement[]) {
  const byDay = new Map<string, RawMovement>();
  points.forEach((point) => {
    const key = new Date(point.at).toDateString();
    const current = byDay.get(key);
    if (!current || point.at > current.at) byDay.set(key, point);
  });
  return [...byDay.values()].sort((left, right) => left.at - right.at);
}

function valueForSide(point: RawMovement, side: 'a' | 'b') {
  return side === 'a' ? point.a : point.b;
}

function movementSummary(points: RawMovement[] | null, leftSide: 'a' | 'b') {
  if (!points) return null;
  const latest = points.at(-1);
  if (!latest) return null;
  const sameDay = points.filter(
    (point) => new Date(point.at).toDateString() === new Date(latest.at).toDateString(),
  );
  const open = sameDay[0];
  if (!open || sameDay.length < 2) return null;

  const biggest = sameDay.reduce<{ point: RawMovement; move: number } | null>((current, point) => {
    const move = valueForSide(point, leftSide) - valueForSide(open, leftSide);
    if (!current || Math.abs(move) > Math.abs(current.move)) return { point, move };
    return current;
  }, null);

  if (!biggest || !isMaterialMove(biggest.move)) return null;
  return biggest;
}

function hasMaterialHistory(points: RawMovement[] | null, side: 'a' | 'b') {
  if (!points || points.length < 2) return false;
  const values = points.map((point) => valueForSide(point, side));
  return isMaterialMove(Math.max(...values) - Math.min(...values));
}

function movementLine(points: RawMovement[], side: 'a' | 'b') {
  if (points.length === 0) return '';
  const minAt = Math.min(...points.map((point) => point.at));
  const maxAt = Math.max(...points.map((point) => point.at));
  const timeSpan = Math.max(1, maxAt - minAt);
  return points
    .map((point) => {
      const x = ((point.at - minAt) / timeSpan) * 100;
      const y = 100 - valueForSide(point, side);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function materialEvents(points: RawMovement[], side: 'a' | 'b') {
  const events: { point: RawMovement; move: number }[] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (!previous) return;
    const move = valueForSide(point, side) - valueForSide(previous, side);
    if (isMaterialMove(move)) events.push({ point, move });
  });
  return events;
}

function teamsFor(matchup: LeagueWeekMatchup) {
  const teamA: BoardTeam = {
    side: 'a',
    rosterId: matchup.teamARosterId,
    name: matchup.teamA,
    record: matchup.teamARecord,
    odds: matchup.teamAOdds,
    winProb: matchup.teamAWinProb ?? impliedProbability(matchup.teamAOdds),
    projection: matchup.teamAProjection,
    avatarUrl: matchup.teamAAvatarUrl,
    isUser: matchup.teamAIsUser,
  };
  const teamB: BoardTeam = {
    side: 'b',
    rosterId: matchup.teamBRosterId,
    name: matchup.teamB,
    record: matchup.teamBRecord,
    odds: matchup.teamBOdds,
    winProb: matchup.teamBWinProb ?? impliedProbability(matchup.teamBOdds),
    projection: matchup.teamBProjection,
    avatarUrl: matchup.teamBAvatarUrl,
    isUser: matchup.teamBIsUser,
  };

  if (matchup.isUserGame) {
    return teamA.isUser || (!teamA.isUser && !teamB.isUser)
      ? { left: teamA, right: teamB }
      : { left: teamB, right: teamA };
  }

  return teamA.winProb >= teamB.winProb ? { left: teamA, right: teamB } : { left: teamB, right: teamA };
}

export function MatchupSlate({ matchups, currentWeek, history = null }: MatchupSlateProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      matchups
        .map((matchup) => {
          const teams = teamsFor(matchup);
          const movement = historyFor(matchup, history);
          const summary = movementSummary(movement, teams.left.side);
          return {
            matchup,
            movement,
            summary,
            ...teams,
          };
        })
        .sort((left, right) => {
          if (left.matchup.isUserGame !== right.matchup.isUserGame) return left.matchup.isUserGame ? -1 : 1;
          return right.left.winProb - left.left.winProb;
        }),
    [matchups, history],
  );

  return (
    <section aria-labelledby="matchup-slate-title" className="matchup-slate">
      <div className="matchup-slate__header">
        <p className="matchup-slate__kicker">Week {currentWeek} matchups</p>
        <h2 className="matchup-slate__title" id="matchup-slate-title">
          This week's board
        </h2>
      </div>

      <div className="matchup-slate__rows">
        {rows.map(({ matchup, left, right, movement, summary }) => {
          const rowKey = `${matchup.matchupId ?? left.name}-${right.name}`;
          const expanded = expandedKey === rowKey;
          const leftFavored = left.winProb >= right.winProb;
          const detailClosings = movement ? closingByDay(movement) : [];
          const eventRows = movement ? materialEvents(movement, left.side) : [];
          const showMovementDetail = hasMaterialHistory(movement, left.side) && detailClosings.length > 1;

          return (
            <article
              className={[
                'matchup-slate__row',
                matchup.isUserGame ? 'matchup-slate__row--user' : '',
                expanded ? 'matchup-slate__row--expanded' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={rowKey}
            >
              <button
                aria-expanded={expanded}
                className="matchup-slate__row-button"
                onClick={() => setExpandedKey(expanded ? null : rowKey)}
                type="button"
              >
                <span className="matchup-slate__team matchup-slate__team--left">
                  {leagueChartFlags.avatars ? <TeamAvatar avatarUrl={left.avatarUrl} name={left.name} /> : null}
                  <span className="matchup-slate__team-copy">
                    <span className={['matchup-slate__team-name', leftFavored ? 'matchup-slate__team-name--favored' : 'matchup-slate__team-name--dog'].join(' ')}>
                      {left.name}
                    </span>
                    <span className="matchup-slate__record">{left.record}</span>
                  </span>
                </span>

                <span className="matchup-slate__moneyline">
                  <span className={['matchup-slate__odds', leftFavored ? 'matchup-slate__odds--favored' : 'matchup-slate__odds--dog'].join(' ')}>
                    {formatAmericanOdds(left.odds)}
                  </span>
                </span>

                <span className="matchup-slate__prob">
                  <span className="matchup-slate__prob-number">{left.winProb.toFixed(1)}%</span>
                  <span className="matchup-slate__prob-track" aria-hidden="true">
                    <span className="matchup-slate__prob-fill matchup-slate__prob-fill--left" style={{ width: `${left.winProb}%` }} />
                  </span>
                  <span className="matchup-slate__prob-number">{right.winProb.toFixed(1)}%</span>
                </span>

                <span className="matchup-slate__moneyline matchup-slate__moneyline--right">
                  <span className={['matchup-slate__odds', !leftFavored ? 'matchup-slate__odds--favored' : 'matchup-slate__odds--dog'].join(' ')}>
                    {formatAmericanOdds(right.odds)}
                  </span>
                </span>

                <span className="matchup-slate__team matchup-slate__team--right">
                  <span className="matchup-slate__team-copy">
                    <span className={['matchup-slate__team-name', !leftFavored ? 'matchup-slate__team-name--favored' : 'matchup-slate__team-name--dog'].join(' ')}>
                      {right.name}
                    </span>
                    <span className="matchup-slate__record">{right.record}</span>
                  </span>
                  {leagueChartFlags.avatars ? <TeamAvatar avatarUrl={right.avatarUrl} name={right.name} /> : null}
                </span>

                <span className="matchup-slate__extras">
                  {matchup.isUserGame ? <span className="matchup-slate__tag">YOUR GAME</span> : null}
                  {summary ? (
                    <LeagueMovementChip className="matchup-slate__move-chip" move={summary.move} timeframe="today" />
                  ) : null}
                </span>
              </button>

              {expanded ? (
                <div className="matchup-slate__detail">
                  {left.projection != null || right.projection != null ? (
                    <div className="matchup-slate__detail-line">
                      <span>Projected points</span>
                      <span>
                        {left.name} {left.projection?.toFixed(1) ?? 'N/A'} · {right.name} {right.projection?.toFixed(1) ?? 'N/A'}
                      </span>
                    </div>
                  ) : null}

                  {showMovementDetail ? (
                    <>
                      <div className="matchup-slate__detail-chart">
                        <span className="matchup-slate__detail-axis matchup-slate__detail-axis--top">100%</span>
                        <span className="matchup-slate__detail-axis matchup-slate__detail-axis--mid">50%</span>
                        <span className="matchup-slate__detail-axis matchup-slate__detail-axis--bottom">0%</span>
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                          {[0, 50, 100].map((tick) => (
                            <line
                              className="matchup-slate__movement-grid"
                              key={`grid-${rowKey}-${tick}`}
                              x1="0"
                              x2="100"
                              y1={100 - tick}
                              y2={100 - tick}
                            />
                          ))}
                          <polyline
                            className="matchup-slate__movement-line"
                            points={movementLine(detailClosings, left.side)}
                          />
                          {detailClosings.map((point) => (
                            <circle
                              className="matchup-slate__movement-dot"
                              cx={detailClosings.length <= 1 ? 0 : ((point.at - detailClosings[0].at) / Math.max(1, detailClosings.at(-1)!.at - detailClosings[0].at)) * 100}
                              cy={100 - valueForSide(point, left.side)}
                              key={`dot-${rowKey}-${point.at}`}
                              r="1.8"
                            >
                              <title>
                                {dayLabel(point.at)} close: {left.name} {valueForSide(point, left.side).toFixed(1)}%
                              </title>
                            </circle>
                          ))}
                        </svg>
                        <span className="matchup-slate__x-labels">
                          {detailClosings.map((point) => (
                            <span key={`label-${rowKey}-${point.at}`}>{dayLabel(point.at)}</span>
                          ))}
                        </span>
                      </div>
                      <details className="matchup-slate__events">
                        <summary>Reprice history</summary>
                        {eventRows.length > 0 ? (
                          <div className="matchup-slate__event-list">
                            {eventRows.map(({ point, move }) => (
                              <div className="matchup-slate__event-row" key={`event-${rowKey}-${point.at}`}>
                                <span>{dayLabel(point.at)} {timeLabel(point.at)}</span>
                                <span>
                                  {left.name} {move >= 0 ? '+' : ''}
                                  {move.toFixed(1)}
                                </span>
                                <span>{point.trigger}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="matchup-slate__movement-note">No material reprices.</p>
                        )}
                      </details>
                    </>
                  ) : (
                    <p className="matchup-slate__movement-note">The line hasn't moved.</p>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
