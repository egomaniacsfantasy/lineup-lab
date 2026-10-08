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
 *    the ring to the viewport so it is at least never off-screen. Where the
 *    element is a block-wide span holding four glyphs, `fit: 'text'` rings
 *    the glyphs rather than the span.
 *
 * 2. Anchor by CSS selector, not by `data-tour` attributes sprayed across the
 *    pages. That keeps every word and every target in this one file, and the
 *    risk it trades - a class rename orphaning a stop - is bought back by
 *    `test/productTour.test.mjs`, which resolves every selector against the
 *    real page and fails if one stops matching.
 */

export type TourSide = 'top' | 'bottom' | 'left' | 'right';

export interface TourStep {
  id: string;
  /** What this stop is about, in three or four words. */
  title: string;
  body: string;
  /** The element to spotlight. The first VISIBLE match wins. */
  selector: string;
  /**
   * Where the card prefers to sit. The overlay tries this side first, then
   * the opposite one, then the other two, so it is a preference and not an
   * instruction. On a phone the card docks to the bottom of the screen and
   * ignores this entirely.
   */
  placement: TourSide;
  /**
   * For a card above or below its target: whether it lines up with the
   * target's left edge or its centre. Centre is right for a small control
   * and wrong for a full-width strip, where a centred card floats in the
   * middle of nothing.
   */
  align?: 'start' | 'center';
  /**
   * `text` rings the glyphs rather than the element. The hero price is a span
   * stretched across its whole column, and a ring around that is a ring
   * around four digits and 300px of air.
   */
  fit?: 'box' | 'text';
  /**
   * Whether the spotlit control stays LIVE, i.e. still takes clicks.
   *
   * Off by default, and that default is load-bearing. The scrim is a sheet
   * with a hole in it, so a target left uncovered is genuinely pressable -
   * right for the format toggle, wrong for anything that navigates, because
   * one press would leave the page the tour is describing.
   */
  interactive?: boolean;
}

export interface TourIntro {
  title: string;
  body: string;
  /** The button that starts the walk. */
  cta: string;
}

export interface Tour {
  id: string;
  /** The tab's name, as the card's eyebrow says it. */
  label: string;
  /** The route this tour belongs to. Matched as a prefix. */
  path: string;
  /**
   * A card shown before the first stop, with nothing spotlit.
   *
   * Only the Hub has one. It is the first tab anybody lands on, and the one
   * idea the whole product rests on - that a price is a probability and no
   * money moves - deserves a sentence before a ring appears around a number.
   * It also makes the offer a question. Coach marks that open themselves over
   * a page you have just arrived on are being talked at; a card that asks
   * first can be declined in one press.
   */
  intro?: TourIntro;
  steps: readonly TourStep[];
}

