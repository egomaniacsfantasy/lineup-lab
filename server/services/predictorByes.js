/**
 * Key players on bye, per team, per week. Feeds the Predictor's future weeks.
 *
 * Display only. Nothing here prices anything: the engine already benches a
 * bye player and fills his slot when it projects a future week. This says
 * WHY a team's projection dips that week, by naming who is missing.
 *
 * "Key" means a player the team would start at full strength: he is in the
 * lineup the engine's own optimalAssign picks on season-long means. A backup
 * on bye changes nothing about the week and is left out, which is what keeps
 * the list short enough to read on a matchup card.
 */

/**
 * @param {object} input
 * @param {Array<{rosterId: number|string, players?: string[], reserve?: string[], taxi?: string[]}>} input.teams
 * @param {Record<string, {name?: string, position?: string, byeWeek?: number|null}>} input.catalog
 * @param {number[]} input.weeks  the weeks to report
 * @param {(playerIds: string[]) => Array<{slot: string, playerId: string|null}>} input.assign
 *   the full-strength lineup for a roster (the engine's optimalAssign, bound)
 * @param {(playerId: string) => number} [input.meanOf]  orders the names, best first
 * @returns {Record<number, Record<string, Array<{id: string, name: string, position: string|null}>>>}
 */
export function keyByesByWeek({ teams, catalog, weeks, assign, meanOf = () => 0 }) {
  const wanted = new Set(weeks.map(Number));
  const out = {};
  for (const week of wanted) out[week] = {};

  for (const team of teams ?? []) {
    /* Injured reserve and the taxi squad cannot be started, so a bye there
       costs the team nothing that week. */
    const parked = new Set([...(team.reserve ?? []), ...(team.taxi ?? [])].map(String));
    const startable = (team.players ?? []).filter((id) => !parked.has(String(id)));
    const starters = assign(startable)
      .map((slot) => slot.playerId)
      .filter((id) => id != null);

    for (const id of starters) {
      const entry = catalog?.[id];
      const bye = Number(entry?.byeWeek);
      if (!Number.isFinite(bye) || !wanted.has(bye)) continue;
      const list = (out[bye][String(team.rosterId)] ??= []);
      list.push({ id: String(id), name: entry?.name ?? String(id), position: entry?.position ?? null });
    }
  }

  for (const week of wanted) {
    for (const list of Object.values(out[week])) {
      list.sort((a, b) => meanOf(b.id) - meanOf(a.id));
    }
  }
  return out;
}
