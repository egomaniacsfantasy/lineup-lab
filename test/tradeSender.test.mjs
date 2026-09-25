import assert from 'node:assert/strict';
import test from 'node:test';

import { suggestTrades } from '../server/engine/engine.js';
import { runTradeScan } from '../server/engine/tradeScanWorker.js';

// Small 4-team league with varied rosters so real trades exist.
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
// Each team is deep at one position and thin at another -> trades help both.
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
  projections: { version: 'sender-v1', projections },
};
const you = teams[0];
const maxRoster = ROSTER_POSITIONS.length;

test('sender rules: protect, give pool, positions, thresholds, drops that fit', async () => {
  const protect = [you.players[1]]; // my RB1 is untouchable
  const giveAllow = you.players.slice(1, 4); // only my RBs may go
  const sender = { protect, giveAllow, givePositions: [], getPositions: ['WR'], minYouDelta: 0.5, maxPartnerLoss: 13 };
  const res = await suggestTrades(ctx, { maxSim: 20, partnerRosterId: 2, sender });
  assert.equal(res.available, true);
  assert.ok(res.suggestions.length > 0, 'the WR-rich team should have a deal that clears the rules');
  for (const s of res.suggestions) {
    const give = s.give.map((p) => p.id);
    const get = s.get.map((p) => p.id);
    assert.ok(!give.some((id) => protect.includes(id)), 'never offers a protected player');
    assert.ok(give.every((id) => giveAllow.includes(id)), 'only gives from the allowed pool');
    assert.ok(get.every((id) => catalog[id].position === 'WR'), 'only receives allowed positions');
    assert.ok(s.youDelta >= 0.5, 'clears my minimum gain');
    assert.ok(s.partnerDelta >= -13, 'partner loses no more than the cap');
    const need = Math.max(0, you.players.length - give.length + get.length - maxRoster);
    const drops = s.drops.you.map((p) => p.id);
    assert.equal(drops.length, need, 'I drop exactly enough to fit an uneven package');
    assert.ok(!drops.some((id) => protect.includes(id)), 'a protected player is never the drop');
    assert.ok(!drops.some((id) => get.includes(id) || give.includes(id)), 'never drops a traded player');
  }
});

test('thresholds nobody can clear return nothing (no fallback deal)', async () => {
  const res = await suggestTrades(ctx, { maxSim: 20, partnerRosterId: 2, sender: { minYouDelta: 100, maxPartnerLoss: 0 } });
  assert.equal(res.suggestions.length, 0);
});

test('worker scan walks managers one by one and matches the in-process finder', async () => {
  const sender = { minYouDelta: 0, maxPartnerLoss: 100 };
  const direct = await suggestTrades(ctx, { maxSim: 20, partnerRosterId: 3, sender });
  const viaWorker = await runTradeScan({ ctx, partnerRosterIds: [2, 3, 4], sender });
  assert.equal(viaWorker.perManager.length, 3);
  assert.deepEqual(viaWorker.perManager.map((m) => m.partnerRosterId), [2, 3, 4]);
  const fromThree = viaWorker.suggestions.filter((s) => s.partnerRosterId === 3);
  assert.deepEqual(
    fromThree.map((s) => [s.youDelta, s.partnerDelta]).sort(),
    direct.suggestions.map((s) => [s.youDelta, s.partnerDelta]).sort(),
    'same seed + same sims -> identical numbers off the main thread',
  );
});

test('uneven packages: I receive more -> my worst unprotected player is dropped', async () => {
  // My roster is 11 of 12 active. Pin a 1-for-3 (my WR5 for their three WRs): one
  // body too many, so exactly one of mine is cut, and never a protected one.
  const t2 = teams[1].players;
  const protect = [you.players[6]]; // my WR3 (6 ppg), a natural drop candidate, is protected
  const res = await suggestTrades(ctx, {
    maxSim: 20, partnerRosterId: 2, getPlayerIds: [t2[4], t2[5], t2[6]],
    sender: { protect, giveAllow: [you.players[10]], minYouDelta: 0, maxPartnerLoss: 100 },
  });
  const oneForThree = res.suggestions.find((s) => s.give.length === 1 && s.get.length === 3);
  assert.ok(oneForThree, 'the pinned 1-for-3 clears the rules');
  assert.equal(oneForThree.drops.you.length, 1, 'one body over -> one drop');
  assert.ok(!protect.includes(oneForThree.drops.you[0].id), 'the protected player is not the drop');
  // Giving more than I get never makes ME drop (the partner settles his own overflow).
  for (const s of res.suggestions.filter((x) => x.give.length > x.get.length)) assert.equal(s.drops.you.length, 0);
});

