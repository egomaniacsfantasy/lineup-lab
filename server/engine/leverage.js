/**
 * How much does this game matter?
 *
 * For each matchup, condition the season on each of its two outcomes and
 * measure how far apart the two resulting books are. A game whose result barely
 * moves anybody's playoff or title picture scores near zero; a game that swings
 * a playoff spot scores high.
 *
 * This does not modify the simulation. simulateSeason is a pure function of the
 * context it is handed — the schedule and the records are both inputs — so
 * forcing a result is two edits to that input and a second call: drop the
 * matchup from the schedule it would otherwise simulate, and credit the win.
 * That is exactly the shape the engine already runs in during a real season,
 * where some games are decided and the rest are simulated.
 *
 * The same conditioning is what the playoff machine needs, which is why it
 * lives here rather than inside the Game of the Week endpoint.
 *
 * NOT YET WIRED TO A ROUTE, and the reason is worth recording rather than
 * rediscovering. weekLeverage calls simulateSeason directly, which expects a
 * PREPARED context: a projectionMap keyed by player id, slotLabels, and a seed.
 * assembleLeagueCtx in routes/api.js produces the upstream shape instead —
 * `projections` as a version plus a list — and the step that turns one into the
 * other lives inside priceLeague. Pointing this at a real league fails with
 * "projectionMap is not iterable", which is the honest symptom of asking for a
 * prepared ctx and being handed a raw one.
 *
 * There are two ways through and both are Franco's call. Either the engine
 * exports its context-preparation step so callers can build a prepared ctx
 * without re-deriving it, or leverage is computed inside priceLeague where a
 * prepared ctx already exists. Rebuilding that preparation out here is the one
 * option to avoid: it would duplicate overlay application, live locks and
 * replacement levels, and would drift from the real pricing path silently —
 * producing importance scores that look plausible and are computed against
 * different projections than the board beside them.
 *
 * Everything below is verified against a synthetic prepared context in
 * test/leverage.test.mjs and needs no changes when it is wired.
 */
import {
  simulateSeason,
  prepareLeagueCtx,
  teamWeekProjection,
  replacementLevels,
  SEASON_SIMS,
} from './engine.js';

/** Cheap enough to run twice per matchup; see the note on sims below. */
export const LEVERAGE_SIMS = 2_000;

/**
 * Predictor board sims per click. NOT the pricing 10k: the board is uncached and
 * fires on every pick, and each sim blocks the event loop, so 10k would jank the
 * whole site whenever anyone uses the Predictor. The seed is constant (CRN), so
 * 4k is exactly as STABLE as 10k — same number every time — and lands within
 * ~0.3% of it at ~a quarter of the cost. Matches the trade engine's count.
 */
// Predictor conditioned board per click. 4k keeps clicks snappy; the no-pick
// baseline shows the 10k Futures numbers, so untouched teams can shift by a small
// Monte-Carlo amount on the first pick (10k baseline vs 4k conditioned) — an
// accepted tradeoff for responsiveness. Same seed as Futures either way.
export const PREDICTOR_SIMS = 4_000;

/**
 * Remove one matchup from a week and credit the winner.
 *
 * Only the matchup the two teams actually share is dropped. Filtering on
 * "contains either team" removes the other games those rosters are not even in
 * when the pair is not paired, which silently deletes real fixtures from the
 * season — a mistake that produces a board where losing a game improves your
 * odds.
 */
