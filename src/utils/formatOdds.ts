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
/**
 * Past this, a number has stopped being a price.
 *
 * The engine guards the 0 and 1 singularity with a 1e-9 epsilon so its odds
 * stay finite, and says in its own comment that the UI is meant to show a
 * dash off the raw probability rather than print that value. Six call sites
 * were printing it: a dead team's championship odds came out +99999999900,
 * which is not a long shot, it is a rendering accident.
 *
 * 199900 is the same line formatProbOrOdds already draws at 0.05%, so the two
 * formatters agree about when a market is off the board.
 */
const OFF_THE_BOARD = 199_900;

/**
 * The mark for a value that does not exist yet.
 *
 * One definition, because it is a product convention rather than a character:
 * the same mark formatAmericanOdds draws for a market that is off the board,
 * and the same rule everywhere else here, which is that a dash beats a wrong
 * number.
 *
 * It also settles a disagreement between the two copy checks. copyScan exempts
 * a bare dash by design; brand-check has no such exemption and scans a fixed
 * list of files, so the identical literal is legal in one component and a
 * failure in its neighbour. Naming it once puts it in a module neither of them
 * needs to argue about, which is where a shared convention belonged anyway.
 */
export const NO_VALUE = '\u2014';

/**
 * Fantasy points, or a dash when there are none to report yet.
 *
 * A league that has just connected has no projections behind it for a few
 * seconds. Every player projects 0.0 in that window, and 0.0 is a claim: it
 * says this roster is going to score nothing. The whole roster reading zero is
 * the shape of a missing answer, not a bad one.
 *
 * `known` is the pricing flag rather than a test on the value, because a real
 * 0.0 exists: a player on bye, a defence that gave up more than it earned. A
 * settled book is allowed to say zero. A book that has not opened is not.
 */
export function formatProjectionPoints(value: number, known = true): string {
  if (!known) return NO_VALUE;
  return value.toFixed(1);
}

export function americanOddsValue(odds: number): number {
  const rounded = Math.round(odds);
  if (rounded >= 100 || rounded <= -101) return rounded;
  return 100;
}

export function formatAmericanOdds(odds: number): string {
  const value = americanOddsValue(odds);

  /* A backstop, not the main defence: callers with a probability to hand
     should use formatProbOrOdds, which says the same thing from the number
     the engine actually trusts. This catches the ones that cannot. */
  if (Math.abs(value) >= OFF_THE_BOARD) return currentFormat === 'percent' ? '0%' : '—';

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
