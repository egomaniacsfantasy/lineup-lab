/**
 * Consensus agreement tilt (display-only).
 *
 * Every player carries a public "consensus" score = the average of all users'
 * agreement values (0-100). 50 = "model is right"; below 50 = underrated (boost),
 * above 50 = overrated (cut). We convert that into a bounded (+/-10%) tilt on the
 * player's STATS, then re-score fantasy points from the tilted stats.
 *
 * The whole point: the tilt lands on the *stats*, not the points. A player catches
 * the same number of passes regardless of league scoring, so one adjustment
 * cascades into PPR / half / non-PPR automatically — and correctly differently,
 * because receptions are worth 1 / 0.5 / 0. Cutting a WR's catches hits his PPR
 * total hard and his non-PPR total not at all, with no extra input from anyone.
 *
 * Scores are entered against the PPR ranking (see ProjectionsPage edit mode), so
 * one number per player is all we ever need.
 *
 * NONE of this touches the combined workbooks / pipeline — it is applied live on
 * the website at display time only.
 */

export type TiltScoring = '' | '_half' | '_nonppr';
type Row = Record<string, unknown>;

const ALPHA = 0.1; // max +/-10% shift.

/** Consensus average (0-100) -> signed tilt delta. >0 = boost (underrated). */
export function tiltFromConsensus(avg: number | null | undefined): number {
  if (avg == null || !Number.isFinite(Number(avg))) return 0;
  const t = Math.max(-1, Math.min(1, (50 - Number(avg)) / 50));
  return ALPHA * t;
}

// Stats where "more is worse" — the tilt moves them the opposite direction
// (an underrated player throws FEWER picks / fumbles less). Both season (`_adj`)
// and weekly (raw) column names are listed.
const BAD_KEYS: Record<string, Set<string>> = {
  QB: new Set(['interceptions', 'interceptions_adj', 'fumbles', 'fumbles_adj']),
  RB: new Set(['fumbles_lost']),
  WR: new Set(),
  TE: new Set(),
  K: new Set(),
  DEF: new Set(['pred_pa', 'pred_points_allowed', 'pred_ya', 'pred_yards_allowed']),
};

/** Tilt a single displayed stat value. Bad stats move opposite the sentiment. */
export function adjustStat(pos: string, key: string, value: unknown, delta: number): number {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;
  if (!delta) return v;
  const bad = BAD_KEYS[pos]?.has(key) ?? false;
  return v * (1 + (bad ? -delta : delta));
}

// Scored stats per skill position, used to size the fantasy-point shift. `w` is
// the |points-per-unit| weight; receptions (`rec`) are weighted by the scoring
// system (1 / 0.5 / 0), which is what makes the three formats diverge correctly.
interface ScoredStat {
  season: string;
  weekly: string;
  w: number;
  rec?: boolean;
}
const SCORED: Record<string, ScoredStat[]> = {
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

function recPt(suf: TiltScoring): number {
  return suf === '' ? 1 : suf === '_half' ? 0.5 : 0;
}

/**
 * Gross point magnitude = sum of |weight|*stat over all scored stats, with
 * receptions weighted by the scoring system. The fantasy-point shift is
 * delta * gross, so a reception cut shrinks PPR gross most and non-PPR gross not
 * at all — the format-correct cascade.
 */
export function grossPoints(pos: string, row: Row, suf: TiltScoring, which: 'season' | 'weekly'): number {
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

/** Adjusted fantasy points for a stat row. Anchored to the model's stored FP. */
export function adjustFP(
  pos: string,
  storedFP: number | null | undefined,
  row: Row,
  suf: TiltScoring,
  which: 'season' | 'weekly',
  delta: number,
): number | null {
  const fp = storedFP == null ? null : Number(storedFP);
  if (fp == null || !Number.isFinite(fp)) return storedFP == null ? null : NaN;
  if (!delta) return fp;
  // K/DEF have no clean linear formula (distance bands / tiers) and are scoring-
  // invariant, so tilt the point total uniformly by the sentiment.
  if (pos === 'K' || pos === 'DEF') return fp * (1 + delta);
  return fp + delta * grossPoints(pos, row, suf, which);
}

/** Scale a floor/ceiling by the same proportion the point estimate moved. */
export function scaleBound(
  bound: number | null | undefined,
  storedFP: number | null | undefined,
  adjFP: number | null | undefined,
): number | null {
  if (bound == null) return null;
  const b = Number(bound);
  if (!Number.isFinite(b)) return NaN;
  const base = Number(storedFP);
  const adj = Number(adjFP);
  if (!Number.isFinite(base) || !Number.isFinite(adj) || base === 0) return b;
  return b * (adj / base);
}