export function forceResult(ctx, { week, winnerId, loserId, winnerPoints, loserPoints }) {
  const scheduleWeeks = (ctx.scheduleWeeks ?? []).map((entry) => {
    if (entry.week !== week) return entry;

    const rostersByMatchup = new Map();
    for (const matchup of entry.matchups ?? []) {
      rostersByMatchup.set(matchup.matchupId, [
        ...(rostersByMatchup.get(matchup.matchupId) ?? []),
        matchup.rosterId,
      ]);
    }

    let target = null;
    rostersByMatchup.forEach((rosterIds, matchupId) => {
      if (rosterIds.includes(winnerId) && rosterIds.includes(loserId)) target = matchupId;
    });
    if (target == null) {
      throw new Error(`roster ${winnerId} does not play ${loserId} in week ${week}`);
    }

    return {
      ...entry,
      matchups: (entry.matchups ?? []).filter((matchup) => matchup.matchupId !== target),
    };
  });

  const teams = (ctx.teams ?? []).map((team) => {
    if (team.rosterId === winnerId) {
      return {
        ...team,
        record: { ...team.record, wins: (team.record?.wins ?? 0) + 1 },
        pointsFor: (team.pointsFor ?? 0) + winnerPoints,
      };
    }
    if (team.rosterId === loserId) {
      return {
        ...team,
        record: { ...team.record, losses: (team.record?.losses ?? 0) + 1 },
        pointsFor: (team.pointsFor ?? 0) + loserPoints,
      };
    }
    return team;
  });

  return { ...ctx, teams, scheduleWeeks };
}

/**
 * Total absolute divergence between two books, in percentage points.
 *
 * Playoff and title probability are both counted. A game can be enormous for
 * seeding and irrelevant for the title, and vice versa; summing both means a
 * game only scores low when it genuinely fails to matter either way.
 */
export function bookDistance(a, b) {
  const byRoster = new Map(b.map((row) => [row.rosterId, row]));
  let total = 0;
  for (const row of a) {
    const other = byRoster.get(row.rosterId);
    if (!other) continue;
    total += Math.abs((row.playoffProb ?? 0) - (other.playoffProb ?? 0));
    total += Math.abs((row.titleProb ?? 0) - (other.titleProb ?? 0));
  }
  return total;
}

/**
 * Leverage for every matchup in a week, on a 0-100 scale.
 *
 * The scale is relative to the biggest swing in that same week, so the top game
 * is always 100 and the rest are read against it. An absolute scale would be
 * meaningless across leagues of different sizes, and would make week 1 in a
 * twelve-team league incomparable to week 13 in a six-team one.
 *
 * `projectedPoints` supplies each side's expected score, used as the points
 * credited to a forced result. Points-for is the seeding tiebreaker, so a
 * forced win with no points attached would quietly distort the standings the
 * conditioned book is built from.
 */
export function weekLeverage(ctx, week, projectedPoints = () => 0) {
  const entry = (ctx.scheduleWeeks ?? []).find((candidate) => candidate.week === week);
  if (!entry) return [];

  const rostersByMatchup = new Map();
  for (const matchup of entry.matchups ?? []) {
    rostersByMatchup.set(matchup.matchupId, [
      ...(rostersByMatchup.get(matchup.matchupId) ?? []),
      matchup.rosterId,
    ]);
  }

  const raw = [];
  rostersByMatchup.forEach((rosterIds, matchupId) => {
    if (rosterIds.length !== 2) return;
    const [a, b] = rosterIds;
    const aPoints = projectedPoints(a, week);
    const bPoints = projectedPoints(b, week);

    const aWins = simulateSeason({
      ...forceResult(ctx, { week, winnerId: a, loserId: b, winnerPoints: aPoints, loserPoints: bPoints }),
      sims: LEVERAGE_SIMS,
    });
    const bWins = simulateSeason({
      ...forceResult(ctx, { week, winnerId: b, loserId: a, winnerPoints: bPoints, loserPoints: aPoints }),
      sims: LEVERAGE_SIMS,
    });

    raw.push({ matchupId, rosterIds: [a, b], distance: bookDistance(aWins, bWins) });
  });

  const biggest = raw.reduce((max, row) => Math.max(max, row.distance), 0);
  return raw
    .map((row) => ({
      matchupId: row.matchupId,
      rosterIds: row.rosterIds,
      distance: row.distance,
      /* Zero when nothing in the week moves at all, rather than 0/0. */
      importance: biggest > 0 ? Math.round((row.distance / biggest) * 100) : 0,
    }))
    .sort((left, right) => right.importance - left.importance);
}

/**
 * Server hash of a pick set, matching the client's pickSetHash in
 * src/services/predictor.ts: "week:matchupId:winnerRosterId" per pick, sorted, joined
 * by "|". The response echoes it so the client discards a run whose picks it has
 * already moved past (a slow run landing after a fast one).
 */
