import type { CSSProperties } from 'react';
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

function heatColor(winProb: number) {
  const t = Math.max(0, Math.min(1, winProb / 100));
  const red = [168, 70, 70];
  const green = [58, 150, 115];
  const mixed = red.map((channel, index) => Math.round(channel + (green[index] - channel) * t));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

export function ScheduleGrid({ title, items, onSelectWeek }: ScheduleGridProps) {
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
        <div className="schedule-grid__heat" aria-label="Season win probability heat strip">
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
        </div>
      ) : null}

      {leagueChartFlags.scheduleWorm && pricedItems.length > 1 ? (
        <div className="schedule-grid__worm" aria-label="Expected wins by week">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline className="schedule-grid__worm-baseline" points={baselinePoints} />
            <polyline className="schedule-grid__worm-line" points={wormPoints} />
          </svg>
          <div className="schedule-grid__worm-meta">
            <span>Expected wins</span>
            <span>.500 pace</span>
          </div>
        </div>
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
    </section>
  );
}
