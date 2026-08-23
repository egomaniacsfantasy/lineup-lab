import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeAllPlay,
  formatAllPlayRecord,
  formatLuck,
  luckSentence,
  playedWeeks,
} from '../src/utils/allPlay.ts';

/**
 * All-play is the schedule-free measure of scoring, and the gap between it and
 * the real record is what the schedule did. Both halves are easy to get subtly
 * wrong in ways that still produce plausible-looking numbers, which is what
 * these are for.
 */

/** Four teams, one week, descending scores. */
const week = (w, points) =>
  points.map((p, index) => ({ week: w, rosterId: index + 1, points: p }));

test('the top scorer beats everyone, the bottom scorer beats nobody', () => {
  const rows = computeAllPlay(week(1, [120, 110, 100, 90]), new Map());
  const byId = new Map(rows.map((r) => [r.rosterId, r]));

  assert.equal(byId.get(1).allPlayWins, 3);
  assert.equal(byId.get(1).allPlayLosses, 0);
  assert.equal(byId.get(4).allPlayWins, 0);
  assert.equal(byId.get(4).allPlayLosses, 3);

  /* Every all-play win is somebody's all-play loss. */
  const wins = rows.reduce((sum, r) => sum + r.allPlayWins, 0);
  const losses = rows.reduce((sum, r) => sum + r.allPlayLosses, 0);
  assert.equal(wins, losses, 'wins and losses must balance across the league');
});

test('the whole league averages exactly half a win a week', () => {
  const scores = [...week(1, [120, 110, 100, 90]), ...week(2, [80, 130, 95, 140])];
  const rows = computeAllPlay(scores, new Map());
  const totalExpected = rows.reduce((sum, r) => sum + r.expectedWins, 0);
  /* 4 teams, 2 weeks, one winner per real game -> 4 wins available. */
  assert.ok(
    Math.abs(totalExpected - 4) < 1e-9,
    `expected wins should sum to games played (4), got ${totalExpected}`,
  );
});

test('luck is the gap between the record you got and the one you scored for', () => {
  /* Team 3 is the classic case: third of four every week, so its scoring earns
     it exactly half its games, but head-to-head it went 2-0. */
  const scores = [...week(1, [120, 110, 100, 90]), ...week(2, [120, 110, 100, 90])];
  const rows = computeAllPlay(scores, new Map([[3, 2]]));
  const team3 = rows.find((r) => r.rosterId === 3);

  assert.equal(team3.allPlayWins, 2, 'beats only the bottom team, twice');
  assert.equal(team3.allPlayLosses, 4);
  assert.ok(Math.abs(team3.expectedWins - 2 / 3) < 1e-9);
  assert.equal(team3.actualWins, 2);
  assert.ok(team3.luck > 1.3, `should read as heavily schedule-aided, got ${team3.luck}`);
});

test('luck runs the other way too', () => {
  /* Team 2 scores second every week and lost both anyway. */
  const scores = [...week(1, [120, 110, 100, 90]), ...week(2, [120, 110, 100, 90])];
  const rows = computeAllPlay(scores, new Map([[2, 0]]));
  const team2 = rows.find((r) => r.rosterId === 2);
  assert.ok(team2.luck < -1.3, `should read as schedule-hurt, got ${team2.luck}`);
});

test('an unplayed or half-played week is not counted', () => {
  /* A future week sits in the schedule with every score at zero. Counting it
     would read as the whole league tying. */
  assert.deepEqual(playedWeeks(week(3, [0, 0, 0, 0])), []);

  /* Worse: a week in progress, where some teams have played and some have not.
     Counting it hands a perfect all-play week to whoever kicked off early. */
  assert.deepEqual(playedWeeks(week(4, [120, 0, 0, 0])), []);

  /* And a real week does count. */
  assert.deepEqual(playedWeeks(week(5, [120, 110, 100, 90])), [5]);

  /* End to end: a played week plus a future one yields one week of results. */
  const rows = computeAllPlay([...week(1, [120, 110, 100, 90]), ...week(2, [0, 0, 0, 0])], new Map());
  assert.equal(rows[0].weeksCounted, 1);
  assert.equal(rows[0].allPlayWins, 3);
});

test('a tie counts as half a win, the way a record does', () => {
  const rows = computeAllPlay(week(1, [100, 100, 90, 80]), new Map());
  const team1 = rows.find((r) => r.rosterId === 1);
  assert.equal(team1.allPlayWins, 2);
  assert.equal(team1.allPlayTies, 1);
  assert.ok(Math.abs(team1.allPlayWinPct - 2.5 / 3) < 1e-9);
});

test('no completed weeks does not divide by zero', () => {
  const rows = computeAllPlay(week(1, [0, 0, 0, 0]), new Map());
  assert.equal(rows[0].weeksCounted, 0);
  assert.equal(rows[0].expectedWins, 0);
  assert.equal(rows[0].allPlayWinPct, 0);
  assert.ok(Number.isFinite(rows[0].luck));
  assert.match(luckSentence(rows[0], 'Zeus'), /No completed weeks/);
});

test('the numbers read as English', () => {
  assert.equal(formatAllPlayRecord({ allPlayWins: 9, allPlayLosses: 2, allPlayTies: 0 }), '9-2');
  assert.equal(formatAllPlayRecord({ allPlayWins: 9, allPlayLosses: 2, allPlayTies: 1 }), '9-2-1');

  /* The sign is the entire message, so it is never dropped or rounded away. */
  assert.equal(formatLuck(1.84), '+1.8');
  assert.equal(formatLuck(-1.84), '−1.8');
  assert.equal(formatLuck(0.01), 'even');
});

test('the sentence blames the schedule, not the manager', () => {
  const scores = [...week(1, [120, 110, 100, 90]), ...week(2, [120, 110, 100, 90])];
  const rows = computeAllPlay(scores, new Map([[3, 2], [2, 0]]));
  const helped = luckSentence(rows.find((r) => r.rosterId === 3), "Zeus's Bolts");
  const hurt = luckSentence(rows.find((r) => r.rosterId === 2), 'Hermes Express');

  assert.match(helped, /schedule is worth/);
  assert.match(hurt, /schedule has cost/);
  /* Same number, two rows, and neither sentence calls anybody lucky — this
     gets screenshotted into a group chat and has to survive that. */
  for (const sentence of [helped, hurt]) {
    assert.doesNotMatch(sentence, /lucky|unlucky|deserve/i);
  }
});
