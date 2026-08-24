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
 */
import { simulateSeason } from './engine.js';

/** Cheap enough to run twice per matchup; see the note on sims below. */
export const LEVERAGE_SIMS = 2_000;

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
