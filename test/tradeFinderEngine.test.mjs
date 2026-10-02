import assert from 'node:assert/strict';
import test from 'node:test';

import { simulateSeason, suggestTrades } from '../server/engine/engine.js';
import { runTradeScan } from '../server/engine/tradeScanWorker.js';

/**
 * The Trades-tab finder runs on the trade sender's logic. These pin the engine
 * half of that: the finder's scan of a manager IS the sender's scan of him
 * (same search, same sims, same keep rule, in the worker), and the ticket's
 * pools - several positions, several players, several shapes - only narrow
 * which packages are considered.
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
const teams = [
  [1, 'You', true, roster(20, [18, 16, 14], [9, 7, 6], 8)],
  [2, 'WR-rich', false, roster(19, [9, 7, 6], [18, 16, 14], 9)],
  [3, 'Balanced', false, roster(18, [13, 11, 8], [13, 11, 8], 10)],
  [4, 'Weak', false, roster(15, [10, 8, 6], [10, 8, 6], 6)],
].map(([rosterId, teamName, isUser, players]) => ({
  rosterId, teamName, isUser, players, starters: players.slice(0, 9), reserve: [], taxi: [],
  record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0, pointsAgainst: 0,
}));
const MATCHINGS = [[[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]]];
const scheduleWeeks = [];
for (let w = 1; w <= REG_WEEKS; w += 1) {
  const matchups = [];
  MATCHINGS[w % 3].forEach((pair, pi) => pair.forEach((rid) => matchups.push({ rosterId: rid, matchupId: w * 10 + pi, starters: [] })));
  scheduleWeeks.push({ week: w, matchups });
}
const ctx = {
  league: { rosterPositions: ROSTER_POSITIONS, regularSeasonWeeks: REG_WEEKS, playoffWeekStart: REG_WEEKS + 1, playoffTeams: 2, lastScoredWeek: 0 },
  teams, week: 1, catalog, scheduleWeeks, overlay: null,
  projections: { version: 'finder-v1', projections },
};
const you = teams[0];
const wrRich = teams[1];
/* What the finder endpoint builds from an open ticket: no pools, any gain. */
const openRules = { giveAllow: [], getAllow: [], protect: [], givePositions: [], getPositions: [], minYouDelta: 0 };
const sizeOf = (s) => `${s.give.length}-${s.get.length}`;
const key = (s) => `${s.partnerRosterId}|${s.give.map((p) => p.id).sort()}|${s.get.map((p) => p.id).sort()}`;

test('the finder scan of a manager is the sender scan of him, run in the worker', async () => {
  const sender = { ...openRules, minYouDelta: 0.5, maxPartnerLoss: 13 };
  const inProcess = await suggestTrades(ctx, { maxSim: 20, partnerRosterId: 2, sender });
  const worker = await runTradeScan({ ctx, partnerRosterIds: [2], sender, shapes: [], readsByRoster: {} });
  assert.ok(inProcess.suggestions.length > 0, 'the WR-rich team should have deals');
  assert.deepEqual(
    worker.suggestions.map((s) => [key(s), s.youDelta, s.partnerDelta]),
    inProcess.suggestions.map((s) => [key(s), s.youDelta, s.partnerDelta]),
    'same deals and the same numbers as the sender finds',
  );
  for (const s of worker.suggestions) {
    assert.ok(s.youDelta >= 0.5, 'your title odds rise at least the minimum');
    assert.ok(s.partnerDelta >= -13, 'theirs fall at most the limit');
  }
  const gains = worker.suggestions.map((s) => s.youDelta);
  assert.deepEqual(gains, [...gains].sort((a, b) => b - a), 'ranked by your title gain');
});

test('picked shapes are the only package sizes searched, several at once', async () => {
  const only11 = await suggestTrades(ctx, { maxSim: 20, partnerRosterId: 2, sender: openRules, shapes: [{ give: 1, get: 1 }] });
  assert.ok(only11.suggestions.length > 0);
  assert.ok(only11.suggestions.every((s) => sizeOf(s) === '1-1'), 'a 1 for 1 ask returns only 1 for 1');

  const two = await suggestTrades(ctx, {
    maxSim: 20, partnerRosterId: 2, sender: openRules, shapes: [{ give: 2, get: 1 }, { give: 1, get: 2 }],
  });
  assert.ok(two.suggestions.length > 0);
  assert.ok(two.suggestions.every((s) => ['2-1', '1-2'].includes(sizeOf(s))), 'only the two sizes asked for');

  const big = await suggestTrades(ctx, { maxSim: 20, partnerRosterId: 2, sender: openRules, shapes: [{ give: 3, get: 3 }] });
  assert.ok(big.suggestions.every((s) => sizeOf(s) === '3-3'));
});

