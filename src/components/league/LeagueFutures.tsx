import { useMemo, useState } from 'react';
import type { ScoringFormat } from '../../types';
import { formatAmericanOdds, formatProbOrOdds, impliedProbability } from '../../utils/formatOdds';
import type { LeagueFutureRow } from '../../mocks/league';
import type { LineHistoryEntry } from '../../services/leagueApi';
import { leagueChartFlags } from '../../config/leagueChartFlags';
import {
  OddsChart,
  type OddsChartBandPoint,
  type OddsChartPoint,
  type OddsChartRangeOption,
} from '../charts/OddsChart';
import { marketMovement, formatMovePp } from '../../utils/openAnchors';
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

type SortKey = 'team' | 'projWins' | 'avgSeed' | 'playoffProb' | 'open' | 'title' | 'move';
type SortState = { key: SortKey; direction: 'asc' | 'desc' };

/**
 * Every column, and which way it points when you first click it.
 *
 * "Descending" is not the same as "best first" from column to column: the
 * best average seed is the lowest number, and the best price is the shortest
 * one. Each column declares the direction that puts the strongest team on
 * top, so one click always means "rank them by this".
 */
const SORTABLE: { key: SortKey; label: string; firstDirection: 'asc' | 'desc' }[] = [
  { key: 'team', label: 'Team', firstDirection: 'asc' },
  { key: 'projWins', label: 'Proj wins', firstDirection: 'desc' },
  { key: 'avgSeed', label: 'Avg seed', firstDirection: 'asc' },
  { key: 'playoffProb', label: 'Playoff %', firstDirection: 'desc' },
  { key: 'open', label: 'Open', firstDirection: 'desc' },
  { key: 'title', label: 'Title price', firstDirection: 'desc' },
  { key: 'move', label: 'Move', firstDirection: 'desc' },
];

