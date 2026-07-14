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
  const sorted = sortTradeSuggestions(suggestions);
  const visible = sorted.filter((suggestion) => {
    const band = getAcceptanceLingo(suggestion.acceptanceProbability ?? 100);
    return band?.label !== LONG_SHOT_LABEL;
  });
  if (visible.length > 0) {
    return { visible, longShotFallback: null as T | null };
  }
  return {
    visible: sorted.slice(0, 1),
    longShotFallback: sorted[0] ?? null,
  };
}

export function lowAcceptanceTag(probability: number | null | undefined, prominent = false) {
  const band = getAcceptanceLingo(probability ?? 100);
  if (!band || band.tone !== 'bad') return null;
  return prominent ? band.label.toUpperCase() : band.label;
}
