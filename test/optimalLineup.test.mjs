import assert from 'node:assert/strict';
import test from 'node:test';
import { priceLeague } from '../server/engine/engine.js';

/**
 * "What if we both set our best lineup?" on the current week.
 *
 * Future weeks were always priced optimal-vs-optimal; the current week is the
 * line for the lineup you actually set. This is the hypothetical beside it, and
 * two properties decide whether it can be believed:
 *
 *  - A lineup that is ALREADY optimal must move the line by exactly zero. The
 *    two runs share a seed (common random numbers), so identical lineups draw
 *    identical numbers. Priced by a second independent sim it would wander a
 *    few tenths at MATCHUP_SIMS and invent movement that is not there, on the
 *    screen whose whole job is to tell you whether a change is worth making.
 *
 *  - A lineup with a stud on the bench must move it up, and the returned best
 *    lineup must be the one that starts him.
 */

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const ROSTER_POSITIONS = [...SLOTS, 'BN', 'BN', 'BN', 'BN'];
const WEEKS = 4;
const TEAM_COUNT = 4;

const catalog = {};
const projections = [];
let uid = 0;

function P(position, ppg, name) {
  const id = `p${uid += 1}`;
  catalog[id] = { position, name, team: 'FA', injuryStatus: null };
  projections.push({ playerId: id, mean: ppg, stdev: ppg * 0.35, weekly: {}, weeklyCI: {} });
  return id;
}

/* Every team gets one clear bench upgrade: a 22-point RB behind the starters,
   so "start your best" always has something to do if the lineup is set badly. */