/* Title odds, always.

   The board carried a two-way toggle, and switching it repriced one column
   while every other number on the row stayed put — because the row already
   shows both markets: playoff probability in its own column and the title
   price beside it. The toggle was not revealing a second view of the league,
   it was swapping which of two facts already on screen got the big type.
   One board, one headline market. */

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
  // A locked/eliminated team reads as exactly 100%/0%; only near-locks get the
  // >99% / <1% hedge.
  if (value >= 99.95) return '100%';
  if (value <= 0.05) return '0%';
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
) {
  if (!team.rosterId || !history?.length) return [];
  const rosterId = String(team.rosterId);
  return history
    .map((entry) => {
      const rawProb = entry.titleProb?.[rosterId];
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
) {
  const byDay = new Map<string, { at: number; probability: number }>();
  rawSeriesFor(team, history).forEach((point) => {
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
  const [comparisonRosterId, setComparisonRosterId] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const userTeam = futures.find((team) => team.isUser) ?? futures[0] ?? null;
  const comparisonTeam =
    futures.find((team) => team.rosterId != null && team.rosterId === comparisonRosterId && !team.isUser) ?? null;
  const allTeamsReachPlayoffs = playoffTeams >= totalTeams;
  const chartTitle = 'Your title odds, day by day';

  const historyTeams = useMemo(
    () =>
      futures
        .map((team) => ({ team, series: closingSeriesFor(team, history) }))
        .filter((row) => row.series.length > 1),
    [futures, history],
  );

  const userHistory = userTeam ? historyTeams.find((row) => row.team.rosterId === userTeam.rosterId) : null;
  const comparisonHistory = comparisonTeam ? historyTeams.find((row) => row.team.rosterId === comparisonTeam.rosterId) : null;
  const envelope = envelopePoints(historyTeams);
  const footerText = userTeam
    ? comparisonTakeaway(userTeam, comparisonTeam, userHistory?.series, comparisonHistory?.series)
    : 'This chart builds as the league updates.';

  /* The opening book, read once. Keyed by roster id because team names are
     not stable across a season and the history stores roster ids. */
  const openByRoster = useMemo(() => {
    const moves = marketMovement(history ?? [], 'title');
    return new Map(moves.map((move) => [move.rosterId, move]));
  }, [history]);

  /**
   * The board in the order the user asked for, or the engine's if they have
   * not asked.
   *
   * Two things this must not do. It must not sort a price as a number:
   * +2400 is arithmetically larger than −500 and the team holding it is far
   * worse, so the two price columns rank by the probability behind the price
   * instead. And it must not sort a missing value as a small one — a team with
   * no opening snapshot goes to the bottom whichever way the arrow points,
   * because "we never priced this" is not a rank.
   */
  const rows = useMemo(() => {
    if (!sort) return futures;
    const rank = (team: LeagueFutureRow): number | string | null => {
      const opened = openByRoster.get(String(team.rosterId ?? ''));
      switch (sort.key) {
        case 'team':
          return team.teamName.toLocaleLowerCase();
        case 'projWins':
          return team.projWins ?? null;
        case 'avgSeed':
          return team.avgSeed ?? null;
        case 'playoffProb':
          return team.playoffProb ?? null;
        case 'open':
          return opened?.openProb ?? null;
        case 'title':
          return impliedProbability(team.championOdds);
        case 'move':
          return opened?.movePp ?? null;
        default:
          return null;
      }
    };

    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...futures].sort((left, right) => {
      const a = rank(left);
      const b = rank(right);
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      if (typeof a === 'string' || typeof b === 'string') {
        return String(a).localeCompare(String(b)) * factor;
      }
      return (a - b) * factor;
    });
  }, [futures, openByRoster, sort]);

  const toggleSort = (key: SortKey) => {
    const column = SORTABLE.find((entry) => entry.key === key);
    if (!column) return;
    setComparisonRosterId(null);
    setSort((current) => {
      if (current?.key !== key) return { key, direction: column.firstDirection };
      /* Second click reverses, third returns the board to the engine's own
         order — which matters more here than it usually would, because the
         playoff line below is only meaningful in that order. */
      const flipped = current.direction === 'asc' ? 'desc' : 'asc';
      return flipped === column.firstDirection ? null : { key, direction: flipped };
    });
  };

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

      <div className="league-futures__board" role="table" aria-label="League futures board">
        <div className="league-futures__row league-futures__row--head" role="row">
          {SORTABLE.map((column) => (
            <button
              aria-sort={
                sort?.key === column.key
                  ? sort.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
              className={[
                'league-futures__sort',
                sort?.key === column.key ? 'league-futures__sort--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={column.key}
              onClick={() => toggleSort(column.key)}
              role="columnheader"
              type="button"
            >
              {column.label}
              <span aria-hidden="true" className="league-futures__sort-caret">
                {sort?.key === column.key ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
              </span>
            </button>
          ))}
        </div>
        {rows.map((team, index) => {
          /* Movement is measured from where the market OPENED, not from a
             rolling recent window. "You were +900 in week 1 and you are +475
             now" is the sentence this board exists to make, and a trailing
             window cannot say it. */
          const opened = openByRoster.get(String(team.rosterId ?? ''));
          const movePp = formatMovePp(opened?.movePp ?? null);
          const selected = comparisonTeam?.rosterId === team.rosterId;
          const odds = team.championOdds;

          return (
            <div className="league-futures__slot" key={team.teamName}>
              {/* Only in the engine's own order. The line marks the cut in
                  the seeding the sim produced; drawn across a board sorted by
                  points-for or team name it would be a rule through an
                  arbitrary row, claiming a cut that ordering does not decide. */}
              {sort == null && index === playoffTeams ? (
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
                {/* Where this team's book opened. Blank, not a dash and never
                    today's price, when the league has no opening snapshot to
                    quote — a season that began before we were pricing it has
                    no open, and inventing one would invent the movement too. */}
                <span className="league-futures__cell league-futures__open" role="cell">
                  {opened ? formatAmericanOdds(opened.openOdds) : ''}
                </span>
                <span className="league-futures__price" role="cell">
                  <span className={['league-futures__odds', team.isUser ? 'league-futures__odds--selected' : ''].filter(Boolean).join(' ')}>
                    {formatProbOrOdds(team.titleProb ?? impliedProbability(odds) * 100)}
                  </span>
                </span>
                <span className="league-futures__move-cell" role="cell">
                  {movePp ? (
                    <span
                      className={[
                        'league-futures__move-pp',
                        (opened?.movePp ?? 0) > 0 ? 'league-futures__move-pp--up' : 'league-futures__move-pp--down',
                      ].join(' ')}
                      title="Change in title probability since the market opened, in percentage points."
                    >
                      {movePp}
                    </span>
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
            bandLabel="League range"
            caption="Tap a team above to compare."
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
              endpointDetail: formatAmericanOdds(userHistory.team.championOdds),
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