export function pickSetHash(picks = []) {
  return picks
    .map((p) => {
      const base = `${p.week}:${p.matchupId}:${p.winnerRosterId}`;
      // Custom scores are part of the scenario: overriding a score must re-sim and
      // must NOT collide with the same pick at projected points. Only appended when
      // set, so a plain pick hashes identically on client and server.
      return p.winnerPoints != null || p.loserPoints != null
        ? `${base}:${p.winnerPoints ?? ''}:${p.loserPoints ?? ''}`
        : base;
    })
    .sort()
    .join('|');
}

/**
 * The Predictor: condition the season on a set of user-chosen results and re-price
 * playoff/title odds for every team.
 *
 * Each pick forces one matchup's winner and credits points. Points-for is the seeding
 * tiebreaker, so a forced result credits points that keep the winner ahead:
 *   winner = max(winnerProjection, loserProjection + 1); loser = loserProjection
 * (minimal bump, so an upset pick distorts points-for as little as possible). The
 * request may override either side's points (custom input).
 *
 * The seed comes from prepareLeagueCtx (rosters + week + overlay) and a pick never
 * changes those, so every pick set simulates against the identical random draws (CRN):
 * the board moves by the pick's true effect, not sim noise, and identical pick sets
 * quote identical prices.
 */
export function predictSeason(ctx, { picks = [], sims = SEASON_SIMS } = {}) {
  const prepared = prepareLeagueCtx(ctx);
  if (!prepared) return { available: false, reason: 'no_projections' };
  const { teams, projectionMap, catalog, slotLabels, week: currentWeek } = prepared;

  const teamById = new Map(teams.map((t) => [t.rosterId, t]));
  const replacementFor = replacementLevels(teams, projectionMap, catalog);
  // Current week = actual set starters; future weeks = optimal lineup — the same
  // rule the sim and the weekly lines use, so the credited points match the odds.
  const projPoints = (rosterId, week) => {
    const t = teamById.get(rosterId);
    return t ? teamWeekProjection(t, week, currentWeek, slotLabels, projectionMap, catalog, replacementFor) : 0;
  };

  let conditioned = prepared;
  let picked = 0;
  for (const pick of picks) {
    const week = Number(pick.week);
    const entry = (conditioned.scheduleWeeks ?? []).find((e) => e.week === week);
    if (!entry) continue;
    const rosters = (entry.matchups ?? [])
      .filter((m) => String(m.matchupId) === String(pick.matchupId))
      .map((m) => m.rosterId);
    if (rosters.length !== 2) continue;
    const winnerId = rosters.find((r) => String(r) === String(pick.winnerRosterId));
    const loserId = rosters.find((r) => String(r) !== String(pick.winnerRosterId));
    if (winnerId == null || loserId == null) continue;
    const wProj = projPoints(winnerId, week);
    const lProj = projPoints(loserId, week);
    const winnerPoints = pick.winnerPoints != null ? Number(pick.winnerPoints)
      : Math.max(wProj, lProj + 1);            // picked winner clears the loser by >= 1
    const loserPoints = pick.loserPoints != null ? Number(pick.loserPoints) : lProj;
    conditioned = forceResult(conditioned, { week, winnerId, loserId, winnerPoints, loserPoints });
    picked += 1;
  }

  // Remaining (unforced) matchups that ACTUALLY get simulated — only regular-season
  // weeks from the current display week through the last regular week (the same
  // window seasonSetup simulates). Past weeks and playoff weeks were being counted
  // here too, so the number overstated what's really random.
  const regularWeeks = prepared.league?.regularSeasonWeeks ?? 14;
  const fromWeek = Number.isFinite(prepared.week) ? prepared.week : 1;
  const simulated = (conditioned.scheduleWeeks ?? []).reduce((n, entry) => {
    if (entry.week < fromWeek || entry.week > regularWeeks) return n;
    const ids = new Set((entry.matchups ?? []).map((m) => m.matchupId));
    return n + ids.size;
  }, 0);

  const result = simulateSeason({ ...conditioned, sims });
  // record + pointsFor reflect the CONDITIONED standings (base + the forced picks),
  // so the Record / PF columns move as you call games — a picked win shows up as a
  // win here, and forced points land in PF (the seeding tiebreaker).
  const teamByRoster = new Map((conditioned.teams ?? []).map((t) => [String(t.rosterId), t]));
  const rows = result.map((r) => {
    const t = teamByRoster.get(String(r.rosterId));
    const rec = t?.record ?? {};
    return {
      rosterId: String(r.rosterId),
      playoffProb: r.playoffProb,
      titleProb: r.titleProb,
      avgSeed: r.avgSeed,
      playoffOdds: r.playoffOdds,
      titleOdds: r.championOdds,
      record: { wins: rec.wins ?? 0, losses: rec.losses ?? 0, ties: rec.ties ?? 0 },
      pointsFor: t?.pointsFor != null ? Number(Number(t.pointsFor).toFixed(1)) : null,
    };
  });

  return { available: true, pickSetHash: pickSetHash(picks), picked, simulated, sims, rows };
}