export const TOURS: readonly Tour[] = [
  {
    id: 'hub',
    label: 'Hub',
    path: '/matchup',
    intro: {
      title: 'How to read this',
      body:
        'Every matchup, trade and season here carries a line, written the way a sportsbook writes a probability. No money moves anywhere. Four stops show you where the numbers come from.',
      cta: 'Show me',
    },
    steps: [
      {
        id: 'price',
        title: 'This is a probability',
        /* The one honest count in the product, said in words rather than as
           "10,000 sims": MATCHUP_SIMS is 10,000 and the substantiated-claims
           table in docs/PRODUCT.md carries it. */
        body:
          'This week\'s game, played ten thousand times before kickoff. The line is how often you came out ahead, written the way a sportsbook writes it. The bar underneath says it as a percentage. No money moves.',
        selector: '.matchup-page__hero-number',
        placement: 'right',
        fit: 'text',
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
          'Every starter is a range, not a number. Each of those ten thousand games draws a score for every player from his projected range and adds them up, so changing a starter moves the line above.',
        /* One card, not the whole board: the board is 698px of a 900px
           viewport, and a ring around that is a box around the page. */
        selector: '.matchup-page__slot-card',
        placement: 'bottom',
        align: 'start',
      },
      {
        id: 'season',
        title: 'Your season, priced',
        body:
          'Your championship price and playoff odds, from the rest of the schedule played ten thousand times. Repriced every time the league moves.',
        selector: '.matchup-page__season--band',
        placement: 'bottom',
        align: 'start',
      },
    ],
  },
  {
    id: 'league',
    label: 'League',
    path: '/league',
    steps: [
      {
        id: 'card',
        title: 'The whole week, priced',
        body:
          'Every game gets a spread, a total and a price on both sides, from the same ten thousand plays of the week. Press one to open both lineups, slot by slot.',
        /* One stop, not two. The second used to point at the opened game's
           header, which only exists after somebody presses a card - so the
           tour was pointing at something that was not on screen while it
           spoke. Saying it here, over the thing you press, is both shorter
           and true. */
        selector: '.matchup-slate__row-button',
        placement: 'bottom',
        align: 'start',
      },
      {
        id: 'swing',
        title: 'What a game is worth',
        body:
          'Playoff odds for both teams if they win and if they lose: the rest of the season, played out from each result. A wide gap is a game that decides something.',
        /* The Now / Win / Lose grid in the selected game's rail. */
        selector: '.matchup-slate__swing',
        placement: 'left',
      },
      {
        id: 'movement',
        title: 'Lines move',
        body:
          'Where this game opened against where it stands now. A line moves when a lineup, an injury or a projection changes, and the chart keeps the whole path.',
        /* The movement chart under the swing grid. Scoped to the slate so a
           chart on another tab cannot answer for it. */
        selector: '.matchup-slate__chart',
        placement: 'left',
      },
      {
        id: 'views',
        title: 'Past this week',
        body:
          'Futures holds the title race. Season separates your scoring from your schedule. Predictor lets you call the rest of the year and watch the board move.',
        selector: '.league-page__view-tabs',
        placement: 'bottom',
        align: 'start',
      },
    ],
  },
  {
    id: 'market',
    label: 'Trades',
    path: '/market',
    steps: [
      {
        id: 'finder',
        title: 'Deals, priced',
        body:
          'The finder proposes trades other managers might actually take. The analyzer prices one you already have in mind.',
        selector: '.trade-cc__views',
        placement: 'bottom',
        align: 'start',
      },
      {
        id: 'deal',
        title: 'What a trade is worth',
        /* Pointed at the ticket. The finder is one question with three
           blanks (who with, what you send, what you get) and every deal it
           returns is scored in title odds. The manager grid this used to
           target is gone; before that it was .ldb__row, and a stop aimed at
           nothing silently drops, taking the only place the product explains
           its own currency with it. */
        body:
          'Fill in as much as you like: a manager, a position, a player. Every deal is scored by what it does to your championship odds.',
        selector: '.trade-finder__ticket',
        placement: 'right',
      },
      {
        id: 'price',
        title: 'Priced from both sides',
        /* No count here on purpose. Trades run at TRADE_SIMS, which is not
           the ten thousand the Hub quotes, and "priced from both sides" is
           the claim the product substantiates. */
        body:
          'The change in your championship odds if the deal goes through, with their side priced the same way. The same trade prices the same everywhere in Odds Gods.',
        selector: '.trade-finder__lane-price',
        placement: 'left',
      },
    ],
  },
  {
    id: 'board',
    label: 'Board',
    path: '/rankings',
    steps: [
      {
        id: 'row',
        title: 'Every player, ranked',
        body:
          'Ranked by the projections every price in Odds Gods is built from: a projected score and a range for each player, in your league\'s scoring. Press one to see what is behind the number.',
        selector: '.board-page__row-button',
        placement: 'bottom',
        align: 'start',
      },
      {
        id: 'filter',
        title: 'Narrow it down',
        body:
          'Filter to a position, or to players you can get.',
        selector: '.board-page__filter-bar',
        placement: 'bottom',
        align: 'start',
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

/**
 * The step list after a stop has turned up late.
 *
 * The Hub is still assembling when the tour opens: the season band lands when
 * the season sim does, which on a real league can be after the card has
 * already said "1 of 3". Everything already walked, and the stop on screen,
 * stay exactly where they are; only the stops still ahead are re-cut from
 * what is present now. So the count can grow while you read, but it can never
 * renumber the stop you are on or hand you back one you have finished.
 */
export function mergeSteps(
  current: readonly TourStep[],
  index: number,
  found: readonly TourStep[],
  order: readonly TourStep[],
): TourStep[] {
  const kept = current.slice(0, index + 1);
  const last = kept[kept.length - 1];
  const lastAt = last ? order.findIndex((step) => step.id === last.id) : -1;
  const ahead = found.filter((step) => order.findIndex((candidate) => candidate.id === step.id) > lastAt);
  return [...kept, ...ahead];
}
