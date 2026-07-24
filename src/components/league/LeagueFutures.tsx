import { useMemo, useState } from 'react';
import type { ScoringFormat } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { isMaterialMove } from '../../utils/leagueMovement';
import type { LeagueFutureRow } from '../../mocks/league';
import type { LineHistoryEntry } from '../../services/leagueApi';
import { leagueChartFlags } from '../../config/leagueChartFlags';
import {
  OddsChart,
  type OddsChartBandPoint,
  type OddsChartPoint,
  type OddsChartRangeOption,
} from '../charts/OddsChart';
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

const CHART_RANGES: OddsChartRangeOption[] = [
  { id: 'week', label: 'Week', windowMs: 7 * 24 * 60 * 60 * 1000 },
  { id: 'month', label: 'Month', windowMs: 30 * 24 * 60 * 60 * 1000 },
  { id: 'season', label: 'Season' },
];

function formatScoring(scoringFormat: ScoringFormat) {
  return scoringFormat === 'half-ppr' ? 'Half PPR' : scoringFormat.toUpperCase();
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toDateString();
}

function formatPercent(value: number) {
  if (value < 1) return '<1%';
  if (value > 99) return '>99%';
  return `${Math.round(value)}%`;
}

function probabilityDeltaRead(delta: number, rangeLabel: string) {
  const tone = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
  return {
    text: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% this ${rangeLabel.toLowerCase()}`,
    tone,
  } as const;
}

function summaryText(openValue: number, currentValue: number) {
  return `Open ${formatPercent(openValue)} → Now ${formatPercent(currentValue)}`;
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

function envelopePoints(rows: { team: LeagueFutureRow; series: { at: number; probability: number }[] }[]) {
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
  return [...days.values()]
    .sort((left, right) => left.at - right.at)
    .map<OddsChartBandPoint>((day) => ({
      x: day.at,
      low: Math.min(...day.values),
      high: Math.max(...day.values),
    }));
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

function comparisonTakeaway(
  userTeam: LeagueFutureRow,
  comparisonTeam: LeagueFutureRow | null,
  userSeries: { probability: number }[] | undefined,
  comparisonSeries: { probability: number }[] | undefined,
) {
  if (!comparisonTeam || !userSeries?.length || !comparisonSeries?.length) {
    return 'Tap a team above to compare one line against yours.';
  }

  const userLast = userSeries.at(-1)?.probability ?? 0;
  const comparisonLast = comparisonSeries.at(-1)?.probability ?? 0;
  const difference = comparisonLast - userLast;
  if (Math.abs(difference) < 0.2) {
    return `${comparisonTeam.teamName} closes even with ${userTeam.teamName} in this view.`;
  }
  return difference > 0
    ? `${comparisonTeam.teamName} closes ${difference.toFixed(1)} points above your line.`
    : `${comparisonTeam.teamName} closes ${Math.abs(difference).toFixed(1)} points below your line.`;
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
  const userTeam = futures.find((team) => team.isUser) ?? futures[0] ?? null;
  const comparisonTeam =
    futures.find((team) => team.rosterId != null && team.rosterId === comparisonRosterId && !team.isUser) ?? null;
  const allTeamsReachPlayoffs = playoffTeams >= totalTeams;
  const isPlayoffMarket = chartMarket === 'playoff';
  const chartTitle = isPlayoffMarket ? 'Your playoff odds, day by day' : 'Your title odds, day by day';

  const historyTeams = useMemo(
    () =>
      futures
        .map((team) => ({ team, series: closingSeriesFor(team, history, chartMarket) }))
        .filter((row) => row.series.length > 1),
    [chartMarket, futures, history],
  );

  const userHistory = userTeam ? historyTeams.find((row) => row.team.rosterId === userTeam.rosterId) : null;
  const comparisonHistory = comparisonTeam ? historyTeams.find((row) => row.team.rosterId === comparisonTeam.rosterId) : null;
  const envelope = envelopePoints(historyTeams);
  const footerText = userTeam
    ? comparisonTakeaway(userTeam, comparisonTeam, userHistory?.series, comparisonHistory?.series)
    : 'This chart builds as the league updates.';

  return (
    <section aria-labelledby="league-futures-title" className="league-futures">
      <div className="league-futures__header">
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
          <span>Move</span>
        </div>
        {futures.map((team, index) => {
          const teamSeries = historyTeams.find((row) => row.team.rosterId === team.rosterId)?.series ?? [];
          const move = movementFor(recentSeriesFor(teamSeries));
          const selected = comparisonTeam?.rosterId === team.rosterId;
          const odds = isPlayoffMarket ? team.playoffOdds : team.championOdds;

          return (
            <div className="league-futures__slot" key={team.teamName}>
              {index === playoffTeams ? (
                <div className="league-futures__cutoff" role="presentation">
                  <span className="league-futures__cutoff-line" />
                  <span className="league-futures__cutoff-label">Playoff line</span>
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
                onClick={() => setComparisonRosterId(selected ? null : team.isUser ? null : team.rosterId ?? null)}
                role="row"
                type="button"
              >
                <span className="league-futures__identity" role="cell">
                  <span className="league-futures__team">
                    {leagueChartFlags.avatars ? <TeamAvatar avatarUrl={team.avatarUrl} name={team.teamName} /> : null}
                    <span className="league-futures__team-copy">
                      {team.ownerName ? <span className="league-futures__owner">{team.ownerName}</span> : null}
                      <span className="league-futures__team-name">{team.teamName}</span>
                    </span>
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
                  {team.playoffProb != null ? formatPercent(team.playoffProb) : 'N/A'}
                </span>
                <span className="league-futures__price" role="cell">
                  <span className={['league-futures__odds', team.isUser ? 'league-futures__odds--selected' : ''].filter(Boolean).join(' ')}>
                    {formatAmericanOdds(odds)}
                  </span>
                </span>
                <span className="league-futures__move-cell" role="cell">
                  {move != null ? (
                    <LeagueMovementChip className="league-futures__move-chip" move={move} timeframe="" variant="quiet" />
                  ) : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="league-futures__chart-card">
        {userHistory ? (
          <OddsChart
            band={envelope.length > 1 ? { id: 'league-envelope', points: envelope } : null}
            caption="Gray band = league range. Tap a team above to compare."
            className="league-futures__chart"
            comparison={comparisonHistory
              ? {
                  id: 'comparison-history',
                  name: comparisonHistory.team.teamName,
                  shortLabel: comparisonHistory.team.teamName.slice(0, 4).toUpperCase(),
                  points: comparisonHistory.series.map<OddsChartPoint>((point) => ({
                    x: point.at,
                    y: point.probability,
                  })),
                }
              : null}
            defaultRangeId="month"
            deltaFormatter={probabilityDeltaRead}
            displayValueForDelta={(value) => Math.round(Math.max(0, Math.min(100, value)))}
            footer={footerText}
            hero={{
              id: 'user-history',
              name: userHistory.team.teamName,
              avatarUrl: userHistory.team.avatarUrl,
              endpointDetail: formatAmericanOdds(isPlayoffMarket ? userHistory.team.playoffOdds : userHistory.team.championOdds),
              points: userHistory.series.map<OddsChartPoint>((point) => ({
                x: point.at,
                y: point.probability,
              })),
            }}
            rangeOptions={CHART_RANGES}
            summaryFormatter={summaryText}
            title={chartTitle}
            valueFormatter={formatPercent}
          />
        ) : (
          <p className="league-futures__empty-note">
            This chart builds as the league updates. Check back after a few more days.
          </p>
        )}
      </div>
    </section>
  );
}