/**
 * Page-load graphic that runs 1 + 2·matchups full-season sims. A single 10k sim
 * is one pricing call (fine), but 13 of them back-to-back is ~13× that and would
 * time out the request AND block the event loop. Two things keep it cheap:
 *   - Fewer sims. CRN (the SAME seed for a-wins and b-wins) cancels the Monte
 *     Carlo noise between the two branches, so the importance/book stays clean at
 *     a low count where each branch alone would look noisy.
 *   - It yields between sims (below), so the loop is never blocked for long.
 */
export const FORK_SIMS = 800;

/** Hand the event loop back so a Predictor POST fired mid-forks is serviced
 *  instead of queuing behind 13 blocking sims (the "can't reach the simulator"). */
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Both branches of every matchup in a week, for the "This week" fork graphic.
 *
 * For each matchup it conditions the season on each side winning — reusing the
 * SAME prepared seed as the baseline (CRN), so the win/loss books differ only by
 * the forced game — and reports each side's PLAYOFF probability now / if-it-wins /
 * if-it-loses, plus the matchup's importance (0-100, weekLeverage's bookDistance
 * normalised to the biggest swing in the week). gameOfTheWeek is the top one.
 *
 * Points on a forced win match the Predictor: winner = max(winnerProj, loserProj+1),
 * loser = loserProj — minimal bump, points-for stays honest for seeding.
 *
 * async + yielding so the per-page-load cost never stalls the server; the route
 * caches the result for 5 minutes.
 */
