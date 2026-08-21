import type { TradeFrame } from './landingReel';

/**
 * GENERATED. Do not hand-edit: run `node scripts/generate-landing-trades.mjs`.
 *
 * These came out of the real suggestTrades in server/engine/engine.js, run on
 * a twelve-team league drafted from the 2026 projection sheets. The engine
 * chose the packages, sized them, and priced the acceptance percentage.
 *
 * They are here because hand-authored trades were indefensible. The page used
 * to show "send Derrick Henry, get Puka Nacua and Trey McBride", which hands
 * 222 points of projection to my side of the table with Nacua alone
 * out-projecting Henry. Nobody sends that and nobody takes it. Every trade
 * below is within a point of even on projection and leaves BOTH managers with
 * a better title price, which is the entire argument for pricing acceptance in
 * the first place.
 */
export const TRADE_FRAMES: TradeFrame[] = [
  {
    partner: "Hephaestus Forge",
    send: [
      { name: "J. Love", position: 'RB', sleeperId: "13287" },
      { name: "W. Robinson", position: 'WR', sleeperId: "8126" },
    ],
    get: [
      { name: "J. Smith-Njigba", position: 'WR', sleeperId: "9488" },
      { name: "H. Henry", position: 'TE', sleeperId: "3214" },
    ],
    acceptance: 84,
    youTitleDelta: 6,
    partnerTitleDelta: 3.1,
  },
  {
    partner: "Poseidon Waves",
    send: [
      { name: "J. Love", position: 'RB', sleeperId: "13287" },
      { name: "R. Dowdle", position: 'RB', sleeperId: "7021" },
    ],
    get: [
      { name: "T. McBride", position: 'TE', sleeperId: "8130" },
      { name: "D. Metcalf", position: 'WR', sleeperId: "5846" },
    ],
    acceptance: 94,
    youTitleDelta: 5.3,
    partnerTitleDelta: 4.6,
  },
  {
    partner: "Ares Warriors",
    send: [
      { name: "D. Montgomery", position: 'RB', sleeperId: "5892" },
      { name: "R. Dowdle", position: 'RB', sleeperId: "7021" },
    ],
    get: [
      { name: "Z. Flowers", position: 'WR', sleeperId: "9997" },
      { name: "J. Mason", position: 'RB', sleeperId: "8408" },
    ],
    acceptance: 86,
    youTitleDelta: 4.7,
    partnerTitleDelta: 3.3,
  },
];