function buildTeam(rosterId, scale) {
  const starters = [
    P('QB', 20 * scale, `QB ${rosterId}`),
    P('RB', 17 * scale, `RB1 ${rosterId}`),
    P('RB', 13 * scale, `RB2 ${rosterId}`),
    P('WR', 16 * scale, `WR1 ${rosterId}`),
    P('WR', 12 * scale, `WR2 ${rosterId}`),
    P('TE', 10 * scale, `TE ${rosterId}`),
    P('WR', 9 * scale, `FLEX ${rosterId}`),
    P('K', 8 * scale, `K ${rosterId}`),
    P('DEF', 7 * scale, `DEF ${rosterId}`),
  ];
  const benchStud = P('RB', 22 * scale, `Bench stud ${rosterId}`);
  const bench = [benchStud, P('WR', 5, `Scrub WR ${rosterId}`), P('TE', 4, `Scrub TE ${rosterId}`)];
  return {
    rosterId,
    teamName: `Team ${rosterId}`,
    ownerName: `Owner ${rosterId}`,
    isUser: rosterId === 1,
    players: [...starters, ...bench],
    starters,
    benchStud,
    record: { wins: 0, losses: 0, ties: 0 },
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

const teams = [1, 2, 3, 4].map((id) => buildTeam(id, 1.1 - id * 0.05));

/* A fixed round-robin: roster 1 plays roster 2 in week 1. */
const scheduleWeeks = [];
for (let w = 1; w <= WEEKS; w += 1) {
  const matchups = [];
  for (let i = 0; i < TEAM_COUNT / 2; i += 1) {
    const a = teams[i];
    const b = teams[TEAM_COUNT - 1 - i];
    const matchupId = w * 10 + i;
    matchups.push({ rosterId: a.rosterId, matchupId, starters: a.starters });
    matchups.push({ rosterId: b.rosterId, matchupId, starters: b.starters });
  }
  scheduleWeeks.push({ week: w, matchups });
}

const league = {
  rosterPositions: ROSTER_POSITIONS,
  regularSeasonWeeks: WEEKS,
  playoffWeekStart: WEEKS + 1,
  playoffTeams: 2,
  scoringFamily: 'ppr',
  isDynasty: false,
};

/** Price the league with week-1 lineups set however the case needs. */
function priceWith(lineups = {}) {
  const week = 1;
  const startersFor = (team) => lineups[team.rosterId] ?? team.starters;
  const withLineups = teams.map((team) => ({ ...team, starters: startersFor(team) }));
  const byRoster = new Map(withLineups.map((team) => [team.rosterId, team]));
  const matchups = scheduleWeeks[0].matchups.map((m) =>
    ({ ...m, starters: byRoster.get(m.rosterId)?.starters ?? m.starters }));
  return priceLeague({
    league,
    teams: withLineups,
    matchups,
    week,
    catalog,
    scheduleWeeks: scheduleWeeks.map((entry, index) =>
      (index === 0 ? { ...entry, matchups } : entry)),
    overlay: null,
    projections: { version: 'optimal-test-v1', projections },
  });
}

const optimalFor = (priced) => priced.weeklyLines.find((line) => line.week === 1)?.optimal ?? null;
const idsOf = (starters) => starters.map((slot) => slot.playerId).filter(Boolean);

const user = teams[0];
/* Week 1 pairs roster 1 with roster 4. */
const opponent = teams[TEAM_COUNT - 1];

/* The engine's own answer for each side, rather than a lineup hand-guessed to
   be optimal: with a FLEX in the slots there is more than one plausible best
   XI, and a test that guesses wrong tests nothing. */
const asSet = optimalFor(priceWith());
const USER_BEST = idsOf(asSet.yourStarters);
const OPPONENT_BEST = idsOf(asSet.opponentStarters);

test('the best-lineup line is attached to this week only', () => {
  const priced = priceWith();
  assert.ok(priced.available, 'the fixture league did not price');
  assert.ok(optimalFor(priced), 'this week carries no best-lineup line');
  for (const line of priced.weeklyLines.filter((entry) => entry.week !== 1)) {
    assert.equal(line.optimal, null, `week ${line.week} is already optimal-vs-optimal; it needs no second one`);
  }
});

test('both lineups already optimal moves the line by exactly zero', () => {
  /* Not "close to zero". Two independently seeded sims would drift by a few
     tenths here, and a screen that offers "+0.3pp available" when nothing is
     available is worse than one that says nothing. Zero is what common random
     numbers buy, and it is the property worth guarding. */
  const optimal = optimalFor(priceWith({ [user.rosterId]: USER_BEST, [opponent.rosterId]: OPPONENT_BEST }));
  assert.equal(optimal.deltaWinProb, 0, 'two optimal lineups were told they could improve');
});

test('a stud on your bench is win probability you can still go and take', () => {
  /* His lineup already right, yours wrong: the whole move is yours to make. */
  const benched = user.starters.map((id, index) => (index === 6 ? user.starters[6] : id));
  const withoutStud = USER_BEST.map((id) => (id === user.benchStud ? benched[6] : id));
  const optimal = optimalFor(priceWith({ [user.rosterId]: withoutStud, [opponent.rosterId]: OPPONENT_BEST }));
  assert.ok(optimal.deltaWinProb > 0, `benching a stud should cost win probability, got ${optimal.deltaWinProb}`);
  assert.ok(idsOf(optimal.yourStarters).includes(user.benchStud), 'the best lineup leaves the stud on the bench');
  assert.ok(optimal.projection > 0, 'the best lineup has no projection');
});

test('a stud on HIS bench is win probability you are currently being given', () => {
  /* Yours right, his wrong: optimising both sides has to move your price DOWN,
     which is the point of pricing both. Optimising only your own side would
     quietly bank his mistake as if it were your edge. */
  const withoutStud = OPPONENT_BEST.filter((id) => id !== opponent.benchStud);
  const optimal = optimalFor(priceWith({ [user.rosterId]: USER_BEST, [opponent.rosterId]: withoutStud }));
  assert.ok(optimal.deltaWinProb < 0, `the opponent fixing his lineup must cost you, got ${optimal.deltaWinProb}`);
  assert.ok(idsOf(optimal.opponentStarters).includes(opponent.benchStud), 'his stud was left benched');
});

test('the same league prices the same way twice', () => {
  const first = optimalFor(priceWith());
  const second = optimalFor(priceWith());
  assert.equal(first.deltaWinProb, second.deltaWinProb);
  assert.deepEqual(idsOf(first.opponentStarters), idsOf(second.opponentStarters));
});
