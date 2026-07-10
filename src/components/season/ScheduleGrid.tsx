import { useState, type CSSProperties } from 'react';
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
  return '—';
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
  const maxWorm = Math.max(1, ...cumulativeWins.map((item) => item.expectedWins), ...cumulativeWins.map((item) => item.baseline));
  const wormPoints = cumulativeWins
    .map((item, index) => {
      const x = cumulativeWins.length <= 1 ? 0 : (index / (cumulativeWins.length - 1)) * 100;
      const y = 100 - (item.expectedWins / maxWorm) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  const baselinePoints = cumulativeWins
    .map((item, index) => {
      const x = cumulativeWins.length <= 1 ? 0 : (index / (cumulativeWins.length - 1)) * 100;
      const y = 100 - (item.baseline / maxWorm) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  const wormTakeaway = expectedWinsTakeaway(cumulativeWins);
  const heatSummary = heatTakeaway(items);
  const yTicks = [maxWorm, maxWorm / 2, 0];

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
        <button
          className="schedule-grid__chart-card"
          onClick={() => setExpandedChart('heat')}
          type="button"
        >
          <span className="schedule-grid__chart-head">
            <span>
              <span className="schedule-grid__chart-title">Season heat strip</span>
              <span className="schedule-grid__chart-subtitle">Every week by win probability. Playoff weeks stay TBD.</span>
            </span>
            <span className="schedule-grid__inspect">Inspect</span>
          </span>
          <span className="schedule-grid__heat" aria-label="Season win probability heat strip">
            {items.map((item) => {
              const winProb = item.winProb ?? (item.status === 'win' ? 100 : item.status === 'loss' ? 0 : 50);
              return (
                <span
                  className={[
                    'schedule-grid__heat-cell',
                    item.isPlayoff ? 'schedule-grid__heat-cell--playoff' : '',
                    item.status === 'bye' ? 'schedule-grid__heat-cell--bye' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={`heat-${item.week}`}
                  style={{ '--heat-color': heatColor(winProb) } as CSSProperties}
                  title={`Week ${item.week}${item.isPlayoff ? ': playoff TBD' : typeof item.winProb === 'number' ? `: ${item.winProb.toFixed(1)}%` : ''}`}
                >
                  {item.week}
                </span>
              );
            })}
          </span>
          <span className="schedule-grid__heat-axis">
            <span>Harder</span>
            <span>Coin flip</span>
            <span>Softer</span>
          </span>
          <span className="schedule-grid__takeaway">{heatSummary}</span>
        </button>
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
              <span className="schedule-grid__chart-subtitle">Your projected win total banking week by week vs. a .500 team.</span>
            </span>
            <span className="schedule-grid__inspect">Inspect</span>
          </span>
          <span className="schedule-grid__worm" aria-label="Expected wins by week">
            <span className="schedule-grid__axis-label schedule-grid__axis-label--y">Cumulative wins</span>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect className="schedule-grid__worm-ahead" x="0" y="0" width="100" height="50" />
              <rect className="schedule-grid__worm-behind" x="0" y="50" width="100" height="50" />
              <polyline className="schedule-grid__worm-baseline" points={baselinePoints} />
              <polyline className="schedule-grid__worm-line" points={wormPoints} />
            </svg>
            <span className="schedule-grid__worm-y-ticks">
              {yTicks.map((tick) => <span key={`tick-${tick.toFixed(2)}`}>{tick.toFixed(1)}</span>)}
            </span>
            <span className="schedule-grid__worm-line-label schedule-grid__worm-line-label--team">Your team</span>
            <span className="schedule-grid__worm-line-label schedule-grid__worm-line-label--pace">.500</span>
            <span className="schedule-grid__axis-label schedule-grid__axis-label--x">Week</span>
          </span>
          <span className="schedule-grid__worm-x-ticks">
            {cumulativeWins.map((item) => <span key={`week-tick-${item.week}`}>{item.week}</span>)}
          </span>
          <span className="schedule-grid__pace-labels">
            <span>Ahead of pace</span>
            <span>Behind pace</span>
          </span>
          <span className="schedule-grid__takeaway">{wormTakeaway}</span>
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
              clickable ? 'schedule-grid__row--clickable' : '',
              item.status === 'projected' && typeof item.yourLine === 'number'
                ? item.yourLine < 0
                  ? 'schedule-grid__row--favored'
                  : 'schedule-grid__row--underdog'
                : '',
            ].join(' ')}
            key={`${item.week}-${item.opponent}`}
            onClick={clickable ? () => onSelectWeek?.(item) : undefined}
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
                    {item.yourLine ? formatAmericanOdds(item.yourLine) : '—'}
                  </span>
                  <span className="schedule-grid__result-detail">
                    {item.status === 'live' ? 'Live line' : 'Projected'}
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
                <p className="schedule-grid__chart-subtitle">X-axis is week. Y-axis is cumulative expected wins.</p>
                <div className="schedule-grid__worm schedule-grid__worm--detail">
                  <span className="schedule-grid__axis-label schedule-grid__axis-label--y">Cumulative wins</span>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <rect className="schedule-grid__worm-ahead" x="0" y="0" width="100" height="50" />
                    <rect className="schedule-grid__worm-behind" x="0" y="50" width="100" height="50" />
                    <polyline className="schedule-grid__worm-baseline" points={baselinePoints} />
                    <polyline className="schedule-grid__worm-line" points={wormPoints} />
                  </svg>
                  <span className="schedule-grid__worm-y-ticks">
                    {yTicks.map((tick) => <span key={`modal-tick-${tick.toFixed(2)}`}>{tick.toFixed(1)}</span>)}
                  </span>
                  <span className="schedule-grid__worm-line-label schedule-grid__worm-line-label--team">Your team</span>
                  <span className="schedule-grid__worm-line-label schedule-grid__worm-line-label--pace">.500</span>
                  <span className="schedule-grid__axis-label schedule-grid__axis-label--x">Week</span>
                </div>
                <div className="schedule-grid__detail-list">
                  {cumulativeWins.map((item) => (
                    <div className="schedule-grid__detail-row" key={`detail-worm-${item.week}`}>
                      <span>Week {item.week}</span>
                      <span>{item.expectedWins.toFixed(2)} expected wins</span>
                      <span>{item.baseline.toFixed(1)} .500 pace</span>
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
