/**
 * Closed-form LIVE matchup math (the FantasyPros-style method). No simulation:
 * each team's total is a normal, and win% = Φ((μ_you − μ_opp)/√(σ²_you + σ²_opp)).
 * Microseconds per matchup — this is the number that updates by the play.
 *
 * It's time-aware because livePlayerScore shrinks each player toward their actual
 * score as their game clock runs (mean → points-so-far, variance → 0), so the
 * win% converges to the decided outcome at final.
 */

/** Φ(z) = P(Z ≤ z). Abramowitz & Stegun 26.2.17 (same approx as the provisional lines). */
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

/**
 * One player's LIVE score distribution.
 *  - f = fraction of THAT player's game remaining (1 = not started, 0 = final),
 *    from the game clock. Different players have different f (staggered games).
 *  - mean = points so far + pregame projection × f  (trusts the pregame rate for
 *    the rest of the game; doesn't overreact to a hot/cold start).
 *  - variance shrinks with time left: σ = pregame_σ × √f → variance = pregame_var × f.
 */
export function livePlayerScore(pregameMean, pregameSigma, pointsSoFar, fracRemaining) {
  const f = Math.max(0, Math.min(1, Number(fracRemaining)));
  const sig = Number(pregameSigma) || 0;
  return {
    mean: (Number(pointsSoFar) || 0) + (Number(pregameMean) || 0) * f,
    variance: sig * sig * f,
  };
}

/** Team live distribution = sum of its players' live means and variances. */
export function teamLiveDistribution(playerLives) {
  let mean = 0;
  let variance = 0;
  for (const p of playerLives) {
    mean += p.mean;
    variance += p.variance;
  }
  return { mean, variance };
}

/**
 * A team's LIVE distribution from its starters. Resolvers keep it pure/testable:
 *  - pregameFor(id) -> {mean, sigma|stdev} (this week's pregame projection)
 *  - pointsFor(id)  -> points scored so far (0 if not started)
 *  - fFor(id)       -> fraction of the player's game remaining (0..1; 1 = pregame)
 */
export function buildLiveTeamDistribution(starterIds, pregameFor, pointsFor, fFor) {
  const lives = (starterIds ?? []).map((id) => {
    const pg = pregameFor(id) || {};
    const f = fFor(id);
    return livePlayerScore(pg.mean, pg.sigma ?? pg.stdev, pointsFor(id), f == null ? 1 : f);
  });
  return teamLiveDistribution(lives);
}

/** Closed-form P(team A beats team B) from each team's normal {mean, variance}. */
export function closedFormWinProb(a, b) {
  const spread = a.mean - b.mean;
  const sd = Math.sqrt((a.variance ?? 0) + (b.variance ?? 0));
  if (!(sd > 0)) return spread > 0 ? 1 : spread < 0 ? 0 : 0.5;
  return normalCdf(spread / sd);
}
