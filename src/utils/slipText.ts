import { formatAmericanOdds } from './formatOdds.ts';
import { MARKET_LABEL, parlayPrice, type ParlayLeg } from './parlay.ts';

/**
 * The slip as text, for settling it with the people in the league.
 *
 * Plain lines, no formatting that only survives inside our own app. It goes
 * into a group chat, which is where a bet between friends actually lives.
 */
export function slipAsText(legs: ParlayLeg[], week: number | null): string {
  const header = week != null ? `Week ${week} parlay` : 'Parlay';
  const rows = legs.map((leg) => {
    const pick = leg.line ? `${leg.label} ${leg.line}` : leg.label;
    return `${pick} (${MARKET_LABEL[leg.market].toLowerCase()}) ${formatAmericanOdds(leg.price)}`;
  });
  const price = parlayPrice(legs);
  const total = price == null ? '' : `\n${legs.length} legs, fair odds ${formatAmericanOdds(price)}`;
  return `${header}\n${rows.join('\n')}${total}`;
}

