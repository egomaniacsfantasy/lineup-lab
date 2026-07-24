import { impliedProbability } from './formatOdds';
import { displayedDelta } from './displayDelta';

declare const noTradeMathBrand: unique symbol;

// Frontend display code may only derive a delta from an engine-provided before
// and after pair. Anything beyond that belongs in the pricing engine.
export type TradeDisplayDelta = number & {
  readonly [noTradeMathBrand]: 'TradeDisplayDelta';
};

export function oddsPairDelta(before: number, after: number): TradeDisplayDelta {
  return displayedDelta(before, after, { mapValue: impliedProbability }) as TradeDisplayDelta;
}
