import { useMemo, useState, type CSSProperties } from 'react';
import type { ScoringFormat } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { isMaterialMove } from '../../utils/leagueMovement';
import type { LeagueFutureRow } from '../../mocks/league';
import type { LineHistoryEntry } from '../../services/leagueApi';
import { leagueChartFlags } from '../../config/leagueChartFlags';
import { LeagueMovementChip } from './LeagueMovementChip';
import { TeamAvatar } from './TeamAvatar';
import './LeagueFutures.css';

interface LeagueFuturesProps {
  futures: LeagueFutureRow[];
  leagueName: string;
  totalTeams: number;
  scoringFormat: ScoringFormat;
  currentWeek: number;
  mode: 'preseason' | 'inseason';
  playoffTeams?: number;
  history?: LineHistoryEntry[] | null;
}

type ChartMarket = 'title' | 'playoff';

const CHART_OPTIONS: { label: string; value: ChartMarket }[] = [
  { label: 'Title odds', value: 'title' },
  { label: 'Playoff odds', value: 'playoff' },
];

function formatScoring(scoringFormat: ScoringFormat) {
  return scoringFormat === 'half-ppr' ? 'Half PPR' : scoringFormat.toUpperCase();
}

function impliedProbability(odds: number) {
  if (!Number.isFinite(odds)) return 1;
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }

  return 100 / (odds + 100);
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toDateString();
}

function dayLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function rawSeriesFor(
  team: LeagueFutureRow,
  history: LineHistoryEntry[] | null | undefined,
  chartMarket: ChartMarket,
) {
  if (!team.rosterId || !history?.length) return [];
  const rosterId = String(team.rosterId);
  return history
    .map((entry) => {
      const rawProb = (chartMarket === 'playoff' ? entry.playoffProb : entry.titleProb)?.[rosterId];
      if (rawProb == null) return null;
      return {
        at: entry.computedAt,
        probability: Math.max(0, Math.min(100, rawProb)),
      };
    })
    .filter((entry): entry is { at: number; probability: number } => entry !== null)
    .sort((left, right) => left.at - right.at);
}

function closingSeriesFor(
  team: LeagueFutureRow,
  history: LineHistoryEntry[] | null | undefined,
  chartMarket: ChartMarket,
) {
  const byDay = new Map<string, { at: number; probability: number }>();
  rawSeriesFor(team, history, chartMarket).forEach((point) => {
    const key = dayKey(point.at);
    const current = byDay.get(key);
    if (!current || point.at > current.at) byDay.set(key, point);
  });
  return [...byDay.values()].sort((left, right) => left.at - right.at);
}