export async function weekForks(ctx, week, { sims = FORK_SIMS } = {}) {
  const prepared = prepareLeagueCtx(ctx);
  if (!prepared) return { available: false, week: week ?? null, forks: [] };
  const { teams, projectionMap, catalog, scheduleWeeks, slotLabels, week: currentWeek } = prepared;

  const targetWeek = week ?? prepared.week;
  const entry = (scheduleWeeks ?? []).find((e) => e.week === targetWeek);
  if (!entry) return { available: true, week: targetWeek ?? null, forks: [], gameOfTheWeek: null };

  const teamById = new Map(teams.map((t) => [t.rosterId, t]));
  const replacementFor = replacementLevels(teams, projectionMap, catalog);
  const projPoints = (rosterId) => {
    const t = teamById.get(rosterId);
    return t ? teamWeekProjection(t, targetWeek, currentWeek, slotLabels, projectionMap, catalog, replacementFor) : 0;
  };

  // Baseline board (nothing forced) → each side's nowProb, reused for every matchup.
  // "Current odds" (nowProb) at the FULL Futures count + same seed, so the number
  // the This-week strip shows is byte-identical to the Futures tab (no 800-vs-10k
  // drift). The win/loss BRANCHES below stay at the lighter `sims` — forking every
  // game at 10k would time out (the earlier "cannot reach the simulator") — so a
  // branch swing is a directional read layered on the exact current number.
  const nowByRoster = new Map(
    simulateSeason({ ...prepared, sims: SEASON_SIMS }).map((r) => [String(r.rosterId), r.playoffProb]),
  );

  const rostersByMatchup = new Map();
  for (const m of entry.matchups ?? []) {
    rostersByMatchup.set(m.matchupId, [...(rostersByMatchup.get(m.matchupId) ?? []), m.rosterId]);
  }
  const pairs = [...rostersByMatchup.entries()].filter(([, ids]) => ids.length === 2);

  const raw = [];
  for (const [matchupId, [a, b]] of pairs) {
    await yieldToLoop();
    const aProj = projPoints(a);
    const bProj = projPoints(b);
    const aWins = simulateSeason({
      ...forceResult(prepared, { week: targetWeek, winnerId: a, loserId: b, winnerPoints: Math.max(aProj, bProj + 1), loserPoints: bProj }),
      sims,
    });
    await yieldToLoop();
    const bWins = simulateSeason({
      ...forceResult(prepared, { week: targetWeek, winnerId: b, loserId: a, winnerPoints: Math.max(bProj, aProj + 1), loserPoints: aProj }),
      sims,
    });
    const aWinsBy = new Map(aWins.map((r) => [String(r.rosterId), r.playoffProb]));
    const bWinsBy = new Map(bWins.map((r) => [String(r.rosterId), r.playoffProb]));
    const ka = String(a);
    const kb = String(b);
    raw.push({
      matchupId,
      distance: bookDistance(aWins, bWins),
      sides: [
        { rosterId: ka, nowProb: nowByRoster.get(ka) ?? 0, winProb: aWinsBy.get(ka) ?? 0, lossProb: bWinsBy.get(ka) ?? 0 },
        { rosterId: kb, nowProb: nowByRoster.get(kb) ?? 0, winProb: bWinsBy.get(kb) ?? 0, lossProb: aWinsBy.get(kb) ?? 0 },
      ],
    });
  }

  const biggest = raw.reduce((max, row) => Math.max(max, row.distance), 0);
  const forks = raw
    .map((row) => ({
      matchupId: row.matchupId,
      importance: biggest > 0 ? Math.round((row.distance / biggest) * 100) : 0,
      sides: row.sides,
    }))
    .sort((left, right) => right.importance - left.importance);

  return { available: true, week: targetWeek, forks, gameOfTheWeek: forks.length ? forks[0].matchupId : null };
}

/**
 * Each team's projected points for every remaining week — the mean of its
 * lineup that week (teamWeekProjection: current week = actual starters, future =
 * optimal). NO Monte Carlo, so it is
 * cheap. Feeds the Predictor's per-matchup projection display and the default
 * shown in the score-override boxes — the SAME number the engine credits a forced
 * result by default (winner = max(winnerProj, loserProj+1), loser = loserProj).
 */
export function weekProjections(ctx) {
  const prepared = prepareLeagueCtx(ctx);
  if (!prepared) return { available: false, weeks: [] };
  const { teams, projectionMap, catalog, scheduleWeeks, week, slotLabels, league } = prepared;
  const replacementFor = replacementLevels(teams, projectionMap, catalog);
  const from = week ?? 1;
  // Iterate TEAMS x WEEKS rather than matchups, so the PLAYOFF weeks (15-17) are
  // covered too: they have no scheduled opponent yet, but each team's own
  // optimal-lineup projection for that week is well-defined. Range runs from the
  // current week through the last playoff week the schedule reaches.
  const regularWeeks = league?.regularSeasonWeeks ?? 14;
  const playoffWeekStart = league?.playoffWeekStart ?? (regularWeeks + 1);
  const scheduleLast = (scheduleWeeks ?? []).reduce((m, e) => Math.max(m, e.week), 0);
  const lastWeek = Math.max(scheduleLast, playoffWeekStart + 2);
  const weeks = [];
  for (let w = from; w <= lastWeek; w += 1) {
    const scores = {};
    for (const t of teams) {
      // Current week = actual starters, future/playoff weeks = optimal — matches the sim.
      scores[String(t.rosterId)] = Number(
        teamWeekProjection(t, w, week, slotLabels, projectionMap, catalog, replacementFor).toFixed(1),
      );
    }
    weeks.push({ week: w, scores });
  }
  return { available: true, weeks };
}
