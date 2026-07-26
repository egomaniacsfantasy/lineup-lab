import { useEffect, useMemo, useState } from 'react';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { isMaterialMove } from '../../utils/leagueMovement';
import type { LeagueWeekMatchup } from '../../mocks/league';
import type { LineHistoryEntry } from '../../services/leagueApi';
import { leagueChartFlags } from '../../config/leagueChartFlags';
import { OddsChart, type OddsChartPoint, type OddsChartRangeOption } from '../charts/OddsChart';
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
  ownerName?: string;
  record: string;
  odds: number;
  winProb: number;
  projection?: number;
  avatarUrl?: string | null;
  isUser?: boolean;
};

const CHART_RANGES: OddsChartRangeOption[] = [
  { id: 'week', label: 'Week', windowMs: 7 * 24 * 60 * 60 * 1000 },
  { id: 'month', label: 'Month', windowMs: 30 * 24 * 60 * 60 * 1000 },
  { id: 'season', label: 'Season' },
];

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

function dayKey(timestamp: number) {
  return new Date(timestamp).toDateString();
}

function valueForSide(point: RawMovement, side: 'a' | 'b') {
  return side === 'a' ? point.a : point.b;
}

function closingByDay(points: RawMovement[]) {
  const byDay = new Map<string, RawMovement>();
  points.forEach((point) => {
    const key = dayKey(point.at);
    const current = byDay.get(key);
    if (!current || point.at > current.at) byDay.set(key, point);
  });
  return [...byDay.values()].sort((left, right) => left.at - right.at);
}

function movementSummary(points: RawMovement[] | null, leftSide: 'a' | 'b') {
  if (!points) return null;
  const latest = points.at(-1);
  if (!latest) return null;
  const sameDay = points.filter(
    (point) => dayKey(point.at) === dayKey(latest.at),
  );
  const open = sameDay[0];
  if (!open || sameDay.length < 2) return null;
  const move = valueForSide(latest, leftSide) - valueForSide(open, leftSide);
  if (!isMaterialMove(move)) return null;
  return { point: latest, move };
}

