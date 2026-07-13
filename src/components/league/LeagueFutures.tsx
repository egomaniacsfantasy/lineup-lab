import { useMemo, useState, type CSSProperties } from 'react';
import type { ScoringFormat } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import type { LeagueFutureRow } from '../../mocks/league';
import type { LineHistoryEntry } from '../../services/leagueApi';
import { leagueChartFlags } from '../../config/leagueChartFlags';
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
type ExpandedFuturesChart = 'title' | null;

const CHART_OPTIONS: { label: string; value: ChartMarket }[] = [
  { label: 'Title odds', value: 'title' },
  { label: 'Playoff odds', value: 'playoff' },
];

function formatScoring(scoringFormat: ScoringFormat) {
  return scoringFormat === 'half-ppr' ? 'Half PPR' : scoringFormat.toUpperCase();
}

function impliedProbability(odds: number) {
  if (!Number.isFinite(odds)) return 1; // clinched / degenerate line
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }

  return 100 / (odds + 100);
}

// Odds-over-time series for the selected chart line (title or playoff). All
// history is a reprice of the season sim, so this is the sim's odds over time.
function seriesFor(
  team: LeagueFutureRow,
  history: LineHistoryEntry[] | null | undefined,
  chartMarket: ChartMarket,
) {
  if (!team.rosterId || !history?.length) return [];
  const rosterId = String(team.rosterId);
  return history
    .map((entry) => {
      // Prefer the raw probability (American odds clamp at 98.5%, so a 100%
      // playoff team would otherwise read 98.5%); fall back to odds for old
      // history entries recorded before raw probs were stored.
      const rawProb = (chartMarket === 'playoff' ? entry.playoffProb : entry.titleProb)?.[rosterId];
      const odds = (chartMarket === 'playoff' ? entry.playoffOdds : entry.titleOdds)?.[rosterId];
      const prob = rawProb != null ? rawProb : odds != null ? impliedProbability(odds) * 100 : null;
      if (prob == null) return null;
      return { at: entry.computedAt, probability: Math.max(0, Math.min(100, prob)) };
    })
    .filter((entry): entry is { at: number; probability: number } => entry !== null);
}

function historyTimeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function historyWindow(points: { at: number }[]) {
  const first = points[0]?.at;
  if (!first || !points.at(-1)?.at) return '';
  return `since ${historyTimeLabel(first)}`;
}