function chartLine(points: { at: number; probability: number }[], bounds: { minAt: number; maxAt: number; minValue: number; maxValue: number }) {
  const timeSpan = Math.max(1, bounds.maxAt - bounds.minAt);
  const valueSpan = Math.max(1, bounds.maxValue - bounds.minValue);
  return points
    .map((point) => {
      const x = ((point.at - bounds.minAt) / timeSpan) * 100;
      const y = 100 - ((point.probability - bounds.minValue) / valueSpan) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function yFor(value: number, bounds: { minValue: number; maxValue: number }) {
  const valueSpan = Math.max(1, bounds.maxValue - bounds.minValue);
  return 100 - ((value - bounds.minValue) / valueSpan) * 100;
}

function xFor(timestamp: number, bounds: { minAt: number; maxAt: number }) {
  const timeSpan = Math.max(1, bounds.maxAt - bounds.minAt);
  return ((timestamp - bounds.minAt) / timeSpan) * 100;
}

function envelopePath(
  rows: { team: LeagueFutureRow; series: { at: number; probability: number }[] }[],
  bounds: { minAt: number; maxAt: number; minValue: number; maxValue: number },
) {
  const days = new Map<string, { at: number; values: number[] }>();
  rows.forEach(({ series }) => {
    series.forEach((point) => {
      const key = dayKey(point.at);
      const bucket = days.get(key) ?? { at: point.at, values: [] };
      bucket.at = Math.max(bucket.at, point.at);
      bucket.values.push(point.probability);
      days.set(key, bucket);
    });
  });
  const ordered = [...days.values()].sort((left, right) => left.at - right.at);
  if (ordered.length < 2) return '';
  const top = ordered.map((day) => `${xFor(day.at, bounds).toFixed(1)},${yFor(Math.max(...day.values), bounds).toFixed(1)}`);
  const bottom = ordered
    .slice()
    .reverse()
    .map((day) => `${xFor(day.at, bounds).toFixed(1)},${yFor(Math.min(...day.values), bounds).toFixed(1)}`);
  return [...top, ...bottom].join(' ');
}

function movementFor(series: { probability: number }[]) {
  const first = series[0]?.probability;
  const last = series.at(-1)?.probability;
  if (first == null || last == null) return null;
  const move = last - first;
  return isMaterialMove(move) ? move : null;
}

function recentSeriesFor(series: { at: number; probability: number }[]) {
  const latest = series.at(-1);
  if (!latest) return series;
  const trailingWindow = latest.at - 6 * 24 * 60 * 60 * 1000;
  const recent = series.filter((point) => point.at >= trailingWindow);
  return recent.length > 1 ? recent : series;
}

function historyTakeaway(rows: { team: LeagueFutureRow; series: { probability: number }[] }[], userTeam?: LeagueFutureRow | null) {
  const leader = rows
    .map(({ team, series }) => ({ team, last: series.at(-1)?.probability ?? 0 }))
    .sort((left, right) => right.last - left.last)[0];
  const userRow = userTeam ? rows.find((row) => row.team.rosterId === userTeam.rosterId) : null;
  if (!leader) return 'No closing line yet.';
  if (userRow?.series.at(-1)) {
    return `${userRow.team.teamName} closes at ${userRow.series.at(-1)!.probability.toFixed(1)}%.`;
  }
  return `${leader.team.teamName} holds the top line at ${leader.last.toFixed(1)}%.`;
}

export function LeagueFutures({
  futures,
  leagueName,
  totalTeams,
  scoringFormat,
  currentWeek,
  mode,
  playoffTeams = 6,
  history = null,
}: LeagueFuturesProps) {
  const [chartMarket, setChartMarket] = useState<ChartMarket>('title');
  const [comparisonRosterId, setComparisonRosterId] = useState<number | null>(null);
  const sortedFutures = useMemo(
    () =>
      [...futures].sort(
        (teamA, teamB) => impliedProbability(teamB.championOdds) - impliedProbability(teamA.championOdds),
      ),
    [futures],
  );
  const userTeam = sortedFutures.find((team) => team.isUser) ?? sortedFutures[0] ?? null;
  const comparisonTeam =
    sortedFutures.find((team) => team.rosterId != null && team.rosterId === comparisonRosterId && !team.isUser) ?? null;
  const cutoffLabel = 'Playoff line';
  const allTeamsReachPlayoffs = playoffTeams >= totalTeams;
  const isPlayoffMarket = chartMarket === 'playoff';
  const chartTitle = isPlayoffMarket ? 'PLAYOFF ODDS, CLOSING LINE' : 'TITLE ODDS, CLOSING LINE';
  const titleHistoryTeams = useMemo(
    () =>
      leagueChartFlags.titleOddsOverTime
        ? futures
            .map((team) => ({ team, series: closingSeriesFor(team, history, chartMarket) }))
            .filter((row) => row.series.length > 1)
        : [],
    [futures, history, chartMarket],
  );
  const titleHistoryBounds = useMemo(() => {
    const points = titleHistoryTeams.flatMap((row) => row.series);
    if (points.length === 0) return null;
    return {
      minAt: Math.min(...points.map((point) => point.at)),
      maxAt: Math.max(...points.map((point) => point.at)),
      minValue: Math.max(0, Math.min(...points.map((point) => point.probability)) - 1),
      maxValue: Math.min(100, Math.max(...points.map((point) => point.probability)) + 1),
    };
  }, [titleHistoryTeams]);
  const userHistory = userTeam ? titleHistoryTeams.find((row) => row.team.rosterId === userTeam.rosterId) : null;
  const comparisonHistory = comparisonTeam ? titleHistoryTeams.find((row) => row.team.rosterId === comparisonTeam.rosterId) : null;
  const envelope = titleHistoryBounds ? envelopePath(titleHistoryTeams, titleHistoryBounds) : '';
  const titleTakeaway = historyTakeaway(titleHistoryTeams, userTeam);
  const yTicks = titleHistoryBounds
    ? [titleHistoryBounds.maxValue, (titleHistoryBounds.maxValue + titleHistoryBounds.minValue) / 2, titleHistoryBounds.minValue]
    : [];
  const xLabels = titleHistoryBounds
    ? [
        titleHistoryBounds.minAt,
        titleHistoryBounds.minAt + (titleHistoryBounds.maxAt - titleHistoryBounds.minAt) / 2,
        titleHistoryBounds.maxAt,
      ]
    : [];

  return (
    <section aria-labelledby="league-futures-title" className="league-futures">
      <div className="league-futures__header">
        <p className="league-futures__kicker">League futures</p>
        <h2 className="league-futures__title" id="league-futures-title">
          {leagueName}
        </h2>
        <p className="league-futures__meta">
          {totalTeams} teams, {formatScoring(scoringFormat)},{' '}
          {mode === 'inseason' ? `Week ${currentWeek}` : 'pre-season market'}
        </p>
      </div>

      {allTeamsReachPlayoffs ? (
        <p className="league-futures__format-note">
          All {totalTeams} teams reach the playoffs in this format.
        </p>
      ) : null}

      <div
        aria-label="Chart line"
        className="league-futures__markets"
        role="group"
        style={{ '--market-count': CHART_OPTIONS.length } as CSSProperties}
      >
        {CHART_OPTIONS.map((option) => (
          <button
            aria-pressed={chartMarket === option.value}
            className={[
              'league-futures__market-option',
              chartMarket === option.value ? 'league-futures__market-option--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={option.value}
            onClick={() => {
              setChartMarket(option.value);
              setComparisonRosterId(null);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="league-futures__board" role="table" aria-label="League futures board">
        <div className="league-futures__row league-futures__row--head" role="row">
          <span>Team</span>
          <span>Proj wins</span>
          <span>Avg seed</span>
          <span>Playoff %</span>
          <span>{isPlayoffMarket ? 'Playoff price' : 'Title price'}</span>
        </div>
        {sortedFutures.map((team, index) => {
          const teamSeries = titleHistoryTeams.find((row) => row.team.rosterId === team.rosterId)?.series ?? [];
          const move = movementFor(recentSeriesFor(teamSeries));
          const selected = comparisonTeam?.rosterId === team.rosterId;
          const odds = isPlayoffMarket ? team.playoffOdds : team.championOdds;

          return (
            <div className="league-futures__slot" key={team.teamName}>
              {index === playoffTeams ? (
                <div className="league-futures__cutoff" role="presentation">
                  <span className="league-futures__cutoff-line" />
                  <span className="league-futures__cutoff-label">{cutoffLabel}</span>
                  <span className="league-futures__cutoff-line" />
                </div>
              ) : null}

              <button
                className={[
                  'league-futures__row',
                  team.isUser ? 'league-futures__row--user' : '',
                  selected ? 'league-futures__row--selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setComparisonRosterId(team.isUser ? null : team.rosterId ?? null)}
                role="row"
                type="button"
              >
                <span className="league-futures__identity" role="cell">
                  <span className="league-futures__team">
                    {leagueChartFlags.avatars ? <TeamAvatar avatarUrl={team.avatarUrl} name={team.teamName} /> : null}
                    <span className="league-futures__team-name">{team.teamName}</span>
                    {team.isUser ? <span className="league-futures__you">YOU</span> : null}
                  </span>
                </span>
                <span className="league-futures__cell" role="cell">
                  {team.projWins != null ? team.projWins.toFixed(1) : team.record}
                </span>
                <span className="league-futures__cell" role="cell">
                  {team.avgSeed != null ? team.avgSeed.toFixed(1) : 'N/A'}
                </span>
                <span className="league-futures__cell" role="cell">
                  {team.playoffProb != null ? `${team.playoffProb.toFixed(0)}%` : 'N/A'}
                </span>
                <span className="league-futures__price" role="cell">
                  <span className={['league-futures__odds', team.isUser ? 'league-futures__odds--selected' : ''].filter(Boolean).join(' ')}>
                    {formatAmericanOdds(odds)}
                  </span>
                  {move != null ? (
                    <LeagueMovementChip className="league-futures__move-chip" move={move} timeframe="this week" />
                  ) : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="league-futures__chart-card league-futures__chart-card--static">
        <span className="league-futures__chart-head">
          <span>
            <span className="league-futures__chart-title">{chartTitle}</span>
            <span className="league-futures__chart-subtitle">Each day's last price. Tap a team above to compare.</span>
          </span>
        </span>
        {titleHistoryTeams.length > 0 && titleHistoryBounds && userHistory ? (
          <>
            <div className="league-futures__detail-chart">
              <span className="league-futures__detail-axis league-futures__detail-axis--y">
                {isPlayoffMarket ? 'Playoff probability' : 'Championship probability'}
              </span>
              <div className="league-futures__yticks">
                {yTicks.map((tick) => (
                  <span key={`tick-${tick.toFixed(2)}`}>{tick.toFixed(0)}%</span>
                ))}
              </div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                {yTicks.map((tick) => (
                  <line
                    className="league-futures__detail-grid"
                    key={`grid-${tick.toFixed(2)}`}
                    x1="0"
                    x2="100"
                    y1={yFor(tick, titleHistoryBounds)}
                    y2={yFor(tick, titleHistoryBounds)}
                  />
                ))}
                {envelope ? <polygon className="league-futures__envelope" points={envelope} /> : null}
                <polyline
                  className="league-futures__detail-line league-futures__detail-line--user"
                  points={chartLine(userHistory.series, titleHistoryBounds)}
                />
                {comparisonHistory ? (
                  <polyline
                    className="league-futures__detail-line league-futures__detail-line--compare"
                    points={chartLine(comparisonHistory.series, titleHistoryBounds)}
                  />
                ) : null}
              </svg>
              <span className="league-futures__detail-axis league-futures__detail-axis--x">Date</span>
            </div>
            <div className="league-futures__xlabels">
              {xLabels.map((timestamp) => <span key={`x-${timestamp}`}>{dayLabel(timestamp)}</span>)}
            </div>
            <span className="league-futures__takeaway">
              {comparisonHistory?.series.at(-1)
                ? `${comparisonHistory.team.teamName} comparison line: ${comparisonHistory.series.at(-1)!.probability.toFixed(1)}%.`
                : titleTakeaway}
            </span>
          </>
        ) : (
          <p className="league-futures__chart-subtitle">
            This chart builds as the league reprices. Check back after a few updates.
          </p>
        )}
      </div>
    </section>
  );
}