test('parity with the Build-a-Trade analyzer, IR stash included', async () => {
  const { analyzeTrade } = await import('../server/engine/engine.js');
  // Copy of the league where I also hold an IR stash: out weeks 1-5, back week 6.
  const stash = `p${uid++}`;
  catalog[stash] = { position: 'RB', name: 'RB-stash' };
  const weekly = {};
  const weeklyCI = {};
  for (let w = 6; w <= 18; w += 1) {
    weekly[String(w)] = 12;
    weeklyCI[String(w)] = { floor: 8, ceiling: 16 };
  }
  for (let w = 1; w <= 5; w += 1) {
    weekly[String(w)] = 0;
    weeklyCI[String(w)] = { floor: 0, ceiling: 0 };
  }
  const irProjections = [...projections, { playerId: stash, position: 'RB', mean: 12, stdev: 4, weekly, weeklyCI, seasonTotal: 12 * 13 }];
  // 11 active + the stash = 12 on a 12-spot roster. A 1-for-2 makes 13: without
  // IR awareness that forces a drop now; with it, the stash's slot absorbs it.
  const irProj = irProjections;
  const irTeams = teams.map((t) => (t.isUser
    ? { ...t, players: [...t.players, stash], reserve: [stash] }
    : t));
  const irCtx = { ...ctx, teams: irTeams, projections: { version: 'sender-ir', projections: irProj } };
  const me = irTeams[0];
  const t2 = irTeams[1].players;
  const give = [me.players[10]];     // my WR5
  const get = [t2[4], t2[5]];        // their two best WRs

  const found = await suggestTrades(irCtx, {
    maxSim: 20, partnerRosterId: 2, getPlayerIds: get,
    sender: { giveAllow: give, minYouDelta: -100, maxPartnerLoss: 100 },
  });
  const deal = found.suggestions.find((s) => s.give.length === 1 && s.get.length === 2);
  assert.ok(deal, 'the pinned 1-for-2 is found');
  assert.equal(deal.drops.you.length, 0, 'the IR stash frees the spot: no drop now');
  assert.equal(deal.drops.youLater.length, 1, 'one drop deferred to the stash return');
  assert.equal(deal.drops.youLater[0].week, 6, 'deferred to the week he returns');

  const analyzed = analyzeTrade(irCtx, { partnerRosterId: 2, give, get });
  assert.equal(deal.youDelta, analyzed.you.delta.titleProb, 'my title delta matches the analyzer exactly');
  assert.equal(deal.partnerDelta, analyzed.partner.delta.titleProb, 'partner delta matches the analyzer exactly');
  assert.equal(analyzed.drops.you.length, 1, 'the analyzer plans the same single (deferred) drop');
});

test('live final games: the analyzer sees the real score the moment a game ends', async () => {
  const { analyzeTrade, pinLeagueActuals, tradeEffectiveWeek } = await import('../server/engine/engine.js');
  const star = you.players[0]; // my QB, week 1 game just went FINAL; pipeline has not rerun
  // Pipeline not rerun yet: his week-1 row is still in the grid.
  const pm = new Map(projections.map((p) => [p.playerId, p]));
  assert.equal(tradeEffectiveWeek([star], pm, 1), 1, 'before the lock: looks unplayed');
  pinLeagueActuals(pm, { liveLocks: { [star]: 45 }, matchups: [] }, 1);
  assert.equal(tradeEffectiveWeek([star], pm, 1), 2, 'final game -> the trade waits for next week');

  // His 45-point game lifts my "before" this-week win % exactly like the hub's odds.
  const t2 = teams[1].players;
  const give = [you.players[10]];
  const get = [t2[10]];
  const stale = analyzeTrade(ctx, { partnerRosterId: 2, give, get });
  const live = analyzeTrade({ ...ctx, liveLocks: { [star]: 45 } }, { partnerRosterId: 2, give, get });
  assert.ok(live.you.before.weekWinProb > stale.you.before.weekWinProb, 'the real score moves this week');
});
