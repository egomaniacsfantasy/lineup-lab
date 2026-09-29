import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { weekMovement } from '../src/utils/openAnchors.ts';
import { firstKickoff, lastSnapshotBefore, weekGlance } from '../src/utils/weekGlance.ts';

/**
 * The week at a glance reads each game's pregame line, not the board's.
 *
 * Reported on a Monday night: the glance's "biggest favorite" was a team that
 * had already won, printed as a check, and its "closest line" was -313. Both
 * were true of the board. The board is live, and once somebody in a game
 * kicks off the engine pins whoever has played to his real score, so a
 * started game's price is the scoreboard. A summary of the week's MARKET has
 * to read a started game at its close: the last snapshot before anybody in it
 * kicked off.
 *
 * The fixture below is that Monday. Three games started on Sunday, and every
 * snapshot taken after 1pm carries Sunday's scores. The live board is what
 * the old reductions read; each test says what the glance must read instead.
 */

const WEEK = 4;
const HOUR = 3_600_000;
const TUESDAY = Date.parse('2026-09-22T14:00:00Z');
const THURSDAY_KICKOFF = Date.parse('2026-09-25T00:15:00Z');
const SUNDAY_KICKOFF = Date.parse('2026-09-27T17:00:00Z');
const MONDAY_KICKOFF = Date.parse('2026-09-29T00:15:00Z');

