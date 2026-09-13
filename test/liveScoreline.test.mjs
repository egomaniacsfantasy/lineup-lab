import assert from 'node:assert/strict';
import test from 'node:test';
import { hasKickedOff, scoreModeFor, scorelineFor, teamScored } from '../src/utils/liveScoreline.ts';

/**
 * The rule that decides whether a lineup number is a score or a projection.
 *
 * The defect this guards: during a live game a row showed the projected final
 * as its big number and points scored as a small "X now" beneath it, in the
 * same face. "20.9 / 0.1 now" was read as twenty points scored.
 */

const KICKOFF = '2026-09-13T17:00:00Z';
const BEFORE = Date.parse('2026-09-13T16:59:00Z');
const AFTER = Date.parse('2026-09-13T17:01:00Z');

test('a player is not started before his kickoff, and is after it', () => {
  assert.equal(hasKickedOff(KICKOFF, BEFORE), false);
  assert.equal(hasKickedOff(KICKOFF, AFTER), true);
  assert.equal(hasKickedOff(null, AFTER), false, 'no schedule is not a kickoff');
  assert.equal(hasKickedOff('not a date', AFTER), false);
});

test('before any kickoff the whole matchup stays in projection mode', () => {
  const lines = [
    scorelineFor({ kickoffIso: KICKOFF, bye: false, currentPoints: null }, BEFORE),
    scorelineFor({ kickoffIso: KICKOFF, bye: false, currentPoints: null }, BEFORE),
  ];
  assert.equal(scoreModeFor(lines), 'projection');
  assert.equal(teamScored(lines, 'projection'), null, 'no score is reported before a game');
});

test('one kickoff puts the whole matchup in scoreboard mode', () => {
  const started = scorelineFor({ kickoffIso: KICKOFF, bye: false, currentPoints: 6.4 }, AFTER);
  const waiting = scorelineFor({ kickoffIso: '2026-09-13T20:25:00Z', bye: false, currentPoints: null }, AFTER);
  assert.equal(scoreModeFor([started, waiting]), 'scoreboard');
  assert.equal(started.scored, 6.4, 'the big number is points scored, not the projection');
});

test('a player who has not kicked off has no score, not a zero', () => {
  const waiting = scorelineFor({ kickoffIso: '2026-09-13T20:25:00Z', bye: false, currentPoints: null }, AFTER);
  assert.equal(waiting.started, false);
  assert.equal(waiting.scored, null, '0.0 is a score; an unplayed player must render a dash');
});

test('a player under way with no points has scored zero, and it prints', () => {
  /* The adapter folds a feed value of 0 into null. Once the game has started
     that null is a real zero, and dropping it would render a dash for a player
     who is on the field. */
  const blanked = scorelineFor({ kickoffIso: KICKOFF, bye: false, currentPoints: null }, AFTER);
  assert.equal(blanked.started, true);
  assert.equal(blanked.scored, 0);
});

test('points on the board prove a game even when the schedule did not load', () => {
  const line = scorelineFor({ kickoffIso: null, bye: false, currentPoints: 12.1 }, AFTER);
  assert.equal(line.started, true);
  assert.equal(line.scored, 12.1);
  assert.equal(scoreModeFor([line]), 'scoreboard');
});

test('a bye never kicks off', () => {
  const bye = scorelineFor({ kickoffIso: KICKOFF, bye: true, currentPoints: null }, AFTER);
  assert.equal(bye.started, false);
  assert.equal(bye.scored, null);
});

test('a team score counts only what has been scored', () => {
  const lines = [
    scorelineFor({ kickoffIso: KICKOFF, bye: false, currentPoints: 10.2 }, AFTER),
    scorelineFor({ kickoffIso: KICKOFF, bye: false, currentPoints: 4.1 }, AFTER),
    scorelineFor({ kickoffIso: '2026-09-13T20:25:00Z', bye: false, currentPoints: null }, AFTER),
  ];
  assert.equal(teamScored(lines, 'scoreboard'), 14.3);
});

test('a side nobody has played for yet still reads zero once the game is on', () => {
  /* On the League board each card's mode is decided across both sides, so the
     team still waiting on its players shows 0.0 beside the other side's score
     rather than no score at all. */
  const waiting = [scorelineFor({ kickoffIso: null, bye: false, currentPoints: null }, AFTER)];
  assert.equal(teamScored(waiting, 'scoreboard'), 0);
});
