import type { LeaguePricing, PricedFuture } from '../../services/leagueApi';
import type { CSSProperties, ReactNode } from 'react';
import { formatAmericanOdds, impliedProbability } from '../../utils/formatOdds';
import { displayedDelta, formatSignedDisplayedDeltaValue } from '../../utils/displayDelta';
import './SeasonBand.css';

/* Matches LeagueFutures so the same team reads the same on both tabs. */
function formatPercent(value: number) {
  if (value < 1) return '<1%';
  if (value > 99) return '>99%';
  return `${Math.round(value)}%`;
}

/**
 * The season, directly under the week.
 *
 * The hub leads with this week because that is what a manager opens the app
 * for, but the numbers that actually separate this product are seasonal and
 * they used to be a tab away. This is a strip rather than a row of cards on
 * purpose: it should read as one thought sitting under the matchup line, not
 * as four modules competing with it.
 *
 * Every value is served in `pricing.futures`. `finalsProb` in particular is
 * served today and rendered nowhere, which left the futures ladder with a
 * hole between playoffs and the title.
 */
/* The sparkline's own box. Small enough to sit inside a 62px bar, wide enough
   that eight weeks of movement is a shape rather than a zigzag. */
const SPARK_W = 132;
const SPARK_H = 24;

/**
 * The recorded title price per week, as a line.
 *
 * `titleHistory` is served and, until now, rendered nowhere — the engine has
 * been recording this all season with nothing reading it. Nothing is computed
 * here: the odds are Franco's, and the only transforms are the two the
 * frontend is allowed to make, American odds to their implied percentage and
 * an after-minus-before pair. The line is plotted on the percentage rather
 * than the price so that up means better, which a moneyline does not: +1304
 * shortening to +390 is the line going the manager's way while the number
 * falls.
 */
function titleTrend(
  future: PricedFuture,
  history: LeaguePricing['titleHistory'] | null,
  currentWeek: number,
) {
  const key = String(future.rosterId);
  const points = (history ?? [])
    /* Snapshots written past the current fantasy week are phantoms: the
       scheduler recorded them while the app was reading the NFL's preseason
       week as a fantasy week, so the chart drew a decline across two weeks
       nobody had played. Preseason movement is real and stays; a week that
       has not happened does not. */
    .filter((entry) => entry.week <= currentWeek)
    .filter((entry) => entry.odds?.[key] != null)
    .sort((a, b) => a.week - b.week)
    .map((entry) => ({ week: entry.week, odds: entry.odds[key] }));

  /* One recorded week is a dot, not a trend, and drawing it would imply a
     movement we have not observed. */
  if (points.length < 2) return null;

  const probs = points.map((p) => impliedProbability(p.odds));
  const min = Math.min(...probs);
  const max = Math.max(...probs);
  const span = max - min;
  const inset = 2;
  const usable = SPARK_H - inset * 2;

  const path = probs
    .map((prob, i) => {
      const x = (i / (probs.length - 1)) * SPARK_W;
      /* A flat season is a flat line through the middle, not a divide by zero. */
      const y = span === 0 ? SPARK_H / 2 : inset + usable - ((prob - min) / span) * usable;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const first = points[0];
  const last = points[points.length - 1];
  const delta = displayedDelta(first.odds, last.odds, { mapValue: impliedProbability });

  return {
    path,
    delta,
    deltaText: formatSignedDisplayedDeltaValue(delta),
    firstWeek: first.week,
    lastWeek: last.week,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  };
}

export function SeasonBand({
  future,
  history = null,
  currentWeek = 1,
  action = null,
}: {
  future: PricedFuture;
  history?: LeaguePricing['titleHistory'] | null;
  currentWeek?: number;
  /** Pinned to the end of the bar. The card lives here now; see MatchupPage. */
  action?: ReactNode;
}) {
  /* `short` is the label as it reads on one line on a phone. Truncating the
     full labels there put an ellipsis on every one of them and still ran the
     row off the screen. */
  const items: { label: string; short?: string; value: string; strong?: boolean }[] = [];

  items.push({
    label: 'Championship',
    short: 'Title',
    value: formatAmericanOdds(future.championOdds),
    strong: true,
  });

  if (future.playoffProb != null) {
    items.push({ label: 'Make playoffs', short: 'Playoffs', value: formatPercent(future.playoffProb) });
  }

  if (future.finalsProb != null) {
    items.push({ label: 'Reach the final', short: 'Final', value: formatPercent(future.finalsProb) });
  }

  const projected = future.projRecord
    ?? (future.projWins != null && future.projLosses != null
      ? `${future.projWins.toFixed(1)}-${future.projLosses.toFixed(1)}`
      : null);
  if (projected) {
    items.push({ label: 'Projected finish', short: 'Finish', value: projected });
  }

  if (future.avgSeed != null) {
    items.push({ label: 'Average seed', short: 'Seed', value: future.avgSeed.toFixed(1) });
  }

  const trend = titleTrend(future, history, currentWeek);

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Your season"
      className="season-band"
      /* The rule under the bar is the playoff probability drawn as a width.
         Served field, rendered as a bar the way the matchup card already draws
         win probability. Nothing is computed here. */
      style={
        future.playoffProb != null
          ? ({ '--season-meter': `${Math.max(0, Math.min(100, Math.round(future.playoffProb)))}%` } as CSSProperties)
          : undefined
      }
    >
      <span className="season-band__eyebrow">Your season</span>
      <div className="season-band__items">
        {items.map((item) => (
          <div
            className={[
              'season-band__item',
              item.strong ? 'season-band__item--strong' : '',
            ].filter(Boolean).join(' ')}
            key={item.label}
          >
            <span className="season-band__label">
              <span className="season-band__label-full">{item.label}</span>
              <span className="season-band__label-short">{item.short ?? item.label}</span>
            </span>
            <span className="season-band__value">{item.value}</span>
          </div>
        ))}
        {trend ? (
          <div className={`season-band__trend season-band__trend--${trend.direction}`}>
            <span className="season-band__trend-label">
              Title odds · Wk {trend.firstWeek}–{trend.lastWeek}
            </span>
            <svg
              className="season-band__spark"
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              /* Decorative: the delta beside it states the same thing in words,
                 so a screen reader gets the number rather than a path. */
              aria-hidden="true"
              focusable="false"
            >
              <polyline className="season-band__spark-line" points={trend.path} />
            </svg>
            <span className="season-band__trend-delta">{trend.deltaText}</span>
          </div>
        ) : null}
      </div>
      {action ? <div className="season-band__action">{action}</div> : null}
    </section>
  );
}
