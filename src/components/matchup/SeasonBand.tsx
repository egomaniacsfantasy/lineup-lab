import type { PricedFuture } from '../../services/leagueApi';
import type { CSSProperties } from 'react';
import { formatAmericanOdds } from '../../utils/formatOdds';
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
export function SeasonBand({ future }: { future: PricedFuture }) {
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
      </div>
    </section>
  );
}
