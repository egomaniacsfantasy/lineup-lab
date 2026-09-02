/**
 * The product tour, as data: one short tour per tab.
 *
 * It used to be five stops on the Hub and nothing anywhere else, which meant
 * the Hub carried a stop explaining what the other three tabs were for -
 * a tour describing screens you cannot see. Each tab now explains itself, the
 * first time you arrive on it, in two to four stops.
 *
 * Two rules the stops have to obey, both learned the hard way:
 *
 * 1. Anchor something SMALL. A ring around `.matchup-page__module--slot-board`
 *    is a ring around 843px of a 900px viewport, which is not a spotlight, it
 *    is a box drawn around the page. One lineup row makes the same point and
 *    can actually be seen. Where only a container will do, the overlay clamps
 *    the ring to the viewport so it is at least never off-screen.
 *
 * 2. Anchor by CSS selector, not by `data-tour` attributes sprayed across the
 *    pages. That keeps every word and every target in this one file, and the
 *    risk it trades - a class rename orphaning a stop - is bought back by
 *    `test/productTour.test.mjs`, which resolves every selector against the
 *    real page and fails if one stops matching.
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
   * pressable - right for the format toggle, wrong for anything that
   * navigates, because one press would leave the page the tour is describing.
   */
  interactive?: boolean;
}

export interface Tour {
  id: string;
  /** The route this tour belongs to. Matched as a prefix. */
  path: string;
  /** Shown on the card's last step, so people know it is not a one-shot. */
  steps: readonly TourStep[];
}

export const TOURS: readonly Tour[] = [
  {
    id: 'hub',
    path: '/matchup',
    steps: [
      {
        id: 'price',
        title: 'This is a probability',
        body:
          'Your matchup carries a line, the way a sportsbook posts one. The bar underneath says the same thing as a percentage, and no money moves anywhere in Odds Gods.',
        selector: '.matchup-page__hero-number',
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
          'Every starter carries what they project this week, set against the slot opposite. This board is what the line above is made of, so changing your lineup moves it.',
        /* One card, not the whole board: the board is 698px of a 900px
           viewport, and a ring around that is a box around the page. */
        selector: '.matchup-page__slot-card',
        placement: 'bottom',
      },
      {
        id: 'season',
        title: 'Your season, priced',
        body:
          'Your championship price, your playoff odds and where you finish. Repriced every time the league moves.',
        selector: '.matchup-page__season--band',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'league',
    path: '/league',
    steps: [
      {
        id: 'card',
        title: 'The whole week, priced',
        body:
          'Every game in your league gets a spread, a total and a price on both sides, the same three markets a book posts.',
        selector: '.matchup-slate__row-button',
        placement: 'bottom',
      },
      {
        id: 'detail',
        title: 'Open any game',
        body:
          'Pressing a game opens it underneath: both sides priced, and both starting lineups slot by slot. It answers why a team is favoured, which the price alone cannot.',
        selector: '.matchup-detail__head',
        placement: 'bottom',
      },
      {
        id: 'views',
        title: 'Past this week',
        body:
          'Futures holds the title race. Season separates your scoring from your schedule. Predictor lets you call the rest of the year and watch the board move.',
        selector: '.league-page__view-tabs',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'market',
    path: '/market',
    steps: [
      {
        id: 'finder',
        title: 'Deals, priced',
        body:
          'The finder proposes trades other managers might actually take. The analyzer prices one you already have in mind.',
        selector: '.trade-cc__views',
        placement: 'bottom',
      },
      {
        id: 'deal',
        title: 'What a trade is worth',
        body:
          'Every deal is scored by what it does to your championship odds, not by a points total. That is the only number that decides anything.',
        selector: '.ldb__row',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'board',
    path: '/rankings',
    steps: [
      {
        id: 'row',
        title: 'Every player, ranked',
        body:
          'One board for the whole pool, built from the projection sheet the engine prices with. Pressing a player opens what is behind their number.',
        selector: '.board-page__row-button',
        placement: 'bottom',
      },
      {
        id: 'filter',
        title: 'Narrow it down',
        body:
          'Filter to a position, or to the players you can actually get. The ranking underneath is the same either way.',
        selector: '.board-page__filter-bar',
        placement: 'bottom',
      },
    ],
  },
];

/** The tour for a route, or null where a tab has nothing to explain. */
export function tourForPath(pathname: string): Tour | null {
  return TOURS.find((tour) => pathname === tour.path || pathname.startsWith(`${tour.path}/`)) ?? null;
}

/** The tour with this id, for the fixture flag that names one outright. */
export function tourById(id: string): Tour | null {
  return TOURS.find((tour) => tour.id === id) ?? null;
}

/**
 * The steps that can actually run right now.
 *
 * A stop whose target is not on screen is dropped rather than spotlighting
 * nothing: a cold league has no priced hero, a board with no projections has
 * no rows, and in both cases a tour that halts on an empty rectangle is worse
 * than a shorter tour. Dropping rather than halting is also what keeps the
 * numbering honest, since the card counts the steps that will run.
 */
export function runnableSteps(
  steps: readonly TourStep[],
  isPresent: (selector: string) => boolean,
): TourStep[] {
  return steps.filter((step) => isPresent(step.selector));
}
