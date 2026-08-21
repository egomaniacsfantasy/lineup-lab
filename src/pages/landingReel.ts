/**
 * Marketing reel for the logged-out hero.
 *
 * Every number here is AUTHORED, not computed. The hero is illustrative
 * content for people who have not connected a league yet, so it must never
 * run pricing logic: the widgets step through these frames and format them,
 * nothing more.
 *
 * The numbers are still held to the engine's own arithmetic, because a
 * sportsbook that quotes an impossible price is not a sportsbook:
 *
 * - Every matchup frame is a FAIR two-way market. `probToAmerican` in
 *   server/engine/engine.js makes the two sides exact mirrors (61.4% is
 *   -159 and 38.6% is +159), so a hero showing -159 against +134 would be
 *   quoting 104.1% of book, i.e. 4.1 points of vig we do not charge and do
 *   not model. Each pair below was generated from that function.
 * - Acceptance band words are not written here at all; they are read from
 *   src/utils/acceptanceLingo.ts when the card renders.
 */

export interface LineFrame {
  you: { team: string; prob: number; moneyline: number };
  them: { team: string; prob: number; moneyline: number };
  /** Move in win probability from the previous frame, authored alongside it. */
  move: number;
  note: string;
}

/**
 * A fair two-way market drifting through a week.
 *
 * The notes are the engine's OWN trigger vocabulary, the same strings it
 * writes into line history: opening board, projection refresh, waiver run,
 * lineup change. They used to be invented injury beats ("Their QB ruled out",
 * "Nacua downgraded to questionable"), which read as writing rather than as a
 * product, and described a feed we do not have. These are the four things
 * that actually move a line here.
 */
export const LINE_FRAMES: LineFrame[] = [
  {
    you: { team: "Zeus's Bolts", prob: 58.2, moneyline: -139 },
    them: { team: 'Hermes Express', prob: 41.8, moneyline: 139 },
    move: 0,
    note: 'Opening board',
  },
  {
    you: { team: "Zeus's Bolts", prob: 61.4, moneyline: -159 },
    them: { team: 'Hermes Express', prob: 38.6, moneyline: 159 },
    move: 3.2,
    note: 'Projection refresh',
  },
  {
    you: { team: "Zeus's Bolts", prob: 59.6, moneyline: -148 },
    them: { team: 'Hermes Express', prob: 40.4, moneyline: 148 },
    move: -1.8,
    note: 'Waiver run',
  },
  {
    you: { team: "Zeus's Bolts", prob: 63.0, moneyline: -170 },
    them: { team: 'Hermes Express', prob: 37.0, moneyline: 170 },
    move: 3.4,
    note: 'Lineup change',
  },
];

export interface TradeFrame {
  send: { slug: string; name: string; position: string }[];
  get: { slug: string; name: string; position: string }[];
  /** 0 to 100. The band word is read from src/utils/acceptanceLingo.ts at
   *  render time rather than written here, so the landing page can never
   *  drift from the vocabulary the product actually uses. */
  acceptance: number;
  partner: string;
  /** Why this manager would even pick up the phone. */
  motive: string;
}

/**
 * Trades a real manager would actually send.
 *
 * The old set led with two top-twelve assets for one (Kelce and Bijan for
 * Jefferson) at 38% acceptance, which is both a package nobody proposes and
 * an example of the product saying no. Every trade here is instead driven by
 * a hole in the other roster, which is what acceptance odds are modelling in
 * the first place, and priced where a deal is genuinely live.
 */
export const TRADE_FRAMES: TradeFrame[] = [
  {
    send: [{ slug: 'd-henry', name: 'D. Henry', position: 'RB' }],
    get: [
      { slug: 'p-nacua', name: 'P. Nacua', position: 'WR' },
      { slug: 't-mcbride', name: 'T. McBride', position: 'TE' },
    ],
    acceptance: 64,
    partner: 'Hades Hounds',
    motive: 'Starting a backup at RB',
  },
  {
    send: [{ slug: 't-kelce', name: 'T. Kelce', position: 'TE' }],
    get: [{ slug: 'b-robinson', name: 'B. Robinson', position: 'RB' }],
    acceptance: 57,
    partner: 'Apollo Archers',
    motive: 'Worst TE in the league',
  },
  {
    send: [
      { slug: 'j-gibbs', name: 'J. Gibbs', position: 'RB' },
      { slug: 'd-smith', name: 'D. Smith', position: 'WR' },
    ],
    get: [{ slug: 'j-chase', name: 'J. Chase', position: 'WR' }],
    acceptance: 71,
    partner: 'Kronos Titans',
    motive: '1-6 and selling',
  },
];
