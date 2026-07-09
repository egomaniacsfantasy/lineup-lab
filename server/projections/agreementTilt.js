/**
 * Server-side consensus agreement tilt — the SAME math as the frontend
 * src/services/agreementTilt.ts, so the pricing engine and the Projections page
 * agree to the decimal. Applied to STATS, then fantasy points are re-scored.
 *
 * adjFP = storedFP + delta * gross, where gross = sum(|weight| * stat) with
 * receptions weighted 1 / 0.5 / 0 by scoring — so a reception change hits PPR
 * most and non-PPR not at all. Bad stats (INT/FUM/PA/YA) move opposite. K/DEF
 * have no clean linear form, so their point total tilts uniformly.
 *
 * This is the single source of truth's math: model weekly numbers + live
 * consensus -> agreement-weighted per-week projections.
 */

const ALPHA = 0.1; // max +/-10% shift.

/** Consensus average (0-100) -> signed tilt delta. >0 = boost (underrated). */
export function tiltFromConsensus(avg) {
  if (avg == null || !Number.isFinite(Number(avg))) return 0;
  const t = Math.max(-1, Math.min(1, (50 - Number(avg)) / 50));
  return ALPHA * t;
}

// "More is worse" stats — tilt moves them opposite the sentiment. Season (`_adj`)
// and weekly (raw) column names both listed.
const BAD_KEYS = {
  QB: new Set(['interceptions', 'interceptions_adj', 'fumbles', 'fumbles_adj']),
  RB: new Set(['fumbles_lost']),
  WR: new Set(),
  TE: new Set(),
  K: new Set(),
  DEF: new Set(['pred_pa', 'pred_points_allowed', 'pred_ya', 'pred_yards_allowed']),
};

/** Tilt one stat value. Bad stats move opposite the sentiment. */
export function adjustStat(pos, key, value, delta) {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;
  if (!delta) return v;
  const bad = BAD_KEYS[pos]?.has(key) ?? false;
  return v * (1 + (bad ? -delta : delta));
}

// Scored stats per skill position (season key, weekly key, |weight|). Receptions
// (`rec`) are weighted by scoring system, which makes the three formats diverge.
const SCORED = {
  QB: [
    { season: 'passing_yards_adj', weekly: 'passing_yards', w: 0.04 },
    { season: 'passing_tds_adj', weekly: 'passing_tds', w: 4 },
    { season: 'rushing_yards_adj', weekly: 'rushing_yards', w: 0.1 },
    { season: 'rushing_tds_adj', weekly: 'rushing_tds', w: 6 },
    { season: 'interceptions_adj', weekly: 'interceptions', w: 2 },
    { season: 'fumbles_adj', weekly: 'fumbles', w: 2 },
  ],
  RB: [
    { season: 'rushing_yards', weekly: 'rushing_yards', w: 0.1 },
    { season: 'rushing_tds', weekly: 'rushing_tds', w: 6 },
    { season: 'receiving_yards', weekly: 'receiving_yards', w: 0.1 },
    { season: 'receiving_tds', weekly: 'receiving_tds', w: 6 },
    { season: 'receptions', weekly: 'receptions', w: 1, rec: true },
    { season: 'fumbles_lost', weekly: 'fumbles_lost', w: 2 },
  ],
  WR: [
    { season: 'receiving_yards', weekly: 'receiving_yards', w: 0.1 },
    { season: 'receiving_tds', weekly: 'receiving_tds', w: 6 },
    { season: 'receptions', weekly: 'receptions', w: 1, rec: true },
    { season: 'rushing_yards', weekly: 'rushing_yards', w: 0.1 },
    { season: 'rushing_tds', weekly: 'rushing_tds', w: 6 },
  ],
  TE: [
    { season: 'receiving_yards', weekly: 'receiving_yards', w: 0.1 },
    { season: 'receiving_tds', weekly: 'receiving_tds', w: 6 },
    { season: 'receptions', weekly: 'receptions', w: 1, rec: true },
  ],
};

// PPR only for the pricing engine (leagues price on their own scoring later, but
// the model's canonical line is PPR). recPt kept for completeness/future use.
function recPt(suf) {
  return suf === '' ? 1 : suf === '_half' ? 0.5 : 0;
}

/** gross = sum(|weight| * stat) over scored stats; drives the FP shift. */
export function grossPoints(pos, row, which, suf = '') {
  const list = SCORED[pos];
  if (!list) return 0;
  let g = 0;
  for (const s of list) {
    const v = Number(row[which === 'season' ? s.season : s.weekly]) || 0;
    const w = s.rec ? recPt(suf) : Math.abs(s.w);
    g += Math.abs(w) * v;
  }
  return g;
}

/** Adjusted fantasy points, anchored to the model's stored FP. */
export function adjustFP(pos, storedFP, row, which, delta, suf = '') {
  const fp = storedFP == null ? null : Number(storedFP);
  if (fp == null || !Number.isFinite(fp)) return null;
  if (!delta) return fp;
  if (pos === 'K' || pos === 'DEF') return fp * (1 + delta);
  return fp + delta * grossPoints(pos, row, which, suf);
}

/** Scale a floor/ceiling by the proportion the point estimate moved. */
export function scaleBound(bound, storedFP, adjFP) {
  if (bound == null) return null;
  const b = Number(bound);
  if (!Number.isFinite(b)) return null;
  const base = Number(storedFP);
  const adj = Number(adjFP);
  if (!Number.isFinite(base) || !Number.isFinite(adj) || base === 0) return b;
  return b * (adj / base);
}
