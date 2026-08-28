/**
 * Global odds display format. 'american' shows sportsbook moneylines,
 * 'percent' translates every line to its implied win percentage for
 * people who don't speak betting. Set by OddsFormatProvider; the app
 * shell re-renders everything when it changes.
 */
export type OddsFormat = 'american' | 'percent';

let currentFormat: OddsFormat = 'american';

export function setOddsFormat(format: OddsFormat) {
  currentFormat = format;
}

export function getOddsFormat(): OddsFormat {
  return currentFormat;
}

/** Implied win probability (0..100) of an American moneyline. */
export function impliedProbability(moneyline: number): number {
  return moneyline <= -100
    ? (-moneyline / (-moneyline + 100)) * 100
    : (100 / (moneyline + 100)) * 100;
}

/**
 * The price formatAmericanOdds will print, as a number.
 *
 * Exported because a bet slip has to carry the price the user actually saw on
 * the card, not the raw engine float behind it. If the leg said -113 and the
 * slip priced 53.05% off an unrounded -112.7, a two-leg parlay would not
 * reconcile against the two numbers on screen, and reconciling is the whole
 * reason to trust it.
 *
 * Anything inside (-101, 100) is even money, quoted +100 and never -100.
 */
export function americanOddsValue(odds: number): number {
  const rounded = Math.round(odds);
  if (rounded >= 100 || rounded <= -101) return rounded;
  return 100;
}

export function formatAmericanOdds(odds: number): string {
  const value = americanOddsValue(odds);

  if (currentFormat === 'percent') {
    return `${impliedProbability(value).toFixed(1)}%`;
  }

  return value >= 100 ? `+${value}` : `${value}`;
}

/** American odds straight from a probability (0-1), NO [1.5%,98.5%] clamp — so a
 *  99% team reads -9900, not the clamped -6567. The true 0/100 extremes are handled
 *  by the caller (a real 100% has no finite odds). */
function americanFromProb(p: number): string {
  if (p > 0.5) return `${Math.round(-(p / (1 - p)) * 100)}`; // favorite (negative)
  if (p < 0.5) return `+${Math.round(((1 - p) / p) * 100)}`; // underdog (positive)
  return '+100';
}

/**
 * Show a playoff/title probability (0-100) the honest way, respecting the odds
 * toggle but NOT the [1.5%,98.5%] american clamp (which made every lock read 98.5%).
 *   - percent mode: raw % (100% for a lock, 0% for a dead team).
 *   - american mode: real odds computed from the raw prob (99% -> -9900), and a
 *     genuine lock (>=99.95%) shows a check instead of a fake-finite huge number;
 *     an eliminated team (<=0.05%) shows a dash.
 * The engine's server-side clamp is left untouched — this only changes how the
 * playoff/title columns render, using the raw probability the data already carries.
 */
export function formatProbOrOdds(prob: number): string {
  const clinched = prob >= 99.95;
  const eliminated = prob <= 0.05;
  if (currentFormat === 'percent') {
    if (clinched) return '100%';
    if (eliminated) return '0%';
    return `${prob.toFixed(1)}%`;
  }
  if (clinched) return '✓';
  if (eliminated) return '—';
  return americanFromProb(prob / 100);
}

export function formatSpread(spread: number): string {
  const rounded = Math.round(spread * 10) / 10;

  if (rounded > 0) {
    return `+${rounded.toFixed(1)}`;
  }

  return rounded.toFixed(1);
}
