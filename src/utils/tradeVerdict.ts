/**
 * The book's read on a title-odds delta, and the formatting that goes with it.
 *
 * These thresholds live here because two surfaces now render a verdict for the
 * same quantity: the analyzer on Trades and the deal tickets on the Hub. A
 * second copy of the numbers would be a methodology fork waiting to happen,
 * where the same deal is called "Fair" on one tab and "Good value" on another.
 */
export function analysisVerdict(youDeltaTitle: number) {
  if (youDeltaTitle >= 4) return { label: 'Steal', stamp: 'STEAL.', tone: 'good' as const };
  if (youDeltaTitle >= 1.5) return { label: 'Good value', stamp: 'GOOD VALUE.', tone: 'good' as const };
  if (youDeltaTitle > -1.5) return { label: 'Fair', stamp: 'FAIR DEAL.', tone: 'neutral' as const };
  if (youDeltaTitle > -4) return { label: 'Overpay', stamp: 'OVERPAY.', tone: 'bad' as const };
  return { label: 'Big overpay', stamp: 'BIG OVERPAY.', tone: 'bad' as const };
}

export function signedPct(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function deltaTone(value: number): 'positive' | 'negative' | 'neutral' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

/**
 * The headline for a shared trade card, which is a different question from the
 * analyzer's verdict.
 *
 * `analysisVerdict` reads YOUR delta alone, because on the analyzer you are
 * deciding whether to send it. On a card you hand to the other manager, that
 * produces the wrong headline: a deal where both teams gained on both metrics
 * got titled "FAIR", which is the least interesting true thing about it. Both
 * sides improving is rare, it is the entire argument for pricing the other
 * roster, and it is the only headline that makes the other manager want to
 * accept rather than argue.
 */
export function tradeCardHeadline(youDeltaTitle: number, partnerDeltaTitle: number) {
  if (youDeltaTitle > 0 && partnerDeltaTitle > 0) return 'Both sides win';
  if (youDeltaTitle >= 4) return 'Steal';
  if (youDeltaTitle <= -4) return 'Big overpay';
  if (youDeltaTitle <= -1.5) return 'Overpay';
  if (youDeltaTitle >= 1.5) return 'Good value';
  return 'Fair deal';
}