function teamsFor(matchup: LeagueWeekMatchup) {
  const teamA: BoardTeam = {
    side: 'a',
    rosterId: matchup.teamARosterId,
    name: matchup.teamA,
    ownerName: matchup.teamAOwnerName,
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
    ownerName: matchup.teamBOwnerName,
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

function boardDisplayName(name: string) {
  return name;
}

function boardHandle(ownerName: string | undefined, record: string) {
  if (ownerName) {
    const owner = ownerName.toUpperCase();
    const full = `${owner} · ${record}`;
    if (full.length <= 18) return full;
    if (owner.length <= 18) return owner;
  }
  return record;
}

function formatPercent(value: number) {
  if (value < 1) return '<1%';
  if (value > 99) return '>99%';
  return `${Math.round(value)}%`;
}

function probabilityDeltaRead(delta: number, rangeLabel: string) {
  return {
    text: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% this ${rangeLabel.toLowerCase()}`,
    tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
  } as const;
}

function summaryText(openValue: number, currentValue: number) {
  return `Open ${formatPercent(openValue)} → Now ${formatPercent(currentValue)}`;
}

function moveLabel(value: number) {
  return `${value >= 0 ? '▲' : '▼'}${Math.abs(value).toFixed(1)}`;
}

export function MatchupSlate({ matchups, currentWeek, history = null }: MatchupSlateProps) {
  const rows = useMemo(
    () =>
      matchups
        .map((matchup) => {
          const teams = teamsFor(matchup);
          const movement = historyFor(matchup, history);
          const detailClosings = movement ? closingByDay(movement) : [];
          const summary = movementSummary(movement, teams.left.side);
          const favorite = teams.left.winProb >= teams.right.winProb ? teams.left : teams.right;
          return {
            matchup,
            movement,
            detailClosings,
            summary,
            favorite,
            rowKey: `${matchup.matchupId ?? teams.left.name}-${teams.right.name}`,
            ...teams,
          };
        })
        .sort((left, right) => {
          if (left.matchup.isUserGame !== right.matchup.isUserGame) return left.matchup.isUserGame ? -1 : 1;
          return right.favorite.winProb - left.favorite.winProb;
        }),
    [history, matchups],
  );

  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(rows[0]?.rowKey ?? null);

  useEffect(() => {
    if (!rows.some((row) => row.rowKey === selectedRowKey)) {
      setSelectedRowKey(rows[0]?.rowKey ?? null);
    }
  }, [rows, selectedRowKey]);

  const selectedRow = rows.find((row) => row.rowKey === selectedRowKey) ?? rows[0] ?? null;
  const biggestFavorite = rows.reduce<typeof rows[number] | null>((current, row) => {
    if (!current || row.favorite.winProb > current.favorite.winProb) return row;
    return current;
  }, null);
  const closestLine = rows.reduce<typeof rows[number] | null>((current, row) => {
    const gap = Math.abs(row.left.winProb - 50);
    if (!current || gap < Math.abs(current.left.winProb - 50)) return row;
    return current;
  }, null);
  const highestTotal = rows.reduce<typeof rows[number] | null>((current, row) => {
    const total = row.matchup.totalProjection ?? 0;
    if (!current || total > (current.matchup.totalProjection ?? 0)) return row;
    return current;
  }, null);

  const chartPoints = selectedRow?.detailClosings.map<OddsChartPoint>((point) => ({
    x: point.at,
    y: valueForSide(point, selectedRow.left.side),
  })) ?? [];
  const chartFooter = selectedRow?.summary
    ? `${selectedRow.left.name} moved ${selectedRow.summary.move >= 0 ? 'up' : 'down'} ${Math.abs(selectedRow.summary.move).toFixed(1)} points since the week opened.`
    : chartPoints.length > 1
      ? 'No real movement today.'
      : 'No material moves yet this week.';

  return (
    <section aria-labelledby="matchup-slate-title" className="matchup-slate">
      <div className="matchup-slate__header">
        <div>
          <p className="matchup-slate__kicker">Week {currentWeek} matchups</p>
          <h2 className="matchup-slate__title" id="matchup-slate-title">
            This week's board
          </h2>
        </div>
      </div>

      <div className="matchup-slate__layout">
        <div className="matchup-slate__board-shell">
          <div className="matchup-slate__board-head" role="presentation">
            <span>Matchup</span>
            <span>Price</span>
            <span>Win%</span>
            <span>Line</span>
            <span>Win%</span>
            <span>Price</span>
            <span>Move</span>
          </div>
          <div className="matchup-slate__rows">
            {rows.map(({ matchup, left, right, favorite, summary, rowKey }) => {
              const selected = rowKey === selectedRow?.rowKey;
              const leftFavored = favorite.side === left.side;
              return (
                <button
                  aria-pressed={selected}
                  className={[
                    'matchup-slate__row-button',
                    matchup.isUserGame ? 'matchup-slate__row-button--user' : '',
                    selected ? 'matchup-slate__row-button--selected' : '',
                  ].filter(Boolean).join(' ')}
                  key={rowKey}
                  onClick={() => setSelectedRowKey(rowKey)}
                  type="button"
                >
                  <span className="matchup-slate__team matchup-slate__team--left">
                    {leagueChartFlags.avatars ? <TeamAvatar avatarUrl={left.avatarUrl} name={left.name} /> : null}
                    <span className="matchup-slate__team-copy">
                      <span className="matchup-slate__team-meta">{boardHandle(left.ownerName, left.record)}</span>
                      <span className="matchup-slate__team-name" title={left.name}>{boardDisplayName(left.name)}</span>
                    </span>
                  </span>

                  <span className={['matchup-slate__moneyline', leftFavored ? 'matchup-slate__moneyline--favorite' : '', summary ? 'matchup-slate__moneyline--moving' : ''].filter(Boolean).join(' ')}>
                    {formatAmericanOdds(left.odds)}
                  </span>

                  <span className="matchup-slate__prob-number matchup-slate__prob-number--left">
                    {formatPercent(left.winProb)}
                  </span>

                  <span className="matchup-slate__prob-track" aria-hidden="true">
                    <span className="matchup-slate__prob-fill" style={{ width: `${left.winProb}%` }} />
                  </span>

                  <span className="matchup-slate__prob-number matchup-slate__prob-number--right">
                    {formatPercent(right.winProb)}
                  </span>

                  <span className={['matchup-slate__moneyline matchup-slate__moneyline--right', !leftFavored ? 'matchup-slate__moneyline--favorite' : '', summary ? 'matchup-slate__moneyline--moving' : ''].filter(Boolean).join(' ')}>
                    {formatAmericanOdds(right.odds)}
                  </span>

                  <span className="matchup-slate__team matchup-slate__team--right">
                    <span className="matchup-slate__team-copy">
                      <span className="matchup-slate__team-meta">{boardHandle(right.ownerName, right.record)}</span>
                      <span className="matchup-slate__team-name" title={right.name}>{boardDisplayName(right.name)}</span>
                    </span>
                    {leagueChartFlags.avatars ? <TeamAvatar avatarUrl={right.avatarUrl} name={right.name} /> : null}
                  </span>

                  <span className="matchup-slate__rail">
                    {summary ? <span className="matchup-slate__move">{moveLabel(summary.move)}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="matchup-slate__board-note">Moves this week only show once the board shifts at least one point.</div>
        </div>

        <aside className="matchup-slate__aside">
          {selectedRow ? (
            <section className="matchup-slate__detail">
              <div className="matchup-slate__detail-head">
                <span className="matchup-slate__detail-kicker">Selected matchup</span>
                <strong>{selectedRow.left.name} vs {selectedRow.right.name}</strong>
              </div>
              {(selectedRow.left.projection != null || selectedRow.right.projection != null) ? (
                <div className="matchup-slate__detail-line">
                  <span>Projected points</span>
                  <span>{selectedRow.left.projection?.toFixed(1) ?? 'N/A'} · {selectedRow.right.projection?.toFixed(1) ?? 'N/A'}</span>
                </div>
              ) : null}
              {chartPoints.length > 1 ? (
                <OddsChart
                  caption="Held between updates."
                  className="matchup-slate__chart"
                  defaultRangeId="week"
                  deltaFormatter={probabilityDeltaRead}
                  displayValueForDelta={(value) => Math.round(Math.max(0, Math.min(100, value)))}
                  footer={chartFooter}
                  hero={{
                    id: `${selectedRow.rowKey}-hero`,
                    name: selectedRow.left.name,
                    points: chartPoints,
                  }}
                  rangeOptions={CHART_RANGES}
                  showHeroEndpoint={false}
                  summaryFormatter={summaryText}
                  title="Line movement"
                  valueFormatter={formatPercent}
                />
              ) : (
                <p className="matchup-slate__movement-note">This chart lights up after a couple of line updates.</p>
              )}
            </section>
          ) : null}

          <section className="matchup-slate__glance">
            <span className="matchup-slate__glance-title">The week at a glance</span>
            {biggestFavorite ? (
              <div className="matchup-slate__glance-row">
                <span>Biggest favorite</span>
                <strong>{biggestFavorite.favorite.name} · {formatPercent(biggestFavorite.favorite.winProb)}</strong>
              </div>
            ) : null}
            {closestLine ? (
              <div className="matchup-slate__glance-row">
                <span>Closest line</span>
                <strong>{closestLine.left.name} vs {closestLine.right.name} · {Math.abs(closestLine.left.winProb - 50).toFixed(1)} pts</strong>
              </div>
            ) : null}
            {highestTotal?.matchup.totalProjection != null ? (
              <div className="matchup-slate__glance-row">
                <span>Highest total</span>
                <strong>{highestTotal.matchup.totalProjection.toFixed(1)} pts</strong>
              </div>
            ) : null}
          </section>

        </aside>
      </div>
    </section>
  );
}
