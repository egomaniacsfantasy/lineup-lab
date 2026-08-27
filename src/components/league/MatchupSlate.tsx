import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { isMaterialMove } from '../../utils/leagueMovement';
import type { LeagueWeekMatchup } from '../../mocks/league';
import type { LineHistoryEntry } from '../../services/leagueApi';
import { leagueChartFlags } from '../../config/leagueChartFlags';
import { marketMovement, weekMovement } from '../../utils/openAnchors';
import { OddsChart, type OddsChartPoint } from '../charts/OddsChart';
import { TeamAvatar } from './TeamAvatar';
import './MatchupSlate.css';

interface MatchupSlateProps {
  matchups: LeagueWeekMatchup[];
  currentWeek: number;
  history?: LineHistoryEntry[] | null;
  /** Rendered directly under the board's own heading. */
  intro?: ReactNode;
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

/**
 * Movement for a side, measured from the price this week OPENED at.
 *
 * This used to anchor to the first snapshot of the same calendar day while the
 * caption underneath said "since the week opened". The label and the number
 * disagreed, and not harmlessly: most of a week's movement happens before
 * today, so the figure shown was a fraction of the real one. It also returned
 * nothing whenever today had fewer than two snapshots, which hides a line that
 * moved four points on Wednesday and has been still since.
 *
 * The anchor now comes from openAnchors, which is the same one the futures
 * board and the ticket read, so "moved since the open" means one thing
 * everywhere in the product.
 */
function movementSummary(
  moves: Map<string, number>,
  matchupId: number | null | undefined,
  rosterId: number | null | undefined,
  latest: RawMovement | null,
) {
  if (matchupId == null || rosterId == null || !latest) return null;
  const move = moves.get(`${matchupId}:${rosterId}`);
  if (move == null || !isMaterialMove(move)) return null;
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

export function MatchupSlate({ matchups, currentWeek, history = null, intro = null }: MatchupSlateProps) {
  /* Every side's move against this week's opening line, keyed matchup:roster.
     Computed once for the slate rather than re-derived per row. */
  const openMoves = useMemo(() => {
    const map = new Map<string, number>();
    if (!leagueChartFlags.lineMovement) return map;
    for (const move of weekMovement(history ?? [], currentWeek)) {
      map.set(`${move.matchupId}:${move.rosterId}`, move.movePp);
    }
    return map;
  }, [history, currentWeek]);

  /* The title market's biggest reactions to THIS week, not to the season. A
     team can be well up across the year and down on the week; the board is a
     weekly surface and should say the weekly thing. */
  const titleMovers = useMemo(() => {
    const nameByRoster = new Map<string, string>();
    for (const matchup of matchups) {
      if (matchup.teamARosterId != null) nameByRoster.set(String(matchup.teamARosterId), matchup.teamA);
      if (matchup.teamBRosterId != null) nameByRoster.set(String(matchup.teamBRosterId), matchup.teamB);
    }
    return marketMovement(history ?? [], 'title', currentWeek)
      .filter((move) => move.movePp != null && Math.abs(move.movePp) >= 0.1)
      .map((move) => ({ ...move, name: nameByRoster.get(move.rosterId) ?? null }))
      .filter((move) => move.name != null)
      .sort((a, b) => Math.abs(b.movePp ?? 0) - Math.abs(a.movePp ?? 0))
      .slice(0, 3);
  }, [history, currentWeek, matchups]);

  const rows = useMemo(
    () =>
      matchups
        .map((matchup) => {
          const teams = teamsFor(matchup);
          const movement = historyFor(matchup, history);
          const detailClosings = movement ? closingByDay(movement) : [];
          const summary = movementSummary(
            openMoves,
            matchup.matchupId,
            teams.left.rosterId,
            movement?.at(-1) ?? null,
          );
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
    [history, matchups, openMoves],
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
    ? `${selectedRow.left.name} has moved ${selectedRow.summary.move >= 0 ? 'up' : 'down'} ${Math.abs(selectedRow.summary.move).toFixed(1)} percentage points since this week's line opened.`
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

      {/* The week-fork strip, under the title rather than above it. Sitting
          above, it was the first thing on the tab and the heading for the
          board arrived after it, so the page opened on an unlabelled chart.
          It belongs to this board and now reads as part of it. */}
      {intro}

      <div className="matchup-slate__layout">
        <div className="matchup-slate__board-shell">
          <div className="matchup-slate__board-head" role="presentation">
            {/* No Win% columns. A price and a win probability are the same
                fact in two units, and the header carries a global toggle that
                turns one into the other, so printing both put two scales on
                one row and made the toggle look like it did nothing. The bar
                keeps the visual read without repeating the number. */}
            <span>Matchup</span>
            <span>Price</span>
            <span>Spread &amp; total</span>
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

                  <span className="matchup-slate__line-cell">
                    <span className="matchup-slate__prob-track" aria-hidden="true">
                      <span className="matchup-slate__prob-fill" style={{ width: `${left.winProb}%` }} />
                    </span>
                    {/* The number a book would actually post. It was priced and
                        then dropped by the adapter, so the middle of every row
                        was a bar floating in empty space. */}
                    <span className="matchup-slate__line-meta">
                      {(() => {
                        const favSpread = leftFavored ? matchup.teamASpread : matchup.teamBSpread;
                        const initials = favorite.name
                          .split(/\s+/)
                          .map((word) => word[0])
                          .join('')
                          .slice(0, 3)
                          .toUpperCase();
                        const parts: string[] = [];
                        if (typeof favSpread === 'number' && favSpread !== 0) {
                          parts.push(`${initials} ${favSpread > 0 ? '-' : '+'}${Math.abs(favSpread).toFixed(1)}`);
                        }
                        if (typeof matchup.totalProjection === 'number') {
                          parts.push(`O/U ${matchup.totalProjection.toFixed(1)}`);
                        }
                        return parts.join(' · ');
                      })()}
                    </span>
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

          {/* Every line names both teams. "Biggest favourite: Apollo 68%"
              answers half a question, favourite over whom?, and the missing
              half is the part that makes it worth reading.

              And one unit at a time. The header carries a global price/percent
              toggle, so every price here goes through formatAmericanOdds and
              follows it. Printing a percentage beside an American price in the
              same three-row card asks the reader to hold two scales at once
              for no reason. The total is the exception and is not a unit
              question: it is fantasy points, which is what it says. */}
          <section className="matchup-slate__glance">
            <span className="matchup-slate__glance-title">The week at a glance</span>
            {biggestFavorite ? (
              <div className="matchup-slate__glance-row">
                <span className="matchup-slate__glance-label">Biggest favorite</span>
                <span className="matchup-slate__glance-value">
                  {formatAmericanOdds(biggestFavorite.favorite.odds)}
                </span>
                <span className="matchup-slate__glance-teams">
                  {biggestFavorite.favorite.name} over{' '}
                  {biggestFavorite.favorite.side === biggestFavorite.left.side
                    ? biggestFavorite.right.name
                    : biggestFavorite.left.name}
                </span>
              </div>
            ) : null}
            {closestLine ? (
              <div className="matchup-slate__glance-row">
                <span className="matchup-slate__glance-label">Closest line</span>
                <span className="matchup-slate__glance-value">
                  {formatAmericanOdds(closestLine.favorite.odds)}
                </span>
                <span className="matchup-slate__glance-teams">
                  {closestLine.left.name} vs {closestLine.right.name}
                </span>
              </div>
            ) : null}
            {highestTotal?.matchup.totalProjection != null ? (
              <div className="matchup-slate__glance-row">
                <span className="matchup-slate__glance-label">Highest total</span>
                <span className="matchup-slate__glance-value">
                  {highestTotal.matchup.totalProjection.toFixed(1)}
                  <span className="matchup-slate__glance-unit">pts</span>
                </span>
                <span className="matchup-slate__glance-teams">
                  {highestTotal.left.name} vs {highestTotal.right.name}
                </span>
              </div>
            ) : null}
          </section>

          {/* What the week did to the title market. Only shown when the week
              actually moved something: an empty list means the board opened
              and nothing has happened yet, which is a true and common state
              early in a week and should not render as a heading over nothing. */}
          {titleMovers.length > 0 ? (
            <section className="matchup-slate__movers">
              <span className="matchup-slate__glance-title">Title market · this week</span>
              {titleMovers.map((mover) => (
                <div className="matchup-slate__mover" key={mover.rosterId}>
                  <span className="matchup-slate__mover-name">{mover.name}</span>
                  <span className="matchup-slate__mover-prices">
                    <span className="matchup-slate__mover-open">
                      {formatAmericanOdds(mover.openOdds)}
                    </span>
                    <span aria-hidden="true" className="matchup-slate__mover-arrow">→</span>
                    <span
                      className={[
                        'matchup-slate__mover-now',
                        (mover.movePp ?? 0) > 0
                          ? 'matchup-slate__mover-now--up'
                          : 'matchup-slate__mover-now--down',
                      ].join(' ')}
                    >
                      {formatAmericanOdds(mover.nowOdds)}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          ) : null}

        </aside>
      </div>
    </section>
  );
}