/** The board's own no-vig conversion, so a fixture price is the price the engine would post. */
function moneyline(winProbability) {
  const p = winProbability / 100;
  return p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

function side(winProbability, projection) {
  return projection == null
    ? { moneyline: moneyline(winProbability), winProbability }
    : { moneyline: moneyline(winProbability), winProbability, projection };
}

/** One game in one snapshot: team A's probability, and both projections. */
function line(a, b, aProb, aProj, bProj) {
  return {
    [String(a)]: side(aProb, aProj),
    [String(b)]: side(Number((100 - aProb).toFixed(1)), bProj),
  };
}

function snap(computedAt, lines, week = WEEK) {
  return {
    computedAt,
    week,
    lines: Object.entries(lines).map(([matchupId, sides]) => ({ matchupId: Number(matchupId), sides })),
  };
}

/** A game as the live board has it right now. */
function boardGame({ id, a, b, aProb, total, user = null }) {
  const bProb = Number((100 - aProb).toFixed(1));
  return {
    matchupId: id,
    teamARosterId: a,
    teamA: `Team ${a}`,
    teamARecord: '2-1',
    teamAOdds: moneyline(aProb),
    teamAWinProb: aProb,
    teamAIsUser: user === 'a',
    teamBRosterId: b,
    teamB: `Team ${b}`,
    teamBRecord: '1-2',
    teamBOdds: moneyline(bProb),
    teamBWinProb: bProb,
    teamBIsUser: user === 'b',
    totalProjection: total,
    isUserGame: user != null,
  };
}

/* Monday night. Game 1 is decided (team 1 has won), game 2 is a blowout in
   progress at -313, game 3 carries a live total swollen by Sunday's scoring.
   Game 4 is the Monday game, still to kick off. */
const board = {
  decided: boardGame({ id: 1, a: 1, b: 2, aProb: 99.9, total: 251.7 }),
  blowout: boardGame({ id: 2, a: 3, b: 4, aProb: 75.8, total: 262.0 }),
  swollen: boardGame({ id: 3, a: 5, b: 6, aProb: 88.0, total: 268.5 }),
  monday: boardGame({ id: 4, a: 7, b: 8, aProb: 71.5, total: 259.1 }),
};

const history = [
  snap(TUESDAY, {
    1: line(1, 2, 58.0, 128.0, 120.0),
    2: line(3, 4, 55.0, 130.0, 126.0),
    3: line(5, 6, 60.0, 125.0, 118.0),
    4: line(7, 8, 60.0, 131.0, 124.0),
  }),
  /* The close for the three Sunday games: two hours before kickoff. */
  snap(SUNDAY_KICKOFF - 2 * HOUR, {
    1: line(1, 2, 64.0, 130.1, 118.0),
    2: line(3, 4, 51.2, 121.0, 120.1),
    3: line(5, 6, 57.0, 124.0, 120.1),
    4: line(7, 8, 71.5, 137.2, 121.9),
  }),
  /* Everything from here on has Sunday's scores pinned into it. */
  snap(SUNDAY_KICKOFF + 5 * HOUR, {
    1: line(1, 2, 97.0, 150.2, 101.3),
    2: line(3, 4, 75.8, 139.9, 118.4),
    3: line(5, 6, 88.0, 148.8, 119.7),
    4: line(7, 8, 71.5, 137.2, 121.9),
  }),
  snap(SUNDAY_KICKOFF + 17 * HOUR, {
    1: line(1, 2, 99.9, 151.0, 100.7),
    2: line(3, 4, 75.8, 139.9, 118.4),
    3: line(5, 6, 88.0, 148.8, 119.7),
    4: line(7, 8, 71.5, 137.2, 121.9),
  }),
];

const sundayGames = [board.decided, board.blowout, board.swollen].map((matchup) => ({
  matchup,
  kickoffAt: SUNDAY_KICKOFF,
  started: true,
}));
const mondayGame = { matchup: board.monday, kickoffAt: MONDAY_KICKOFF, started: false };

test('a game that has kicked off is read at its closing line, not the board', () => {
  const glance = weekGlance({ games: sundayGames, history, week: WEEK });

  /* The decided game is still the biggest favourite, but at the price it
     closed at before a snap was played, not at a check. */
  assert.equal(glance.biggestFavorite?.favorite.rosterId, 1);
  assert.equal(glance.biggestFavorite?.favorite.winProb, 64.0);
  assert.equal(glance.biggestFavorite?.favorite.odds, moneyline(64.0));
  assert.equal(glance.biggestFavorite?.underdog.rosterId, 2);

  /* The closest line is the game that CLOSED closest, which on the board is
     the -313 blowout. */
  assert.equal(glance.closestLine?.left.rosterId, 3);
  assert.equal(glance.closestLine?.favorite.odds, moneyline(51.2));
  assert.notEqual(glance.closestLine?.favorite.odds, board.blowout.teamAOdds);

  /* The highest total is the highest total posted, not the one Sunday
     inflated: 130.1 + 118.0 closed above 124.0 + 120.1 and 121.0 + 120.1. */
  assert.equal(glance.highestTotal?.left.rosterId, 1);
  assert.equal(glance.highestTotal?.total, 248.1);

  /* And the biggest move stops at kickoff: 58 to 64 before the game, not 58
     to 99.9 after it. */
  assert.equal(glance.biggestMove?.left.rosterId, 1);
  assert.ok(Math.abs((glance.biggestMove?.move ?? 0) - 6.0) < 1e-9, `got ${glance.biggestMove?.move}`);

  assert.equal(glance.kickedOff, 'all');
});

test('a game that has not started reads the board, and its move is the one on its card', () => {
  const glance = weekGlance({ games: [...sundayGames, mondayGame], history, week: WEEK });

  /* The Monday game is still open, so its price is the board's own. */
  assert.equal(glance.biggestFavorite?.status, 'open');
  assert.equal(glance.biggestFavorite?.favorite.rosterId, 7);
  assert.equal(glance.biggestFavorite?.favorite.odds, board.monday.teamAOdds);

  /* 60 to 71.5 is the week's biggest pregame move, bigger than the decided
     game's 58 to 64. And it is exactly the move the card draws its arrow
     from, which is what lets the glance point at a card: weekMovement is the
     board's own reader. */
  assert.equal(glance.biggestMove?.left.rosterId, 7);
  const onCard = weekMovement(history, WEEK).find((move) => move.matchupId === 4 && move.rosterId === '7');
  assert.ok(onCard, 'the board has no move for the Monday game');
  assert.equal(glance.biggestMove?.move, onCard.movePp);

  /* The board's reader, asked about the decided game, reports the scoreboard.
     That is why the started games cannot be read through it. */
  const decidedOnCard = weekMovement(history, WEEK).find((move) => move.matchupId === 1 && move.rosterId === '1');
  assert.ok((decidedOnCard?.movePp ?? 0) > 40, 'the fixture no longer carries a scoreboard move');

  assert.equal(glance.kickedOff, 'some');
});

test('before the first kickoff the glance is the board', () => {
  const games = Object.values(board).map((matchup) => ({ matchup, kickoffAt: MONDAY_KICKOFF, started: false }));
  const glance = weekGlance({ games, history, week: WEEK });

  /* Every game open: the same four reductions the board used to run. */
  assert.equal(glance.kickedOff, 'none');
  assert.equal(glance.biggestFavorite?.favorite.odds, board.decided.teamAOdds);
  assert.equal(glance.closestLine?.favorite.odds, board.monday.teamAOdds);
  assert.equal(glance.highestTotal?.total, board.swollen.totalProjection);
});

test('the close is the last snapshot strictly before the first kickoff', () => {
  const atKickoff = snap(SUNDAY_KICKOFF, { 2: line(3, 4, 66.6, 131.0, 124.0) });
  const withStamp = [...history, atKickoff];

  /* A snapshot stamped at the kickoff itself may already hold the first
     scores. The close is the one before it. */
  assert.equal(lastSnapshotBefore(withStamp, WEEK, SUNDAY_KICKOFF)?.computedAt, SUNDAY_KICKOFF - 2 * HOUR);
  const glance = weekGlance({
    games: [{ matchup: board.blowout, kickoffAt: SUNDAY_KICKOFF, started: true }],
    history: withStamp,
    week: WEEK,
  });
  assert.equal(glance.closestLine?.favorite.winProb, 51.2);

  /* Another week's snapshots never close this one, however recent. */
  const nextWeek = snap(SUNDAY_KICKOFF - HOUR, { 2: line(3, 4, 90.0, 140.0, 100.0) }, WEEK + 1);
  assert.equal(lastSnapshotBefore([...history, nextWeek], WEEK, SUNDAY_KICKOFF)?.computedAt, SUNDAY_KICKOFF - 2 * HOUR);

  /* A Thursday starter on either side closes the whole game on Thursday,
     which reads the Tuesday line even though Sunday morning's is later. */
  const thursday = weekGlance({
    games: [{ matchup: board.blowout, kickoffAt: THURSDAY_KICKOFF, started: true }],
    history,
    week: WEEK,
  });
  assert.equal(thursday.closestLine?.favorite.winProb, 55.0);
});

test('a started game with no close on record sits out, and the live number never stands in', () => {
  /* Connected at halftime: every snapshot is after kickoff. */
  const lateHistory = history.filter((entry) => entry.computedAt > SUNDAY_KICKOFF);
  const late = weekGlance({ games: sundayGames, history: lateHistory, week: WEEK });
  assert.equal(late.biggestFavorite, null);
  assert.equal(late.closestLine, null);
  assert.equal(late.highestTotal, null);
  assert.equal(late.biggestMove, null);
  assert.equal(late.kickedOff, 'all');

  /* Started, and nobody knows when: the schedule never arrived. */
  const unknown = weekGlance({
    games: [{ matchup: board.decided, kickoffAt: null, started: true }, mondayGame],
    history,
    week: WEEK,
  });
  assert.equal(unknown.biggestFavorite?.favorite.rosterId, 7);
  assert.notEqual(unknown.closestLine?.left.rosterId, 1);

  /* A close that did not price this game cannot speak for it. */
  const partial = [snap(SUNDAY_KICKOFF - HOUR, { 1: { '1': side(64.0, 130.1) } })];
  const onlyOneSide = weekGlance({
    games: [{ matchup: board.decided, kickoffAt: SUNDAY_KICKOFF, started: true }],
    history: partial,
    week: WEEK,
  });
  assert.equal(onlyOneSide.biggestFavorite, null);
});

test('the seats follow the pregame numbers, and your own game still seats you first', () => {
  /* The underdog is winning: the board seats him left because he is the live
     favourite. The glance is about the close, where he was the dog. */
  const upset = boardGame({ id: 2, a: 3, b: 4, aProb: 20.0, total: 250.0 });
  const glance = weekGlance({
    games: [{ matchup: upset, kickoffAt: SUNDAY_KICKOFF, started: true }],
    history,
    week: WEEK,
  });
  assert.equal(glance.biggestFavorite?.favorite.rosterId, 3);
  assert.equal(glance.closestLine?.left.rosterId, 3);
  /* So the move reported is team 3's own, 55 to 51.2, not team 4's mirror. */
  assert.ok(Math.abs((glance.biggestMove?.move ?? 0) + 3.8) < 1e-9, `got ${glance.biggestMove?.move}`);

  /* Your game reads left to right with you first, whoever closed favoured. */
  const yours = boardGame({ id: 2, a: 3, b: 4, aProb: 75.8, total: 262.0, user: 'b' });
  const mine = weekGlance({
    games: [{ matchup: yours, kickoffAt: SUNDAY_KICKOFF, started: true }],
    history,
    week: WEEK,
  });
  assert.equal(mine.closestLine?.left.rosterId, 4);
  assert.equal(mine.closestLine?.left.isUser, true);
  assert.equal(mine.biggestFavorite?.favorite.rosterId, 3);
});

test('the closing total is the two posted projections, and a snapshot without them has none', () => {
  /* Sums of one-decimal numbers are not one-decimal numbers in floating
     point: 120.1 + 110.2 is 230.29999999999998. */
  const odd = [snap(SUNDAY_KICKOFF - HOUR, { 1: line(1, 2, 64.0, 120.1, 110.2) })];
  const summed = weekGlance({
    games: [{ matchup: board.decided, kickoffAt: SUNDAY_KICKOFF, started: true }],
    history: odd,
    week: WEEK,
  });
  assert.equal(summed.highestTotal?.total, 230.3);

  /* Snapshots from before projections were stored: a price, but no total. A
     missing total is not a zero, and the card goes rather than print one. */
  const bare = [snap(SUNDAY_KICKOFF - HOUR, { 1: line(1, 2, 64.0, null, null) })];
  const noTotal = weekGlance({
    games: [{ matchup: board.decided, kickoffAt: SUNDAY_KICKOFF, started: true }],
    history: bare,
    week: WEEK,
  });
  assert.equal(noTotal.biggestFavorite?.favorite.winProb, 64.0);
  assert.equal(noTotal.highestTotal, null);
});

test('with line movement switched off the glance reports no move', () => {
  const glance = weekGlance({ games: sundayGames, history, week: WEEK, movement: false });
  assert.equal(glance.biggestMove, null);
  assert.equal(glance.biggestFavorite?.favorite.winProb, 64.0);
});

test('the first kickoff is the earliest known one across both lineups', () => {
  const kickoffs = new Map([
    ['PHI', { kickoffIso: new Date(SUNDAY_KICKOFF).toISOString() }],
    ['DAL', { kickoffIso: new Date(THURSDAY_KICKOFF).toISOString() }],
    ['NYG', { kickoffIso: 'not a date' }],
  ]);
  const starters = [
    { team: 'phi' },
    /* An empty slot, a free agent, a team on bye and a malformed kickoff:
       none of them has a kickoff, and none may invent one. */
    { team: null },
    {},
    { team: 'KC' },
    { team: 'NYG' },
    { team: 'DAL' },
  ];
  assert.equal(firstKickoff(starters, kickoffs), THURSDAY_KICKOFF);
  assert.equal(firstKickoff(starters.slice(0, 5), kickoffs), SUNDAY_KICKOFF);
  assert.equal(firstKickoff([{ team: 'KC' }, { team: null }], kickoffs), null);
});

test('the League page hands the board its kickoff times', async () => {
  /* The rule is only as good as its kickoffs, and the prop is optional,
     because the demo board and most fixtures have no schedule behind them.
     So dropping it from the one page that does would typecheck, pass every
     rendered test (the kickoff fixture hands the board its own), and quietly
     put the live board back in the glance. */
  const source = await fs.readFile(path.resolve('src/pages/LeaguePage.tsx'), 'utf8');
  assert.match(
    source,
    /<MatchupSlate\b[\s\S]*?kickoffs=\{nflSchedule\.status === 'ready' \? nflSchedule\.byTeam : null\}/,
    'the League page no longer passes the week\'s kickoffs to the board',
  );
  assert.match(source, /const nflSchedule = useNflSchedule\(/);
});