function sparkline(points: { at: number; probability: number }[], width = 130, height = 44) {
  if (points.length === 0) return '';
  const min = Math.min(...points.map((point) => point.probability));
  const max = Math.max(...points.map((point) => point.probability));
  const minAt = Math.min(...points.map((point) => point.at));
  const maxAt = Math.max(...points.map((point) => point.at));
  const span = Math.max(1, max - min);
  const timeSpan = Math.max(1, maxAt - minAt);
  return points
    .map((point) => {
      const x = ((point.at - minAt) / timeSpan) * width;
      const y = height - ((point.probability - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
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

function historyTakeaway(rows: { team: LeagueFutureRow; series: { probability: number }[] }[]) {
  const moves = rows
    .map(({ team, series }) => {
      const first = series[0]?.probability ?? 0;
      const last = series.at(-1)?.probability ?? first;
      return { team, move: last - first, last };
    });
  const leader = [...moves].sort((a, b) => b.last - a.last)[0];
  const biggest = [...moves]
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move))
    .find((move) => Math.abs(move.move) >= 0.05);
  if (!leader) return 'No line move yet.';
  if (!biggest) return `${leader.team.teamName} holds the top line at ${leader.last.toFixed(1)}%.`;
  return `${biggest.team.teamName} moved ${biggest.move >= 0 ? 'up' : 'down'} ${Math.abs(biggest.move).toFixed(1)} pts.`;
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
  // One futures view (championship). The chart selector just picks which sim
  // line to draw over time — title odds or playoff odds.
  const [chartMarket, setChartMarket] = useState<ChartMarket>('title');
  const [expandedChart, setExpandedChart] = useState<ExpandedFuturesChart>(null);
  const sortedFutures = useMemo(
    () =>
      [...futures].sort(
        (teamA, teamB) => impliedProbability(teamB.championOdds) - impliedProbability(teamA.championOdds),
      ),
    [futures],
  );
  const cutoffLabel = 'Playoff line';
  const allTeamsReachPlayoffs = playoffTeams >= totalTeams;
  const isPlayoffMarket = chartMarket === 'playoff';
  const chartTitle = isPlayoffMarket ? 'Playoff odds over time' : 'Title odds over time';
  const chartSubtitle = isPlayoffMarket
    ? 'Each line is a team’s chance to make the playoffs across reprices.'
    : 'Each line is a team’s championship price across reprices.';
  const titleHistoryTeams = useMemo(
    () =>
      leagueChartFlags.titleOddsOverTime
        ? futures
            .map((team) => ({ team, series: seriesFor(team, history, chartMarket) }))
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
  const titleTakeaway = historyTakeaway(titleHistoryTeams);

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
            onClick={() => setChartMarket(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {titleHistoryTeams.length > 0 ? (
        <button
          className="league-futures__chart-card"
          onClick={() => setExpandedChart('title')}
          type="button"
        >
          <span className="league-futures__chart-head">
            <span>
              <span className="league-futures__chart-title">{chartTitle}</span>
              <span className="league-futures__chart-subtitle">{chartSubtitle}</span>
            </span>
            <span className="league-futures__inspect">Inspect</span>
          </span>
          <div className="league-futures__history-grid">
            {titleHistoryTeams.map(({ team, series }) => (
              <div className="league-futures__history-row" key={`history-${team.teamName}`}>
                <TeamAvatar avatarUrl={team.avatarUrl} name={team.teamName} />
                <span className="league-futures__history-name">{team.teamName}</span>
                <svg viewBox="0 0 130 44" preserveAspectRatio="none">
                  <polyline
                    className={[
                      'league-futures__history-line',
                      team.isUser ? 'league-futures__history-line--user' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    points={sparkline(series)}
                  />
                </svg>
                <span className="league-futures__history-value">
                  {series.at(-1)?.probability.toFixed(1)}%
                </span>
                <span className="league-futures__history-window">{historyWindow(series)}</span>
              </div>
            ))}
          </div>
          <span className="league-futures__takeaway">{titleTakeaway}</span>
        </button>
      ) : null}

      <div className="league-futures__board">
        {sortedFutures.map((team, index) => (
          <div className="league-futures__slot" key={team.teamName}>
            {index === playoffTeams ? (
              <div className="league-futures__cutoff" role="presentation">
                <span className="league-futures__cutoff-line" />
                <span className="league-futures__cutoff-label">{cutoffLabel}</span>
                <span className="league-futures__cutoff-line" />
              </div>
            ) : null}

            <article
              className={[
                'league-futures__row',
                team.isUser ? 'league-futures__row--user' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="league-futures__identity">
                <div className="league-futures__team">
                  {leagueChartFlags.avatars ? (
                    <TeamAvatar avatarUrl={team.avatarUrl} name={team.teamName} />
                  ) : null}
                  <span className="league-futures__team-name">{team.teamName}</span>
                  {team.isUser ? <span className="league-futures__you">YOU</span> : null}
                </div>
                <div className="league-futures__context">
                  <span className="league-futures__record">
                    {team.projWins != null ? `Proj ${team.projWins.toFixed(1)} wins` : team.record}
                    {team.avgSeed != null ? ` · Avg seed ${team.avgSeed.toFixed(1)}` : ''}
                    {team.playoffProb != null ? ` · ${team.playoffProb.toFixed(0)}% playoff` : ''}
                  </span>
                </div>
              </div>

              <span
                className={[
                  'league-futures__odds',
                  team.isUser ? 'league-futures__odds--selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {formatAmericanOdds(team.championOdds)}
              </span>
            </article>
          </div>
        ))}
      </div>
      {expandedChart ? (
        <div
          aria-modal="true"
          className="league-futures__modal"
          onClick={() => setExpandedChart(null)}
          role="dialog"
        >
          <div className="league-futures__modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="league-futures__modal-close" onClick={() => setExpandedChart(null)} type="button">
              Close
            </button>
            <h3 className="league-futures__modal-title">{chartTitle}</h3>
            <p className="league-futures__chart-subtitle">
              X-axis is reprice time. Y-axis is {isPlayoffMarket ? 'playoff probability' : 'championship probability'}.
            </p>
            {titleHistoryBounds ? (
              <div className="league-futures__detail-chart">
                <span className="league-futures__detail-axis league-futures__detail-axis--y">
                  {isPlayoffMarket ? 'Playoff probability' : 'Championship probability'}
                </span>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  {[0, 25, 50, 75, 100].map((tick) => (
                    <line className="league-futures__detail-grid" key={`grid-${tick}`} x1="0" x2="100" y1={tick} y2={tick} />
                  ))}
                  {titleHistoryTeams.map(({ team, series }) => (
                    <polyline
                      className={[
                        'league-futures__detail-line',
                        team.isUser ? 'league-futures__detail-line--user' : '',
                      ].filter(Boolean).join(' ')}
                      key={`detail-title-${team.teamName}`}
                      points={chartLine(series, titleHistoryBounds)}
                    />
                  ))}
                </svg>
                <span className="league-futures__detail-axis league-futures__detail-axis--x">Reprice time</span>
              </div>
            ) : null}
            <div className="league-futures__legend">
              {titleHistoryTeams.map(({ team, series }) => (
                <span key={`legend-${team.teamName}`}>
                  <TeamAvatar avatarUrl={team.avatarUrl} name={team.teamName} />
                  {team.teamName} {series.at(-1)?.probability.toFixed(1)}%
                </span>
              ))}
            </div>
            <p className="league-futures__takeaway">{titleTakeaway}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
