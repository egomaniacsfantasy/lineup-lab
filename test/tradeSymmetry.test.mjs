import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { analyzeTrade } from '../server/engine/engine.js';

/**
 * A trade is one fact about the league. Whoever opens the analyzer -- the
 * proposer or the manager on the other side -- must read the SAME numbers,
 * just with "you" and "partner" swapped.
 *
 * It was not: each manager's personal "My board" overlay rode along on the
 * request, so the trade was priced on HIS lines (and, because the overlay is
 * part of the sim seed, on a different random stream). Breece Hall for George
 * Kittle read +0.1 / +2.3 on one screen and +0.9 / +0.7 on the other.
 */
const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const ROSTER_POSITIONS = [...SLOTS, 'BN', 'BN', 'BN'];
const REG_WEEKS = 14;
const catalog = {};
const projections = [];
let uid = 0;
function P(position, ppg) {
  const id = `p${uid++}`;
  catalog[id] = { position, name: `${position}${id}` };
  const weekly = {};
  const weeklyCI = {};
  for (let w = 1; w <= 18; w += 1) {
    weekly[String(w)] = ppg;
    weeklyCI[String(w)] = { floor: ppg * 0.7, ceiling: ppg * 1.3 };
  }
  projections.push({ playerId: id, position, mean: ppg, stdev: ppg * 0.35, weekly, weeklyCI, seasonTotal: ppg * 17 });
  return id;
}
function roster(q, rb, wr, te) {
  return [
    P('QB', q), P('RB', rb[0]), P('RB', rb[1]), P('RB', rb[2]),
    P('WR', wr[0]), P('WR', wr[1]), P('WR', wr[2]), P('TE', te), P('K', 8), P('DEF', 8),
    P('WR', 5),
  ];
}
const baseTeams = [
  [1, 'RB-rich', roster(20, [18, 16, 14], [9, 7, 6], 8)],
  [2, 'WR-rich', roster(19, [9, 7, 6], [18, 16, 14], 9)],
  [3, 'Balanced', roster(18, [13, 11, 8], [13, 11, 8], 10)],
  [4, 'Weak', roster(15, [10, 8, 6], [10, 8, 6], 6)],
].map(([rosterId, teamName, players]) => ({
  rosterId, teamName, players, starters: players.slice(0, 9), reserve: [], taxi: [],
  record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0, pointsAgainst: 0,
}));
const MATCHINGS = [[[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]]];
const scheduleWeeks = [];
for (let w = 1; w <= REG_WEEKS; w += 1) {
  const matchups = [];
  MATCHINGS[w % 3].forEach((pair, pi) => pair.forEach((rid) => matchups.push({ rosterId: rid, matchupId: w * 10 + pi, starters: [] })));
  scheduleWeeks.push({ week: w, matchups });
}
/** The league as seen by the manager of `viewer` (only `isUser` differs). */
const ctxFor = (viewer, overlay = null) => ({
  league: { rosterPositions: ROSTER_POSITIONS, regularSeasonWeeks: REG_WEEKS, playoffWeekStart: REG_WEEKS + 1, playoffTeams: 2, lastScoredWeek: 0 },
  teams: baseTeams.map((t) => ({ ...t, isUser: t.rosterId === viewer })),
  week: 1, catalog, scheduleWeeks, overlay,
  projections: { version: 'symmetry-v1', projections },
});
const rb = baseTeams[0].players[2]; // team 1's RB2
const wr = baseTeams[1].players[5]; // team 2's WR2
const sides = (r) => ({ 1: r.you.rosterId === 1 ? r.you : r.partner, 2: r.you.rosterId === 2 ? r.you : r.partner });

test('both managers read the same trade numbers', () => {
  const fromOne = analyzeTrade(ctxFor(1), { partnerRosterId: 2, give: [rb], get: [wr] });
  const fromTwo = analyzeTrade(ctxFor(2), { partnerRosterId: 1, give: [wr], get: [rb] });
  assert.equal(fromOne.available, true);
  assert.equal(fromTwo.available, true);
  for (const rid of [1, 2]) {
    assert.deepEqual(sides(fromOne)[rid].before, sides(fromTwo)[rid].before, `team ${rid} "before" differs by viewer`);
    assert.deepEqual(sides(fromOne)[rid].after, sides(fromTwo)[rid].after, `team ${rid} "after" differs by viewer`);
    assert.deepEqual(sides(fromOne)[rid].delta, sides(fromTwo)[rid].delta, `team ${rid} delta differs by viewer`);
  }
});

test('a personal board overlay is what made the two screens disagree', () => {
  /* Documents the mechanism: the engine is symmetric, so the only way the two
     managers saw different numbers was a per-user input. An overlay is one. */
  const overlay = { [wr]: { base: 4, weekly: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), 4])) } };
  const house = analyzeTrade(ctxFor(1), { partnerRosterId: 2, give: [rb], get: [wr] });
  const mine = analyzeTrade(ctxFor(1, overlay), { partnerRosterId: 2, give: [rb], get: [wr] });
  assert.notDeepEqual(house.you.delta, mine.you.delta);
});

test('no trade endpoint prices on the viewer\'s personal overlay', async () => {
  const source = await fs.readFile(path.resolve('server/routes/api.js'), 'utf8');
  for (const route of ['/trade', '/trade-analyze', '/trade-counter', '/trade-suggestions', '/trade-rationale']) {
    const start = source.indexOf(`apiRouter.post('/league/:leagueId${route}',`);
    assert.ok(start >= 0, `${route} not found`);
    const end = source.indexOf('\napiRouter.', start + 10);
    const body = source.slice(start, end < 0 ? undefined : end);
    assert.doesNotMatch(body, /parseOverlayHeader\(req\)/, `${route} reads the viewer's overlay header`);
    assert.doesNotMatch(body, /req\.body\?\.overlay/, `${route} reads an overlay from the request body`);
  }
});