test('position pools: every player sent and every player received comes from the picks', async () => {
  const res = await suggestTrades(ctx, {
    maxSim: 20, partnerRosterId: 2,
    // my RB2 and RB3 (keeping RB1 out of it leaves room for a deal that helps me)
    sender: { ...openRules, giveAllow: you.players.slice(2, 4), givePositions: ['RB'], getPositions: ['WR'] },
  });
  assert.ok(res.suggestions.length > 0);
  for (const s of res.suggestions) {
    assert.ok(s.give.every((p) => catalog[p.id].position === 'RB'), 'only RBs go out');
    assert.ok(s.get.every((p) => catalog[p.id].position === 'WR'), 'only WRs come back');
  }
  /* Several positions on a side: still nobody from outside the picks. */
  const wide = await suggestTrades(ctx, {
    maxSim: 20, partnerRosterId: 2,
    sender: { ...openRules, givePositions: ['RB', 'TE'], getPositions: ['WR', 'QB'] },
  });
  for (const s of wide.suggestions) {
    assert.ok(s.give.every((p) => ['RB', 'TE'].includes(catalog[p.id].position)), 'only RBs or TEs go out');
    assert.ok(s.get.every((p) => ['WR', 'QB'].includes(catalog[p.id].position)), 'only WRs or QBs come back');
  }
});

test('player pools: several players on each side, and nobody outside them', async () => {
  const giveAllow = you.players.slice(1, 4); // my three RBs
  const getAllow = wrRich.players.slice(4, 6); // two of his WRs
  const res = await suggestTrades(ctx, {
    maxSim: 20, partnerRosterId: 2,
    sender: { ...openRules, giveAllow, getAllow },
  });
  assert.ok(res.suggestions.length > 0);
  for (const s of res.suggestions) {
    assert.ok(s.give.every((p) => giveAllow.includes(p.id)), 'only sends from the players I picked');
    assert.ok(s.get.every((p) => getAllow.includes(p.id)), 'only receives the players I picked');
  }
});

test('a manager with nothing that helps you returns nothing (no filler deal)', async () => {
  const res = await suggestTrades(ctx, {
    maxSim: 20, partnerRosterId: 4,
    sender: { ...openRules, minYouDelta: 50 }, // no deal lifts a title by 50 points
  });
  assert.deepEqual(res.suggestions, []);
});

test('reusing the simulated scores of unchanged teams changes no number', () => {
  /* A trade changes two teams; the other teams' scores for every sim and week are the
     baseline's, so they are computed once and reused. That is only allowed if the
     result is identical to simulating the whole league again. */
  const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
  const slotLabels = SLOTS;
  const base = { league: ctx.league, teams, scheduleWeeks, week: 1, projectionMap, catalog, slotLabels, seed: 987654321, sims: 1500 };
  const a = teams[0].players[2];
  const b = teams[1].players[5];
  const traded = teams.map((t) => (t.rosterId === 1
    ? { ...t, players: [...t.players.filter((id) => id !== a), b] }
    : t.rosterId === 2
      ? { ...t, players: [...t.players.filter((id) => id !== b), a] }
      : t));

  const plainBefore = simulateSeason(base);
  const plainAfter = simulateSeason({ ...base, teams: traded });

  const scoreCache = new Map();
  const cachedBefore = simulateSeason({ ...base, scoreCache, cacheWrite: true });
  const filled = scoreCache.size;
  const cachedAfter = simulateSeason({ ...base, teams: traded, scoreCache });

  assert.deepEqual(cachedBefore, plainBefore, 'the baseline is the same with the cache');
  assert.deepEqual(cachedAfter, plainAfter, 'the traded league is the same with the cache');
  assert.ok(filled > 0, 'the baseline filled the cache');
  assert.equal(scoreCache.size, filled, 'a trade run reads the cache and adds nothing to it');
  assert.notDeepEqual(plainAfter, plainBefore, 'the trade does move the odds');
});
