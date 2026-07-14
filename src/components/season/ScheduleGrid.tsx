import { useRef, useState, type CSSProperties } from 'react';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { leagueChartFlags } from '../../config/leagueChartFlags';
import { TeamAvatar } from '../league/TeamAvatar';
import './ScheduleGrid.css';

export interface ScheduleGridItem {
  week: number;
  opponent: string;
  opponentAvatarUrl?: string | null;
  opponentRecord: string;
  status: 'projected' | 'live' | 'bye' | 'win' | 'loss';
  yourLine?: number;
  winProb?: number;
  projection?: number;
  opponentProjection?: number;
  note?: string;
  isPlayoff?: boolean;
  isHome?: boolean;
  score?: string;
}

interface ScheduleGridProps {
  title: string;
  items: ScheduleGridItem[];
  onSelectWeek?: (item: ScheduleGridItem) => void;
}

type ExpandedScheduleChart = 'heat' | 'worm' | null;

function heatColor(winProb: number) {
  const t = Math.max(0, Math.min(1, winProb / 100));
  const red = [168, 70, 70];
  const green = [58, 150, 115];
  const mixed = red.map((channel, index) => Math.round(channel + (green[index] - channel) * t));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function formatWinProb(item: ScheduleGridItem) {
  if (typeof item.winProb === 'number') return `${item.winProb.toFixed(1)}%`;
  if (item.status === 'win') return '100.0%';
  if (item.status === 'loss') return '0.0%';
  if (item.isPlayoff) return 'TBD';
  if (item.status === 'bye') return 'BYE';
  return 'N/A';
}

function pricedChipColor(item: ScheduleGridItem) {
  if (typeof item.winProb === 'number') return heatColor(item.winProb);
  if (item.status === 'win') return heatColor(100);
  if (item.status === 'loss') return heatColor(0);
  return 'transparent';
}

function expectedWinsTakeaway(
  cumulativeWins: { week: number; expectedWins: number; baseline: number; isPlayoff?: boolean }[],
) {
  const regular = cumulativeWins.filter((item) => !item.isPlayoff);
  const last = regular.at(-1);
  if (!last) return 'No priced weeks yet.';
  const diff = last.expectedWins - last.baseline;
  if (Math.abs(diff) < 0.15) return `Dead even with .500 pace through Week ${last.week}.`;
  return `${Math.abs(diff).toFixed(1)} wins ${diff > 0 ? 'ahead of' : 'behind'} .500 pace through Week ${last.week}.`;
}

function heatTakeaway(items: ScheduleGridItem[]) {
  const priced = items.filter((item) => typeof item.winProb === 'number' && !item.isPlayoff);
  if (priced.length === 0) return 'No priced regular-season weeks yet.';
  const toughest = priced.reduce((low, item) => (item.winProb! < low.winProb! ? item : low), priced[0]);
  const softest = priced.reduce((high, item) => (item.winProb! > high.winProb! ? item : high), priced[0]);
  return `Softest: Week ${softest.week} ${formatWinProb(softest)} · toughest: Week ${toughest.week} ${formatWinProb(toughest)}.`;
}

export function ScheduleGrid({ title, items, onSelectWeek }: ScheduleGridProps) {
  const [expandedChart, setExpandedChart] = useState<ExpandedScheduleChart>(null);
  const rowRefs = useRef<Record<number, HTMLElement | null>>({});
  const pricedItems = items.filter((item) => typeof item.winProb === 'number');
  const hasFutureBestLineupRows = items.some(
    (item) => item.status === 'projected' && !item.isPlayoff && typeof item.yourLine === 'number',
  );
  const cumulativeWins = items.reduce<
    { week: number; expectedWins: number; baseline: number; status: ScheduleGridItem['status']; isPlayoff?: boolean }[]
  >((rows, item) => {
    const previous = rows.at(-1)?.expectedWins ?? 0;
    const expected =
      item.status === 'win'
        ? 1
        : item.status === 'loss' || item.status === 'bye' || item.isPlayoff
          ? 0
          : (item.winProb ?? 50) / 100;
    rows.push({
      week: item.week,
      expectedWins: previous + expected,
      baseline: item.week / 2,
      status: item.status,
      isPlayoff: item.isPlayoff,
    });
    return rows;
  }, []);
  const deltaRows = cumulativeWins.map((item) => ({
    ...item,
    delta: item.expectedWins - item.baseline,
  }));
  const maxDelta = Math.max(0.5, ...deltaRows.map((item) => Math.abs(item.delta)));
  const deltaPoints = deltaRows
    .map((item, index) => {
      const x = deltaRows.length <= 1 ? 0 : (index / (deltaRows.length - 1)) * 100;
      const y = 50 - (item.delta / maxDelta) * 42;
      return `${x},${y}`;
    })
    .join(' ');
  const wormTakeaway = expectedWinsTakeaway(cumulativeWins);
  const heatSummary = heatTakeaway(items);
  const yTicks = [maxDelta, 0, -maxDelta];
  const jumpToWeek = (week: number) => {
    rowRefs.current[week]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  return (
    <section aria-labelledby="schedule-grid-title" className="schedule-grid">
      <div className="schedule-grid__header">
        <p className="schedule-grid__kicker" id="schedule-grid-title">
          {title}
        </p>
      </div>
      {hasFutureBestLineupRows ? (
        <p className="schedule-grid__note">Future weeks assume best lineups.</p>
      ) : null}

      {leagueChartFlags.scheduleHeatStrip && items.length > 0 ? (
        <div className="schedule-grid__chart-card schedule-grid__chart-card--heat-nav">
          <span className="schedule-grid__chart-head">
            <span>
              <span className="schedule-grid__chart-title">Season heat strip</span>
              <span className="schedule-grid__chart-subtitle">Jump to any week by price.</span>
            </span>
          </span>
          <span className="schedule-grid__heat" aria-label="Season win probability heat strip">
            {items.map((item) => {
              const winProb = item.winProb ?? (item.status === 'win' ? 100 : item.status === 'loss' ? 0 : 50);
              return (
                <button
                  className={[
                    'schedule-grid__heat-cell',
                    item.isPlayoff ? 'schedule-grid__heat-cell--playoff' : '',
                    item.status === 'bye' ? 'schedule-grid__heat-cell--bye' : '',
                    item.status === 'live' ? 'schedule-grid__heat-cell--current' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={`heat-${item.week}`}
                  onClick={() => jumpToWeek(item.week)}
                  style={{ '--heat-color': heatColor(winProb) } as CSSProperties}
                  title={`Week ${item.week}${item.isPlayoff ? ': playoff TBD' : typeof item.winProb === 'number' ? `: ${item.winProb.toFixed(1)}%` : ''}`}
                  type="button"
                >
                  <span>{item.week}</span>
                  <span>{item.isPlayoff ? 'TBD' : item.status === 'bye' ? 'BYE' : formatWinProb(item).replace('.0%', '%')}</span>
                </button>
              );
            })}
          </span>
          <span className="schedule-grid__takeaway">{heatSummary}</span>
        </div>
      ) : null}

      {leagueChartFlags.scheduleWorm && pricedItems.length > 1 ? (
        <button
          className="schedule-grid__chart-card schedule-grid__chart-card--worm"
          onClick={() => setExpandedChart('worm')}
          type="button"
        >
          <span className="schedule-grid__chart-head">
            <span>
              <span className="schedule-grid__chart-title">Expected wins pace</span>
              <span className="schedule-grid__chart-subtitle">{wormTakeaway}</span>
            </span>
            <span className="schedule-grid__inspect">Inspect</span>
          </span>
          <span className="schedule-grid__worm schedule-grid__worm--spark" aria-label="Expected wins pace delta">
            <span className="schedule-grid__axis-label schedule-grid__axis-label--y">Wins vs .500</span>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <line className="schedule-grid__worm-baseline" x1="0" x2="100" y1="50" y2="50" />
              <polyline className="schedule-grid__worm-line" points={deltaPoints} />
            </svg>
            <span className="schedule-grid__worm-y-ticks">
              {yTicks.map((tick) => <span key={`tick-${tick.toFixed(2)}`}>{tick > 0 ? '+' : ''}{tick.toFixed(1)}</span>)}
            </span>
            <span className="schedule-grid__axis-label schedule-grid__axis-label--x">Week</span>
          </span>
          <span className="schedule-grid__worm-x-ticks">
            {cumulativeWins.map((item) => <span key={`week-tick-${item.week}`}>{item.week}</span>)}
          </span>
        </button>
      ) : null}

      <div className="schedule-grid__rows">
        {items.map((item) => {
          const clickable = Boolean(onSelectWeek) && item.status !== 'bye' && !item.isPlayoff;
          const opponentMeta =
            item.status === 'bye'
              ? 'Recovery week'
              : item.isPlayoff
                ? 'Playoff week · opponent TBD'
                : item.opponentRecord && item.opponentRecord !== '0-0'
                  ? item.opponentRecord
                  : '';
          return (
          <article
            className={[
              'schedule-grid__row',
              `schedule-grid__row--${item.status}`,
              item.status === 'live' ? 'schedule-grid__row--current' : '',
              clickable ? 'schedule-grid__row--clickable' : '',
              item.status === 'projected' && typeof item.yourLine === 'number'
                ? item.yourLine < 0
                  ? 'schedule-grid__row--favored'
                  : 'schedule-grid__row--underdog'
                : '',
            ].join(' ')}
            key={`${item.week}-${item.opponent}`}
            onClick={clickable ? () => onSelectWeek?.(item) : undefined}
            ref={(node) => {
              rowRefs.current[item.week] = node;
            }}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={
              clickable
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectWeek?.(item);
                    }
                  }
                : undefined
            }
          >
            <div className="schedule-grid__week">
              <span className="schedule-grid__week-label">WK {item.week}</span>
            </div>

            <div className="schedule-grid__opponent">
              <p className="schedule-grid__opponent-name">
                {leagueChartFlags.avatars && item.status !== 'bye' && item.isPlayoff ? (
                  <span className="schedule-grid__tbd-avatar">TBD</span>
                ) : leagueChartFlags.avatars && item.status !== 'bye' ? (
                  <TeamAvatar
                    avatarUrl={item.opponentAvatarUrl}
                    name={item.opponent}
                  />
                ) : null}
                <span>
                  {item.status === 'bye'
                    ? 'Bye'
                    : item.isPlayoff
                      ? 'Playoff week'
                      : `${item.isHome ? 'vs' : '@'} ${item.opponent}`}
                </span>
              </p>
              {opponentMeta ? <p className="schedule-grid__opponent-meta">{opponentMeta}</p> : null}
            </div>

            <div className="schedule-grid__result">
              {item.status === 'win' || item.status === 'loss' ? (
                <>
                  <span className="schedule-grid__result-badge">
                    {item.status === 'win' ? 'W' : 'L'}
                  </span>
                  <span className="schedule-grid__result-detail">{item.score}</span>
                </>
              ) : item.status === 'bye' ? (
                <span className="schedule-grid__result-bye">BYE</span>
              ) : item.isPlayoff ? (
                <span className="schedule-grid__result-bye">TBD</span>
              ) : (
                <>
                  <span className="schedule-grid__odds">
                    {item.yourLine ? formatAmericanOdds(item.yourLine) : 'N/A'}
                  </span>
                  <span
                    className="schedule-grid__result-detail schedule-grid__result-detail--priced"
                    style={{ '--heat-color': pricedChipColor(item) } as CSSProperties}
                  >
                    {formatWinProb(item)}
                  </span>
                </>
              )}
            </div>
            {clickable ? (
              <span aria-hidden="true" className="schedule-grid__chevron">
                ›
              </span>
            ) : null}
          </article>
          );
        })}
      </div>
      {expandedChart ? (
        <div
          aria-modal="true"
          className="schedule-grid__modal"
          onClick={() => setExpandedChart(null)}
          role="dialog"
        >
          <div className="schedule-grid__modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="schedule-grid__modal-close" onClick={() => setExpandedChart(null)} type="button">
              Close
            </button>
            {expandedChart === 'heat' ? (
              <>
                <h3 className="schedule-grid__modal-title">Season heat strip</h3>
                <p className="schedule-grid__chart-subtitle">Week number on the x-axis. Color is your win probability.</p>
                <div className="schedule-grid__detail-list">
                  {items.map((item) => (
                    <div className="schedule-grid__detail-row" key={`detail-heat-${item.week}`}>
                      <span>Week {item.week}</span>
                      <span>{item.isPlayoff ? 'Playoff TBD' : item.status === 'bye' ? 'Bye' : `${item.isHome ? 'vs' : '@'} ${item.opponent}`}</span>
                      <span>{formatWinProb(item)}</span>
                    </div>
                  ))}
                </div>
                <p className="schedule-grid__takeaway">{heatSummary}</p>
              </>
            ) : (
              <>
                <h3 className="schedule-grid__modal-title">Expected wins pace</h3>
                <p className="schedule-grid__chart-subtitle">X-axis is week. Y-axis is wins above or below .500 pace.</p>
                <div className="schedule-grid__worm schedule-grid__worm--detail">
                  <span className="schedule-grid__axis-label schedule-grid__axis-label--y">Wins vs .500</span>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <line className="schedule-grid__worm-baseline" x1="0" x2="100" y1="50" y2="50" />
                    <polyline className="schedule-grid__worm-line" points={deltaPoints} />
                  </svg>
                  <span className="schedule-grid__worm-y-ticks">
                    {yTicks.map((tick) => <span key={`modal-tick-${tick.toFixed(2)}`}>{tick > 0 ? '+' : ''}{tick.toFixed(1)}</span>)}
                  </span>
                  <span className="schedule-grid__axis-label schedule-grid__axis-label--x">Week</span>
                </div>
                <div className="schedule-grid__detail-list">
                  {deltaRows.map((item) => (
                    <div className="schedule-grid__detail-row" key={`detail-worm-${item.week}`}>
                      <span>Week {item.week}</span>
                      <span>{item.expectedWins.toFixed(2)} expected wins</span>
                      <span>{item.delta >= 0 ? '+' : ''}{item.delta.toFixed(2)} vs .500</span>
                    </div>
                  ))}
                </div>
                <p className="schedule-grid__takeaway">{wormTakeaway}</p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
