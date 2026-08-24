import assert from 'node:assert/strict';
import test from 'node:test';
import { bookDistance, forceResult, weekLeverage } from '../server/engine/leverage.js';

/**
 * Leverage conditions the season on each outcome of a game and measures how far
 * apart the two resulting books are. It changes nothing about the simulation:
 * simulateSeason is a pure function of its context, so forcing a result is two
 * edits to that input and a second call.
 */

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'];
const REG_WEEKS = 6;

function buildFixture(teamCount = 4) {
  const catalog = {};
  const projections = [];
  let uid = 0;
  const P = (position, ppg) => {
    const id = `p${uid++}`;
    catalog[id] = { position, name: `${position}${id}` };
    projections.push({ playerId: id, mean: ppg, stdev: ppg * 0.35, weekly: {}, weeklyCI: {} });
    return id;
  };
  const team = (rosterId, scale) => {
    const players = [
      P('QB', 20 * scale), P('RB', 18 * scale), P('RB', 14 * scale), P('RB', 8 * scale),
      P('WR', 17 * scale), P('WR', 13 * scale), P('WR', 9 * scale), P('TE', 11 * scale),
      P('TE', 5 * scale), P('K', 9 * scale), P('DEF', 8 * scale), P('WR', 7 * scale),
    ];
    return {
      rosterId, teamName: `T${rosterId}`, isUser: rosterId === 1, players,
      starters: players.slice(0, 10), record: { wins: 0, losses: 0, ties: 0 },
      pointsFor: 0, pointsAgainst: 0,
    };
  };
  const teams = Array.from({ length: teamCount }, (_, i) => team(i + 1, 1.1 - i * 0.06));

  const scheduleWeeks = [];
  let rot = teams.map((t) => t.rosterId);
  for (let w = 1; w <= REG_WEEKS; w += 1) {
    const matchups = [];
    for (let i = 0; i < teamCount / 2; i += 1) {
      const a = rot[i];
      const b = rot[teamCount - 1 - i];
      const matchupId = w * 100 + i;
      matchups.push({ rosterId: a, matchupId, starters: [] }, { rosterId: b, matchupId, starters: [] });
    }
    scheduleWeeks.push({ week: w, matchups });
    rot = [rot[0], rot[teamCount - 1], ...rot.slice(1, teamCount - 1)];
  }

  return {
    league: {
      rosterPositions: [...SLOTS, 'BN', 'BN'],
      regularSeasonWeeks: REG_WEEKS,
      playoffWeekStart: REG_WEEKS + 1,
      playoffTeams: 2,
    },
    teams,
    scheduleWeeks,
    week: 1,
    catalog,
    projectionMap: new Map(projections.map((p) => [p.playerId, p])),
    slotLabels: SLOTS,
    seed: 12345,
  };
}

test('forcing a result drops only the matchup those two share', () => {
  const ctx = buildFixture();
  const week1 = ctx.scheduleWeeks[0];
  const pairs = new Map();
  for (const m of week1.matchups) pairs.set(m.matchupId, [...(pairs.get(m.matchupId) ?? []), m.rosterId]);
  const [matchupId, [a, b]] = [...pairs.entries()][0];

  const forced = forceResult(ctx, { week: 1, winnerId: a, loserId: b, winnerPoints: 120, loserPoints: 100 });
  const forcedWeek = forced.scheduleWeeks.find((w) => w.week === 1);

  /* One matchup gone, every other fixture in the week untouched. Filtering on
     "contains either team" would delete games those rosters are not even in,
     which produces a board where losing improves your odds. */
  assert.equal(forcedWeek.matchups.length, week1.matchups.length - 2);
  assert.ok(!forcedWeek.matchups.some((m) => m.matchupId === matchupId));
  assert.equal(forced.scheduleWeeks.length, ctx.scheduleWeeks.length);

  /* The win and the points are credited. */
  assert.equal(forced.teams.find((t) => t.rosterId === a).record.wins, 1);
  assert.equal(forced.teams.find((t) => t.rosterId === a).pointsFor, 120);
  assert.equal(forced.teams.find((t) => t.rosterId === b).record.losses, 1);

  /* And the original context is untouched. */
  assert.equal(ctx.scheduleWeeks[0].matchups.length, week1.matchups.length);
  assert.equal(ctx.teams.find((t) => t.rosterId === a).record.wins, 0);
});

test('forcing a pairing that does not exist is refused, not silently ignored', () => {
  const ctx = buildFixture();
  const week1 = ctx.scheduleWeeks[0];
  const pairs = new Map();
  for (const m of week1.matchups) pairs.set(m.matchupId, [...(pairs.get(m.matchupId) ?? []), m.rosterId]);
  const [[, [a]], [, [c]]] = [...pairs.entries()];

  /* a and c are in different games this week. Quietly doing nothing here is how
     a forced result deletes the wrong fixture. */
  assert.throws(
    () => forceResult(ctx, { week: 1, winnerId: a, loserId: c, winnerPoints: 1, loserPoints: 1 }),
    /does not play/,
  );
});

test('two identical books are zero apart, and a changed one is not', () => {
  const book = [
    { rosterId: 1, playoffProb: 80, titleProb: 30 },
    { rosterId: 2, playoffProb: 20, titleProb: 5 },
  ];
  assert.equal(bookDistance(book, book), 0);

  const moved = [
    { rosterId: 1, playoffProb: 70, titleProb: 25 },
    { rosterId: 2, playoffProb: 30, titleProb: 10 },
  ];
  /* 10 + 5 + 10 + 5 across both teams and both markets. */
  assert.ok(Math.abs(bookDistance(book, moved) - 30) < 1e-9);
});

test('leverage ranks a week and the top game scores 100', () => {
  const ctx = buildFixture();
  const scores = weekLeverage(ctx, 1, () => 110);

  assert.ok(scores.length >= 2, 'every matchup in the week is scored');
  assert.equal(scores[0].importance, 100, 'the biggest swing in the week anchors the scale');
  assert.ok(scores.every((row) => row.importance >= 0 && row.importance <= 100));
  /* Sorted, so the caller can badge scores[0] without re-sorting. */
  for (let i = 1; i < scores.length; i += 1) {
    assert.ok(scores[i - 1].importance >= scores[i].importance);
  }
  /* Conditioning on opposite outcomes must actually move the book. */
  assert.ok(scores[0].distance > 0, 'the most important game of the week moved nothing');
});

test('a week that does not exist scores nothing rather than throwing', () => {
  assert.deepEqual(weekLeverage(buildFixture(), 99), []);
});
