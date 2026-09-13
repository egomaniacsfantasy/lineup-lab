import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anyStarted,
  gameTagFor,
  hasKickedOff,
  primaryNumber,
  scorelineFor,
  teamScored,
} from '../src/utils/liveScoreline.ts';

/**
 * Whether a lineup number is a projection or a score, and what the row says
 * about the player's game.
 *
 * The defect behind it: during a live game a row showed the projected final as
 * its big number and points scored as a small "X now" beneath it, in the same
 * face. "20.9 / 0.1 now" was read as twenty points scored, and nothing on the
 * row said whether a game was on, over, or yet to start.
 *
 * The game-state shapes below are copied from ESPN's scoreboard during week 1.
 */

const KICKOFF = '2026-09-13T17:00:00Z';
const BEFORE = Date.parse('2026-09-13T16:59:00Z');
const AFTER = Date.parse('2026-09-13T17:01:00Z');

const PRE = { state: 'pre', period: null, clock: '0:00', detail: '9/13 - 8:20 PM EDT' };
const Q1 = { state: 'in', period: 1, clock: '4:29', detail: '4:29 - 1st' };
const OT = { state: 'in', period: 5, clock: '2:00', detail: '2:00 - OT' };
const HALF = { state: 'in', period: 2, clock: '0:00', detail: 'Halftime' };
const END_Q3 = { state: 'in', period: 3, clock: '0:00', detail: 'End of 3rd' };
const FINAL = { state: 'post', period: 4, clock: '0:00', detail: 'Final' };
const FINAL_OT = { state: 'post', period: 5, clock: '0:00', detail: 'Final/OT' };

const line = (overrides) =>
  scorelineFor({ kickoffIso: KICKOFF, bye: false, currentPoints: null, game: null, ...overrides }, AFTER);

test('before his game, the big number is the projection', () => {
  const upcoming = line({ game: PRE });
  assert.equal(upcoming.phase, 'upcoming');
  assert.equal(primaryNumber(upcoming, '20.9'), '20.9', 'a player yet to play must lead with his projection');
  assert.equal(gameTagFor(upcoming.phase, PRE), null, 'the kickoff time already says when; no tag');
});

test('once his game is live, points scored overtake the projection', () => {
  const live = line({ game: Q1, currentPoints: 6.4 });
  assert.equal(live.phase, 'live');
  assert.equal(primaryNumber(live, '20.9'), '6.4', 'the big number must be the score, not the projection');
});

test('a live player on zero shows 0.0, because it is a score', () => {
  const blanked = line({ game: Q1, currentPoints: null });
  assert.equal(primaryNumber(blanked, '20.9'), '0.0');
});

test('each player follows his own game, so a lineup can mix phases', () => {
  const finished = line({ game: FINAL, currentPoints: 18.2 });
  const waiting = line({ game: PRE });
  assert.equal(primaryNumber(finished, '20.9'), '18.2');
  assert.equal(primaryNumber(waiting, '14.1'), '14.1');
  assert.equal(anyStarted([finished, waiting]), true);
});

test('the live tag carries the quarter and clock', () => {
  assert.equal(gameTagFor('live', Q1), 'Q1 4:29');
  assert.equal(gameTagFor('live', OT), 'OT 2:00');
  assert.equal(gameTagFor('live', HALF), 'Half');
  assert.equal(gameTagFor('live', END_Q3), 'End Q3');
  assert.equal(gameTagFor('live', null), 'Live', 'a live game with no clock still says it is live');
});

test('a finished game says so, including overtime', () => {
  assert.equal(line({ game: FINAL }).phase, 'final');
  assert.equal(gameTagFor('final', FINAL), 'Final');
  assert.equal(gameTagFor('final', FINAL_OT), 'Final/OT');
});

test('without a scoreboard, a passed kickoff or points still start the row', () => {
  assert.equal(line({}).phase, 'started', 'kickoff has passed');
  assert.equal(
    scorelineFor({ kickoffIso: KICKOFF, bye: false, currentPoints: null, game: null }, BEFORE).phase,
    'upcoming',
  );
  assert.equal(
    scorelineFor({ kickoffIso: null, bye: false, currentPoints: 12.1, game: null }, AFTER).phase,
    'started',
    'points on the board prove a game even when the schedule did not load',
  );
  assert.equal(gameTagFor('started', null), 'Started', 'it can say started without claiming live or final');
});

test('a stale "pre" read does not hide points that are on the board', () => {
  assert.equal(line({ game: PRE, currentPoints: 3.0 }).started, true);
});

test('a bye never kicks off', () => {
  const bye = line({ bye: true, game: FINAL });
  assert.equal(bye.started, false);
  assert.equal(bye.scored, null);
});

test('hasKickedOff reads the clock and nothing else', () => {
  assert.equal(hasKickedOff(KICKOFF, BEFORE), false);
  assert.equal(hasKickedOff(KICKOFF, AFTER), true);
  assert.equal(hasKickedOff(null, AFTER), false);
  assert.equal(hasKickedOff('not a date', AFTER), false);
});

test('a team score is null before anybody plays, then sums what was scored', () => {
  const lines = [
    line({ game: FINAL, currentPoints: 10.2 }),
    line({ game: Q1, currentPoints: 4.1 }),
    line({ game: PRE }),
  ];
  assert.equal(teamScored(lines, false), null);
  assert.equal(teamScored(lines, true), 14.3);
});
