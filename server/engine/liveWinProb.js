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
 *  - variance shrinks with time left: σ = pregame_σ × √f → variance = pregame_var × f.
 *
 * Two mean models, because "points so far" means different things by position:
 *  - SKILL players (default, isDefense=false): points ACCUMULATE FROM ZERO, so
 *    points_so_far is a growing subtotal. mean = points_so_far + pregame × f
 *    ("what you've banked" + "what you're still expected to earn"). At kickoff
 *    points_so_far = 0 → mean = pregame. Correct.
 *  - DEFENSES (isDefense=true): both ESPN and Sleeper score D/ST live, and the
 *    score STARTS AT ITS CEILING and decays — 0 points allowed at kickoff sits in
 *    the top points-allowed bracket (~10), then drifts down as the opponent
 *    scores. So points_so_far is NOT a from-zero subtotal; it's a provisional
 *    estimate of the FINAL. Adding pregame on top double-counts (a defense
 *    projected 9.1 would read ~19.1 at kickoff). Instead blend pregame → live as
 *    the clock runs: mean = pregame × f + points_so_far × (1 − f). At kickoff
 *    (f=1) = pregame; at final (f=0) = actual; in between it trusts the decaying
 *    live number more as time runs out. Both formulas converge to the actual
 *    final at f=0, so applyLiveLocks (final = actual) is unaffected.
 */
export function livePlayerScore(pregameMean, pregameSigma, pointsSoFar, fracRemaining, isDefense = false) {
  const f = Math.max(0, Math.min(1, Number(fracRemaining)));
  const sig = Number(pregameSigma) || 0;
  const mean = Number(pregameMean) || 0;
  const pts = Number(pointsSoFar) || 0;
  return {
    mean: isDefense ? mean * f + pts * (1 - f) : pts + mean * f,
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
 *  - defFor(id)     -> true for a team defense (D/ST); switches to the blend mean
 *                      (see livePlayerScore). Defaults to non-defense.
 */
export function buildLiveTeamDistribution(starterIds, pregameFor, pointsFor, fFor, defFor = () => false) {
  const lives = (starterIds ?? []).map((id) => {
    const pg = pregameFor(id) || {};
    const f = fFor(id);
    return livePlayerScore(pg.mean, pg.sigma ?? pg.stdev, pointsFor(id), f == null ? 1 : f, defFor(id) === true);
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
