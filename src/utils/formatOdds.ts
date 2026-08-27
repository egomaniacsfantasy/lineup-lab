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

export function formatAmericanOdds(odds: number): string {
  const rounded = Math.round(odds);

  if (currentFormat === 'percent') {
    const p = impliedProbability(rounded <= -101 || rounded >= 100 ? rounded : 100);
    return `${p.toFixed(1)}%`;
  }

  if (rounded >= 100) {
    return `+${rounded}`;
  }

  if (rounded <= -101) {
    return `${rounded}`;
  }

  // even money is always quoted +100, never -100 (or "EVEN")
  return '+100';
}

/**
 * Show a playoff/title probability the honest way. In percent mode use the RAW
 * probability (0-100) so a clinched team reads 100% and an eliminated team 0% —
 * NOT the American-odds round-trip, which clamps to [1.5%, 98.5%] (odds can't be
 * infinite) and made every lock look like 98.5% and every dead team 1.5%. In
 * american mode fall back to the (clamped) odds, which is correct for odds.
 */
export function formatProbOrOdds(prob: number, odds: number): string {
  if (currentFormat === 'percent') {
    if (prob >= 99.95) return '100%';
    if (prob <= 0.05) return '0%';
    return `${prob.toFixed(1)}%`;
  }
  return formatAmericanOdds(odds);
}

export function formatSpread(spread: number): string {
  const rounded = Math.round(spread * 10) / 10;

  if (rounded > 0) {
    return `+${rounded.toFixed(1)}`;
  }

  return rounded.toFixed(1);
}
