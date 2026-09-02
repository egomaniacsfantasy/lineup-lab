/**
 * The product tour, as data.
 *
 * Five stops. That is a deliberate ceiling, not a coincidence: a tour is a
 * toll you charge someone before they get to use the thing they came for, and
 * the way to lose them is to charge too much. So this covers only what the
 * screen cannot explain about itself.
 *
 * Steps anchor by CSS selector rather than by a `data-tour` attribute sprayed
 * across five page components. That keeps every word and every target in one
 * file, and the risk it trades for - a class rename quietly orphaning a step -
 * is bought back by `test/productTour.test.mjs`, which resolves every selector
 * against the real Hub and fails if one stops matching.
 */

export interface TourStep {
  id: string;
  /** What this stop is about, in three or four words. */
  title: string;
  body: string;
  /** The element to spotlight. First match wins. */
  selector: string;
  /**
   * Where the card prefers to sit. The overlay flips it when the preferred
   * side has no room, so this is a preference and not an instruction.
   */
  placement: 'top' | 'bottom';
  /**
   * Whether the spotlit control stays LIVE, i.e. still takes clicks.
   *
   * Off by default, and that default is load-bearing. The scrim is four
   * panels around the target, so a target left uncovered is genuinely
   * pressable - which is exactly right for the format toggle and exactly
   * wrong for the nav, where one press navigates away and the tour is
   * spotlighting an element that no longer exists. Opt in per stop, and only
   * where pressing the thing is the point of the stop.
   */
  interactive?: boolean;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'price',
    title: 'This is a probability',
    body:
      'Your matchup carries a line, the way a sportsbook posts one. Minus is the favourite, the bar underneath says the same thing as a percentage, and no money moves anywhere in Odds Gods.',
    /* The whole hero, not just the number: the sentence talks about the bar
       and the other side's price, and a spotlight that excludes what the
       words point at is worse than no spotlight. */
    selector: '.matchup-page__module--hero',
    placement: 'bottom',
  },
  {
    id: 'format',
    title: 'Or read it as a percent',
    body:
      'If odds are not your language, this switches every number in the app to plain win percentages, and stays switched. Press it and see.',
    selector: '.app-header__odds-toggle',
    placement: 'bottom',
    interactive: true,
  },
  {
    id: 'lineup',
    title: 'Where the line comes from',
    body:
      'Your starters against theirs, slot by slot, with what each player projects this week. Change your lineup and the line above moves.',
    selector: '.matchup-page__module--slot-board',
    placement: 'top',
  },
  {
    id: 'season',
    title: 'Your season, priced',
    body:
      'Your championship price, your playoff odds and where you finish. Repriced every time the league moves.',
    selector: '.matchup-page__season--band',
    placement: 'bottom',
  },
  {
    id: 'tabs',
    title: 'The rest of the book',
    body:
      'League prices every game this week, and opens any of them into both lineups. Trades prices a deal before you send it. Board ranks the whole player pool.',
    selector: '.app-header__nav',
    placement: 'bottom',
  },
];

/**
 * The steps that can actually run right now.
 *
 * A stop whose target is not on screen is dropped rather than spotlighting
 * nothing: a phone has no nav bar and no season band, a cold league has no
 * priced hero, and in both cases a tour that halts on an empty rectangle is
 * worse than a shorter tour. Dropping rather than halting is also what keeps
 * the numbering honest, since the card counts the steps that will run.
 */
export function runnableSteps(
  steps: readonly TourStep[],
  isPresent: (selector: string) => boolean,
): TourStep[] {
  return steps.filter((step) => isPresent(step.selector));
}
