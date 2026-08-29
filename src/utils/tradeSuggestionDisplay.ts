import type { MarketMover } from '../services/leagueApi';
import {
  ACCEPTANCE_LINGO_BANDS,
  formatAcceptancePercent,
  formatAcceptanceRead,
  getAcceptanceLingo,
} from './acceptanceLingo';

type TradeDisplayMover = Pick<MarketMover, 'acceptanceProbability' | 'valueGain'>;
const LONG_SHOT_LABEL = ACCEPTANCE_LINGO_BANDS[0].label;

export function acceptanceBand(probability: number) {
  return getAcceptanceLingo(probability)?.label ?? LONG_SHOT_LABEL;
}

export function acceptanceGaugeLabel(probability: number) {
  return formatAcceptanceRead(probability) ?? formatAcceptancePercent(probability) ?? `${probability}%`;
}

export function acceptanceWeightedValue(mover: TradeDisplayMover) {
  const gain = mover.valueGain ?? 0;
  const acceptance = mover.acceptanceProbability ?? 100;
  return gain * (acceptance / 100);
}

type TradeFairnessInput = { youDelta?: number | null; partnerDelta?: number | null };

/**
 * Fairest-trade score: the total championship-odds movement across BOTH teams,
 * |youDelta| + |partnerDelta|. SMALLER is better — the fairest trade barely moves
 * either side's title price. Acceptance probability is intentionally NOT part of
 * this; a balanced trade needs no acceptance nudge to be worth showing. This is
 * the single ranking used by both the Hub deals section and the Trades board.
 */
export function tradeFairnessScore(mover: TradeFairnessInput) {
  return Math.abs(mover.youDelta ?? 0) + Math.abs(mover.partnerDelta ?? 0);
}

/** Sort ascending by tradeFairnessScore (fairest / least-movement first). */
export function sortByTradeFairness<T extends TradeFairnessInput>(suggestions: T[]) {
  return [...suggestions].sort((left, right) => tradeFairnessScore(left) - tradeFairnessScore(right));
}

export function sortTradeSuggestions<T extends TradeDisplayMover>(suggestions: T[]) {
  return [...suggestions].sort((left, right) => {
    const weightedGap = acceptanceWeightedValue(right) - acceptanceWeightedValue(left);
    if (weightedGap !== 0) return weightedGap;
    const rawGap = (right.valueGain ?? 0) - (left.valueGain ?? 0);
    if (rawGap !== 0) return rawGap;
    return (right.acceptanceProbability ?? 100) - (left.acceptanceProbability ?? 100);
  });
}

export function applyTradeDisplayPolicy<T extends TradeDisplayMover>(suggestions: T[]) {
  // Show EVERY trade, including low-acceptance "long shots". Previously they were
  // filtered out, which — combined with the finder returning mostly title-neutral
  // deals — left the board looking empty. Keep the existing display sort (works for
  // both trade suggestions and matchup one-move movers); just never hide anything.
  return { visible: sortTradeSuggestions(suggestions), longShotFallback: null as T | null };
}

export function lowAcceptanceTag(probability: number | null | undefined, prominent = false) {
  const band = getAcceptanceLingo(probability ?? 100);
  if (!band || band.tone !== 'bad') return null;
  return prominent ? band.label.toUpperCase() : band.label;
}
