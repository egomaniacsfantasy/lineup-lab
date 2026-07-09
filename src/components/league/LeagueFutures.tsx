import { useMemo, useState } from 'react';
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

type LeagueMarket = 'champion' | 'finals' | 'playoffs';

const MARKET_OPTIONS: { label: string; value: LeagueMarket }[] = [
  { label: 'Champion', value: 'champion' },
  { label: 'Finals', value: 'finals' },
  { label: 'Playoffs', value: 'playoffs' },
];

function formatScoring(scoringFormat: ScoringFormat) {
  return scoringFormat === 'half-ppr' ? 'Half PPR' : scoringFormat.toUpperCase();
}

function impliedProbability(odds: number) {
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }

  return 100 / (odds + 100);
}

function titleSeriesFor(team: LeagueFutureRow, history: LineHistoryEntry[] | null | undefined) {
  if (!team.rosterId || !history?.length) return [];
  const rosterId = String(team.rosterId);
  return history
    .map((entry) => {
      const odds = entry.titleOdds?.[rosterId];
      if (odds == null) return null;
      return { at: entry.computedAt, probability: impliedProbability(odds) * 100 };
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

function getMarketOdds(team: LeagueFutureRow, market: LeagueMarket) {
  switch (market) {
    case 'finals':
      return team.finalsOdds;
    case 'playoffs':
      return team.playoffOdds;
    case 'champion':
    default:
      return team.championOdds;
  }
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
  const [market, setMarket] = useState<LeagueMarket>('champion');
  const sortedFutures = useMemo(
    () =>
      [...futures].sort((teamA, teamB) => {
        const teamAProbability = impliedProbability(getMarketOdds(teamA, market));
        const teamBProbability = impliedProbability(getMarketOdds(teamB, market));
        return teamBProbability - teamAProbability;
      }),
    [futures, market],
  );
  const cutoffLabel = 'Playoff line';
  const allTeamsReachPlayoffs = market === 'playoffs' && playoffTeams >= totalTeams;
  const titleHistoryTeams = useMemo(
    () =>
      leagueChartFlags.titleOddsOverTime
        ? futures
            .map((team) => ({ team, series: titleSeriesFor(team, history) }))
            .filter((row) => row.series.length > 1)
        : [],
    [futures, history],
  );
  const contenderRows = useMemo(
    () => {
      if (!leagueChartFlags.contenderShape) return [];
      const rows = futures
        .filter((team) => team.playoffProb > 0)
        .map((team) => {
          const titleProb = impliedProbability(team.championOdds) * 100;
          return {
            team,
            playoffProb: team.playoffProb,
            titleIfIn: titleProb / Math.max(0.01, team.playoffProb / 100),
          };
        });
      if (rows.length === 0) return [];
      const minY = Math.min(...rows.map((row) => row.titleIfIn));
      const maxY = Math.max(...rows.map((row) => row.titleIfIn));
      const spanY = Math.max(1, maxY - minY);
      return rows.map((row, index) => {
        const neighbors = rows
          .slice(0, index)
          .filter((other) => Math.abs(other.playoffProb - row.playoffProb) < 4 && Math.abs(other.titleIfIn - row.titleIfIn) < spanY * 0.12)
          .length;
        const offset = neighbors === 0 ? 0 : neighbors % 2 === 0 ? -neighbors * 6 : neighbors * 6;
        return {
          ...row,
          yPlot: ((row.titleIfIn - minY) / spanY) * 84 + 8,
          xPlot: Math.max(4, Math.min(96, row.playoffProb + offset * 0.08)),
        };
      });
    },
    [futures],
  );

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

      <div
        aria-label="League futures market"
        className="league-futures__markets"
        role="group"
      >
        {MARKET_OPTIONS.map((option) => (
          <button
            aria-pressed={market === option.value}
            className={[
              'league-futures__market-option',
              market === option.value ? 'league-futures__market-option--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={option.value}
            onClick={() => setMarket(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {allTeamsReachPlayoffs ? (
        <p className="league-futures__format-note">
          All {totalTeams} teams reach the playoffs in this format.
        </p>
      ) : null}

      {titleHistoryTeams.length > 0 ? (
        <div className="league-futures__chart-card" aria-label="Title odds over time">
          <p className="league-futures__chart-title">Title odds over time</p>
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
        </div>
      ) : null}

      {contenderRows.length > 1 ? (
        <div className="league-futures__chart-card" aria-label="Contender shape scatter">
          <p className="league-futures__chart-title">Contender shape</p>
          <div className="league-futures__scatter">
            {contenderRows.map(({ team, playoffProb, titleIfIn, xPlot, yPlot }) => (
              <span
                className={[
                  'league-futures__scatter-point',
                  team.isUser ? 'league-futures__scatter-point--user' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={`scatter-${team.teamName}`}
                style={{
                  left: `${xPlot}%`,
                  bottom: `${yPlot}%`,
                }}
                title={`${team.teamName}: ${playoffProb.toFixed(1)}% playoff · ${titleIfIn.toFixed(1)} title if in`}
              >
                <TeamAvatar avatarUrl={team.avatarUrl} name={team.teamName} />
              </span>
            ))}
            <span className="league-futures__scatter-x">Playoff odds</span>
            <span className="league-futures__scatter-y">Title if in</span>
          </div>
        </div>
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
                    {team.projRecord ? `Proj ${team.projRecord}` : team.record}
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
                {allTeamsReachPlayoffs
                  ? 'In'
                  : market === 'playoffs' && team.playoffClinched
                  ? 'Clinched'
                  : formatAmericanOdds(getMarketOdds(team, market))}
              </span>
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}
