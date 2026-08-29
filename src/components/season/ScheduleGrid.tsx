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


/**
 * How far from a coin flip a week has to be before the chip is fully coloured.
 *
 * This used to map 0-100 across the whole ramp, which spends the entire scale
 * on values a fantasy schedule never produces. Real weeks sit between about
 * 40% and 62%, so 61.4% - comfortably the softest week of a season - came out
 * 23% of the way from neutral to green, which is to say grey. A season of
 * genuinely different weeks rendered as seventeen identical dark boxes.
 *
 * Fifteen points either side of even is the honest span: it covers what
 * actually happens, and it is a fixed ruler rather than one normalised to
 * each team's own range, so two teams' strips can be compared.
 */
const HEAT_SPAN = 15;

function heatColor(winProb: number) {
  /* -1 is a full underdog, +1 a full favourite, 0 a coin flip. */
  const t = Math.max(-1, Math.min(1, (winProb - 50) / HEAT_SPAN));
  const neutral = [16, 18, 21];
  /* The product's own green and red, so a week that favours you reads as the
     same green a price does. */
  const end = t >= 0 ? [52, 210, 123] : [255, 92, 77];
  const mixed = neutral.map((channel, index) =>
    Math.round(channel + (end[index] - channel) * Math.abs(t)),
  );
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
  /* The count leads. "Favored in ten of fourteen" is the one sentence that
     summarises a whole strip, and the two extremes are the detail under it.
     Only weeks carrying a probability are counted: a played week is a result,
     not a price, and folding those in would quietly answer a different
     question. */
  const favored = priced.filter((item) => item.winProb! > 50).length;
  return `Favored in ${favored} of ${priced.length} weeks · softest Week ${softest.week} ${formatWinProb(softest)} · toughest Week ${toughest.week} ${formatWinProb(toughest)}.`;
}






export function ScheduleGrid({
  title,
  items,
  onSelectWeek,
  /* Strip only, no row list.
     On the Season tab the heat strip and the row list are the same seventeen
     weeks rendered twice, one directly under the other. The strip is the better
     of the two — it fits on one line, colours by price, and opens the same week
     detail on click — so the rows are seventeen tall, near-empty duplicates
     between the reader and the thing they came for. */
  stripOnly = false,
}: ScheduleGridProps & { stripOnly?: boolean }) {
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
          {/* No inner heading: the section directly above already names this,
              and two titles stacked on one strip reads as two components. */}
          <span className="schedule-grid__heat" aria-label="Season win probability heat strip">
            {items.map((item) => {
              const settled = item.status === 'win' || item.status === 'loss';
              /* A finished week is a RESULT. Painting it 100% or 0% dressed a
                 win up as a probability, which is the one thing a book must
                 never do: those numbers were never quoted, they are just the
                 scoreboard wearing a percentage sign. Settled weeks show W or
                 L and the price they closed at; only unplayed weeks show a
                 probability, because only they still have one. */
              const winProb = item.winProb ?? 50;
              const heatFor = settled
                ? item.status === 'win' ? 72 : 28
                : winProb;
              const closing = typeof item.yourLine === 'number'
                ? formatAmericanOdds(item.yourLine)
                : null;

              return (
                <button
                  className={[
                    'schedule-grid__heat-cell',
                    settled ? `schedule-grid__heat-cell--${item.status}` : '',
                    item.isPlayoff ? 'schedule-grid__heat-cell--playoff' : '',
                    item.status === 'bye' ? 'schedule-grid__heat-cell--bye' : '',
                    item.status === 'live' ? 'schedule-grid__heat-cell--current' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={`heat-${item.week}`}
                  onClick={() => jumpToWeek(item.week)}
                  style={{ '--heat-color': heatColor(heatFor) } as CSSProperties}
                  title={`Week ${item.week}${item.isPlayoff ? ': playoff TBD' : typeof item.winProb === 'number' ? `: ${item.winProb.toFixed(1)}%` : ''}`}
                  type="button"
                >
                  <span className="schedule-grid__heat-week">{item.week}</span>
                  <span className="schedule-grid__heat-value">
                    {item.isPlayoff
                      ? 'TBD'
                      : item.status === 'bye'
                        ? 'BYE'
                        : settled
                          ? item.status === 'win' ? 'W' : 'L'
                          : formatWinProb(item).replace('.0%', '%')}
                  </span>
                  {settled && closing ? (
                    <span className="schedule-grid__heat-close">{closing}</span>
                  ) : null}
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
          questions, how good you are, and what a .500 schedule looks like ,
          into one number nobody could interpret.

          The priced standings below answer the question it was reaching for,
          correctly: xW-L is your record with the schedule removed, and
          Schedule is the difference. */}

      {stripOnly ? null : (
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
                typeof item.projection === 'number' ? (
                  <span className="schedule-grid__proj">
                    <span className="schedule-grid__proj-val">{item.projection.toFixed(1)}</span>
                    <span className="schedule-grid__proj-label">proj pts</span>
                  </span>
                ) : (
                  <span className="schedule-grid__result-bye">TBD</span>
                )
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
      )}
    </section>
  );
}
