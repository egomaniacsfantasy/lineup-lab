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


/**
 * One fact about the week, with both teams named and both crests shown.
 *
 * The crests are the point of the redesign: four rows of small grey text was
 * a list you had to read to use, and a league's teams are recognisable by
 * their logo long before their name has finished being read.
 */
function GlanceCard({
  label,
  left,
  right,
  separator,
  value,
  unit,
  tone,
}: {
  label: string;
  left: BoardTeam;
  right: BoardTeam;
  separator: 'over' | 'vs';
  value: string;
  unit?: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="matchup-slate__glance-card">
      <span className="matchup-slate__glance-label">{label}</span>
      <span
        className={[
          'matchup-slate__glance-value',
          tone ? `matchup-slate__glance-value--${tone}` : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
        {unit ? <span className="matchup-slate__glance-unit">{unit}</span> : null}
      </span>
      <span className="matchup-slate__glance-teams">
        <span className="matchup-slate__glance-team">
          {leagueChartFlags.avatars ? (
            <TeamAvatar avatarUrl={left.avatarUrl} name={left.name} />
          ) : null}
          <span className="matchup-slate__glance-team-name">{left.name}</span>
        </span>
        <span className="matchup-slate__glance-sep">{separator}</span>
        <span className="matchup-slate__glance-team">
          {leagueChartFlags.avatars ? (
            <TeamAvatar avatarUrl={right.avatarUrl} name={right.name} />
          ) : null}
          <span className="matchup-slate__glance-team-name">{right.name}</span>
        </span>
      </span>
    </div>
  );
}

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
  /* The week's biggest repricing. Every row already carries its own move, so
     this only names the largest of them — it is a pointer into the board
     rather than a number the board does not have. */
  const biggestMove = rows.reduce<typeof rows[number] | null>((current, row) => {
    if (!row.summary) return current;
    if (!current?.summary) return row;
    return Math.abs(row.summary.move) > Math.abs(current.summary.move) ? row : current;
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
          {/* The week as a board of cards, one per matchup.

              It was a table: five columns, one row per game, the two teams
              pushed to opposite ends of a very wide row with their numbers
              scattered between them. A sportsbook does not lay a game out
              that way, and the reason is structural: a matchup is a unit.
              Two teams stacked, and a small grid of numbers that reads down
              as well as across, so you can compare the two sides of ONE game
              without traversing a screen to do it.

              Same three markets a book posts, in the same order: the spread,
              the total, and the price. Each cell carries one number, because
              those are the numbers the engine actually produces; a book puts
              juice under its spread and total, and inventing that here would
              be drawing a market that does not exist. */}
          <div className="matchup-slate__rows">
            {rows.map(({ matchup, left, right, favorite, summary, rowKey }) => {
              const selected = rowKey === selectedRow?.rowKey;
              const total = matchup.totalProjection;

              const sideRow = (
                side: typeof left,
                spread: number | undefined,
                overUnder: 'O' | 'U',
                move: number | null,
              ) => (
                <span className="matchup-slate__side">
                  <span className="matchup-slate__team">
                    {leagueChartFlags.avatars ? (
                      <TeamAvatar avatarUrl={side.avatarUrl} name={side.name} />
                    ) : null}
                    <span className="matchup-slate__team-copy">
                      <span className="matchup-slate__team-name" title={side.name}>
                        {boardDisplayName(side.name)}
                      </span>
                      <span className="matchup-slate__team-meta">
                        {boardHandle(side.ownerName, side.record)}
                      </span>
                    </span>
                    {/* Each side still owns its own movement figure. Stacked
                        rather than facing each other, there is no rail to
                        push it into and no ambiguity about whose it is. */}
                    {move != null ? (
                      <span className="matchup-slate__team-move">{moveLabel(move)}</span>
                    ) : null}
                  </span>

                  {/* PK for a pick'em, which is what a book prints, and an
                      empty cell when the line does not exist. A dash in the
                      slot where a number goes reads as a number we are
                      withholding rather than one that was never posted. */}
                  <span className="matchup-slate__cell">
                    {typeof spread !== 'number'
                      ? ''
                      : spread === 0
                        ? 'PK'
                        : `${spread > 0 ? '-' : '+'}${Math.abs(spread).toFixed(1)}`}
                  </span>
                  <span className="matchup-slate__cell">
                    {typeof total === 'number' ? `${overUnder} ${total.toFixed(1)}` : ''}
                  </span>
                  <span
                    className={[
                      'matchup-slate__cell',
                      'matchup-slate__cell--price',
                      side.side === favorite.side ? 'matchup-slate__cell--favorite' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {formatAmericanOdds(side.odds)}
                  </span>
                </span>
              );

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
                  <span className="matchup-slate__card-cols" aria-hidden="true">
                    <span />
                    <span>Spread</span>
                    <span>Total</span>
                    <span>Price</span>
                  </span>

                  {sideRow(left, matchup.teamASpread, 'O', summary ? summary.move : null)}
                  <span aria-hidden="true" className="matchup-slate__at">at</span>
                  {sideRow(right, matchup.teamBSpread, 'U', summary ? -summary.move : null)}

                  {/* The split, drawn once across the foot of the card. The
                      moneylines above already carry the numbers, so this is
                      shape rather than a second reading of them. */}
                  <span aria-hidden="true" className="matchup-slate__prob-track">
                    <span
                      className="matchup-slate__prob-fill"
                      style={{ width: `${left.winProb}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* The week at a glance, under the board rather than beside it.

              In the aside it was a narrow card stacked under a chart, so the
              right column ran well past the bottom of the board and the page
              finished lopsided. It is four facts about six games — it wants
              width, not depth, and down here it can carry the crests that
              make each one identifiable without reading it.

              Every card names both teams. "Biggest favourite: Apollo −141"
              answers half a question, favourite over whom?, and the missing
              half is the part worth reading.

              One unit at a time, too. The header carries a global
              price/percent toggle, so every price here goes through
              formatAmericanOdds and follows it. The total is the exception
              and is not a unit question: it is fantasy points, which is what
              it says. */}
          <section className="matchup-slate__glance">
            <span className="matchup-slate__glance-title">The week at a glance</span>
            <div className="matchup-slate__glance-cards">
              {biggestFavorite ? (
                <GlanceCard
                  label="Biggest favorite"
                  left={
                    biggestFavorite.favorite.side === biggestFavorite.left.side
                      ? biggestFavorite.left
                      : biggestFavorite.right
                  }
                  right={
                    biggestFavorite.favorite.side === biggestFavorite.left.side
                      ? biggestFavorite.right
                      : biggestFavorite.left
                  }
                  separator="over"
                  value={formatAmericanOdds(biggestFavorite.favorite.odds)}
                />
              ) : null}

              {closestLine ? (
                <GlanceCard
                  label="Closest line"
                  left={closestLine.left}
                  right={closestLine.right}
                  separator="vs"
                  value={formatAmericanOdds(closestLine.favorite.odds)}
                />
              ) : null}

              {highestTotal?.matchup.totalProjection != null ? (
                <GlanceCard
                  label="Highest total"
                  left={highestTotal.left}
                  right={highestTotal.right}
                  separator="vs"
                  unit="pts"
                  value={highestTotal.matchup.totalProjection.toFixed(1)}
                />
              ) : null}

              {biggestMove?.summary ? (
                <GlanceCard
                  label="Biggest move"
                  left={biggestMove.left}
                  right={biggestMove.right}
                  separator="vs"
                  tone={biggestMove.summary.move >= 0 ? 'up' : 'down'}
                  unit="pp"
                  value={moveLabel(biggestMove.summary.move)}
                />
              ) : null}
            </div>
          </section>
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
