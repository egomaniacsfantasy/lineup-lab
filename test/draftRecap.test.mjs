import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDraftRecap } from '../server/services/draftRecap.js';

/**
 * A draft recap is a pile of comparisons, and a comparison written backwards
 * looks exactly as reasonable as one written forwards. The first version of
 * this scored value as boardRank minus pickNo, which turned every steal into a
 * reach: it called DJ Moore, taken 38th off a board that had him 83rd, the
 * steal of the draft. Nothing about that output looked wrong until it was read
 * against real picks.
 */

const catalog = {};
const projections = [];
let seq = 0;
/** mean is per week, and replacement is derived from whoever goes undrafted. */
function player(name, position, mean) {
  const id = `p${(seq += 1)}`;
  catalog[id] = { id, name, position, team: 'FA' };
  projections.push({ playerId: id, mean, seasonTotal: mean * 17 });
  return id;
}

/* A pool deep enough that replacement level is a real number, and a draft that
   takes the good ones. */
const elite = player('Elite Back', 'RB', 20);
const solid = player('Solid Back', 'RB', 16);
const lateGem = player('Late Gem', 'WR', 18);
const earlyBust = player('Early Bust', 'WR', 8);
for (let i = 0; i < 12; i += 1) player(`Filler ${i}`, i % 2 ? 'RB' : 'WR', 4);

const drafted = [elite, solid, lateGem, earlyBust];
const teams = [
  { rosterId: 1, isUser: true, players: [elite, earlyBust] },
  { rosterId: 2, isUser: false, players: [solid, lateGem] },
];

/* Roster 1 reaches on Early Bust at 2; roster 2 gets Late Gem at 4. */
const picks = [
  { pickNo: 1, round: 1, rosterId: 1, playerId: elite, isKeeper: false },
  { pickNo: 2, round: 1, rosterId: 1, playerId: earlyBust, isKeeper: false },
  { pickNo: 3, round: 1, rosterId: 2, playerId: solid, isKeeper: false },
  { pickNo: 4, round: 1, rosterId: 2, playerId: lateGem, isKeeper: false },
  ...Array.from({ length: 10 }, (_, i) => ({
    pickNo: 5 + i, round: 2, rosterId: (i % 2) + 1, playerId: projections[4 + i].playerId, isKeeper: false,
  })),
];

const recap = buildDraftRecap({ picks, teams, catalog, projections, userRosterId: 1 });

test('value means he lasted past our board, not the other way round', () => {
  assert.ok(recap.available, recap.reason);
  const gem = recap.teams
    .flatMap((t) => [t.bestValue, t.biggestReach])
    .find((row) => row.name === 'Late Gem');
  const bust = recap.teams
    .flatMap((t) => [t.bestValue, t.biggestReach])
    .find((row) => row.name === 'Early Bust');

  /* Late Gem is the second-best player here and went fourth: taken later than
     the board wanted, which is value and must read positive. */
  assert.ok(gem, 'Late Gem should surface as somebody\'s best value');
  assert.ok(gem.delta > 0, `going late off a high board rank must be positive, got ${gem.delta}`);

  /* Early Bust went second and the board barely rates him: a reach, negative. */
  assert.ok(bust, 'Early Bust should surface as somebody\'s biggest reach');
  assert.ok(bust.delta < 0, `going early off a low board rank must be negative, got ${bust.delta}`);
});

test('the steal of the draft is the best value in the league, not the worst', () => {
  const everyDelta = recap.teams.flatMap((t) => [t.bestValue.delta, t.biggestReach.delta]);
  assert.equal(recap.steal.delta, Math.max(...everyDelta));
  assert.ok(recap.steal.delta > 0, 'a steal that lost value is not a steal');
});

test('your side names your best and your worst, and they are not the same pick', () => {
  assert.equal(recap.you.rosterId, 1);
  assert.ok(recap.you.bestValue.delta >= recap.you.biggestReach.delta);
  assert.equal(recap.you.of, 2);
  assert.ok(recap.you.haulRank >= 1 && recap.you.haulRank <= 2);
});

test('keepers are not scored, because nobody drafted them', () => {
  const withKeeper = buildDraftRecap({
    picks: picks.map((p, i) => (i === 0 ? { ...p, isKeeper: true } : p)),
    teams, catalog, projections, userRosterId: 1,
  });
  assert.ok(withKeeper.available);
  assert.equal(withKeeper.totalPicks, picks.length - 1);
  const names = withKeeper.teams.flatMap((t) => [t.bestValue.name, t.biggestReach.name]);
  assert.ok(!names.includes('Elite Back'), 'a retained player was scored as a pick');
});

test('a league with no draft says so instead of inventing one', () => {
  for (const empty of [[], null, undefined]) {
    const out = buildDraftRecap({ picks: empty, teams, catalog, projections, userRosterId: 1 });
    assert.equal(out.available, false);
    assert.equal(out.reason, 'no_draft');
  }
  const unpriced = buildDraftRecap({ picks, teams, catalog, projections: [], userRosterId: 1 });
  assert.equal(unpriced.available, false);
});
