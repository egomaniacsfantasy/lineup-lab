import { useRef, type CSSProperties } from 'react';
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
  const red = [176, 76, 86];
  const neutral = [16, 18, 21];
  const green = [58, 162, 120];
  const start = t <= 0.5 ? red : neutral;
  const end = t <= 0.5 ? neutral : green;
  const mix = t <= 0.5 ? t * 2 : (t - 0.5) * 2;
  const mixed = start.map((channel, index) => Math.round(channel + (end[index] - channel) * mix));
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

function heatTakeaway(items: ScheduleGridItem[]) {
  const priced = items.filter((item) => typeof item.winProb === 'number' && !item.isPlayoff);
  if (priced.length === 0) return 'No priced regular-season weeks yet.';
  const toughest = priced.reduce((low, item) => (item.winProb! < low.winProb! ? item : low), priced[0]);
  const softest = priced.reduce((high, item) => (item.winProb! > high.winProb! ? item : high), priced[0]);
  return `Softest: Week ${softest.week} ${formatWinProb(softest)} · toughest: Week ${toughest.week} ${formatWinProb(toughest)}.`;
}






export function ScheduleGrid({ title, items, onSelectWeek }: ScheduleGridProps) {
  const rowRefs = useRef<Record<number, HTMLElement | null>>({});
  const hasFutureBestLineupRows = items.some(
    (item) => item.status === 'projected' && !item.isPlayoff && typeof item.yourLine === 'number',
  );
  const heatSummary = heatTakeaway(items);
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

      {/* "Expected wins pace" lived here and is gone.

          It charted cumulative expected wins against a .500 baseline of
          week/2, and that baseline was wrong twice over: a bye adds nothing to
          your expected wins but still advances the baseline by half a win, so
          a bye alone read as falling behind, and every playoff week did the
          same thing again at the end of the season. It also mixed two
          questions — how good you are, and what a .500 schedule looks like —
          into one number nobody could interpret.

          The priced standings below answer the question it was reaching for,
          correctly: xW-L is your record with the schedule removed, and
          Schedule is the difference. */}

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
    </section>
  );
}
