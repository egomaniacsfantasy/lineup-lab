import { formatAmericanOdds } from '../../utils/formatOdds';
import './ScheduleGrid.css';

export interface ScheduleGridItem {
  week: number;
  opponent: string;
  opponentRecord: string;
  status: 'projected' | 'live' | 'bye' | 'win' | 'loss';
  yourLine?: number;
  isHome?: boolean;
  score?: string;
}

interface ScheduleGridProps {
  title: string;
  items: ScheduleGridItem[];
  onSelectWeek?: (item: ScheduleGridItem) => void;
}

export function ScheduleGrid({ title, items, onSelectWeek }: ScheduleGridProps) {
  return (
    <section aria-labelledby="schedule-grid-title" className="schedule-grid">
      <div className="schedule-grid__header">
        <p className="schedule-grid__kicker" id="schedule-grid-title">
          {title}
        </p>
      </div>

      <div className="schedule-grid__rows">
        {items.map((item) => {
          const clickable = Boolean(onSelectWeek) && item.status !== 'bye';
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
              <p className="schedule-grid__opponent-name">{item.opponent}</p>
              <p className="schedule-grid__opponent-meta">
                {item.status === 'bye'
                  ? 'Recovery week'
                  : `${item.isHome ? 'vs' : '@'} ${item.opponentRecord}`}
              </p>
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
