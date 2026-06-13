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
    return `${p >= 99.5 ? p.toFixed(1) : p < 1 ? p.toFixed(1) : p.toFixed(0)}%`;
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

export function formatSpread(spread: number): string {
  const rounded = Math.round(spread * 10) / 10;

  if (rounded > 0) {
    return `+${rounded.toFixed(1)}`;
  }

  return rounded.toFixed(1);
}
