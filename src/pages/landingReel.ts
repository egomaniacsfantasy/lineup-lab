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
 * - Every start/sit frame's delta is the difference of its two win
 *   probabilities, and its two moneylines are those same probabilities
 *   converted. They cannot disagree.
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

/** A fair two-way market drifting through a week, the way a real book moves. */
export const LINE_FRAMES: LineFrame[] = [
  {
    you: { team: "Zeus's Bolts", prob: 58.2, moneyline: -139 },
    them: { team: 'Hermes Express', prob: 41.8, moneyline: 139 },
    move: 0,
    note: 'Line opened',
  },
  {
    you: { team: "Zeus's Bolts", prob: 61.4, moneyline: -159 },
    them: { team: 'Hermes Express', prob: 38.6, moneyline: 159 },
    move: 3.2,
    note: 'Projection update',
  },
  {
    you: { team: "Zeus's Bolts", prob: 59.6, moneyline: -148 },
    them: { team: 'Hermes Express', prob: 40.4, moneyline: 148 },
    move: -1.8,
    note: 'Nacua upgraded to questionable',
  },
  {
    you: { team: "Zeus's Bolts", prob: 63.0, moneyline: -170 },
    them: { team: 'Hermes Express', prob: 37.0, moneyline: 170 },
    move: 3.4,
    note: 'Their QB ruled out',
  },
];

export interface StartSitFrame {
  sit: { slug: string; name: string; position: string };
  start: { slug: string; name: string; position: string };
  beforeMoneyline: number;
  afterMoneyline: number;
  /** after prob minus before prob, to one decimal. */
  delta: number;
}

export const START_SIT_FRAMES: StartSitFrame[] = [
  {
    sit: { slug: 't-mclaurin', name: 'T. McLaurin', position: 'WR' },
    start: { slug: 'd-smith', name: 'D. Smith', position: 'WR' },
    beforeMoneyline: -159,
    afterMoneyline: -182,
    delta: 3.2,
  },
  {
    sit: { slug: 'd-henry', name: 'D. Henry', position: 'RB' },
    start: { slug: 's-barkley', name: 'S. Barkley', position: 'RB' },
    beforeMoneyline: -159,
    afterMoneyline: -170,
    delta: 1.6,
  },
  {
    sit: { slug: 't-mcbride', name: 'T. McBride', position: 'TE' },
    start: { slug: 'b-bowers', name: 'B. Bowers', position: 'TE' },
    beforeMoneyline: -139,
    afterMoneyline: -151,
    delta: 1.9,
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
}

/* Real trade shapes: consolidation and depth-for-star. Nobody has ever built a
   package around a kicker, so none of these do. */
export const TRADE_FRAMES: TradeFrame[] = [
  {
    send: [
      { slug: 't-kelce', name: 'T. Kelce', position: 'TE' },
      { slug: 'b-robinson', name: 'B. Robinson', position: 'RB' },
    ],
    get: [{ slug: 'j-jefferson', name: 'J. Jefferson', position: 'WR' }],
    acceptance: 38,
    partner: 'Hermes Express',
  },
  {
    send: [{ slug: 'd-henry', name: 'D. Henry', position: 'RB' }],
    get: [
      { slug: 'p-nacua', name: 'P. Nacua', position: 'WR' },
      { slug: 't-mcbride', name: 'T. McBride', position: 'TE' },
    ],
    acceptance: 62,
    partner: 'Apollo Archers',
  },
  {
    send: [
      { slug: 't-mclaurin', name: 'T. McLaurin', position: 'WR' },
      { slug: 'j-gibbs', name: 'J. Gibbs', position: 'RB' },
    ],
    get: [{ slug: 'j-chase', name: 'J. Chase', position: 'WR' }],
    acceptance: 71,
    partner: 'Poseidon Waves',
  },
];
