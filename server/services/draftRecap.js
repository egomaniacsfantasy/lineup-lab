import { replacementLevels } from '../engine/engine.js';

/**
 * What the draft looked like, priced.
 *
 * The question a recap has to answer is "was that pick good", and the honest
 * form of it here is "good compared to what". Two things it deliberately is
 * not:
 *
 * It is not ADP. There is no average-draft-position feed in this project, so
 * nothing here can say what the rest of the fantasy world thought. Comparing a
 * pick to our own board is the thing we can actually stand behind, and it is
 * the more interesting claim anyway: the room let him go at 44, we had him
 * 21st.
 *
 * And it is not a title-odds attribution. Saying a specific pick moved your
 * championship odds by some amount means re-simulating the season without that
 * player, per player, and the pieces would not sum to the whole because title
 * odds are not linear in one roster spot. A ranking is a ranking; it does not
 * pretend to be a causal claim.
 *
 * The board is value over replacement, not raw projected points. Ranking by
 * points would call every quarterback a reach, because a QB projected for more
 * total points than an RB is not therefore worth an earlier pick in a league
 * that starts one of him. Replacement level is Franco's (engine.js), so the
 * recap and the trade engine measure a player's worth the same way.
 */
export function buildDraftRecap({ picks, teams, catalog, projections, userRosterId }) {
  if (!picks?.length || !projections?.length) {
    return { available: false, reason: 'no_draft' };
  }

  const projectionMap = new Map(projections.map((p) => [String(p.playerId), p]));
  const replacementFor = replacementLevels(teams, projectionMap, catalog);

  /* Keepers were never on the board: nobody drafted them, they were retained,
     so scoring them as picks would hand a keeper league a table of fictional
     steals. */
  const drafted = picks.filter((pick) => !pick.isKeeper && !pick.unresolved);
  if (drafted.length === 0) return { available: false, reason: 'no_priced_picks' };

  const valued = drafted
    .map((pick) => {
      const id = String(pick.playerId);
      const player = catalog[id];
      const projection = projectionMap.get(id);
      if (!player || !projection) return null;
      const mean = Number(projection.mean);
      if (!Number.isFinite(mean)) return null;
      return {
        ...pick,
        name: player.name,
        position: player.position,
        team: player.team ?? null,
        /* Per week, both sides, so the subtraction means something. */
        vor: Number((mean - replacementFor(player.position)).toFixed(2)),
      };
    })
    .filter(Boolean);

  if (valued.length < 10) return { available: false, reason: 'not_enough_priced_picks' };

  /* The board: where we would have taken each of these players, given only the
     players who were actually drafted. Ranking against the whole projection
     file would score everyone against hundreds of names no one considered. */
  const board = [...valued].sort((a, b) => b.vor - a.vor);
  const boardRank = new Map(board.map((entry, index) => [entry.playerId, index + 1]));

  const scored = valued.map((entry) => ({
    ...entry,
    ourRank: boardRank.get(entry.playerId),
    /* pickNo minus board rank, so positive is value: he lasted past where we
       had him and you got him late. Negative is a reach, taken earlier than we
       would have.

       Written the other way round first, which turned every steal into a reach
       and shipped a card calling DJ Moore at 38, off a board that had him 83rd,
       the steal of the draft. Real picks are the only thing that catches a
       flipped sign, because both directions look perfectly reasonable. */
    delta: entry.pickNo - boardRank.get(entry.playerId),
  }));

  const forRoster = (rosterId) => scored.filter((entry) => entry.rosterId === rosterId);
  const best = (rows) => rows.reduce((a, b) => (b.delta > a.delta ? b : a), rows[0]);
  const worst = (rows) => rows.reduce((a, b) => (b.delta < a.delta ? b : a), rows[0]);

  const summarise = (rosterId) => {
    const rows = forRoster(rosterId);
    if (rows.length === 0) return null;
    const totalVor = rows.reduce((sum, entry) => sum + entry.vor, 0);
    return {
      rosterId,
      picks: rows.length,
      totalVor: Number(totalVor.toFixed(1)),
      bestValue: best(rows),
      biggestReach: worst(rows),
    };
  };

  const rosterIds = [...new Set(scored.map((entry) => entry.rosterId))];
  const byTeam = rosterIds.map(summarise).filter(Boolean);
  /* Whose haul the board liked most, which is a different question from who is
     favoured: this ignores what they already had. */
  const hauls = [...byTeam].sort((a, b) => b.totalVor - a.totalVor);
  const haulRank = new Map(hauls.map((row, index) => [row.rosterId, index + 1]));

  const steal = scored.reduce((a, b) => (b.delta > a.delta ? b : a), scored[0]);

  return {
    available: true,
    totalPicks: drafted.length,
    pricedPicks: scored.length,
    rounds: Math.max(...scored.map((entry) => entry.round ?? 1)),
    teams: byTeam.map((row) => ({ ...row, haulRank: haulRank.get(row.rosterId) })),
    you:
      userRosterId != null
        ? {
            ...(summarise(userRosterId) ?? {}),
            haulRank: haulRank.get(userRosterId) ?? null,
            of: byTeam.length,
          }
        : null,
    /* One pick, league-wide, that the board says somebody stole. It names
       another manager, which is the only part of a recap that starts an
       argument rather than settling one. */
    steal,
  };
}
