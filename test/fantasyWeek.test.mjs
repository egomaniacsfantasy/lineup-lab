import assert from 'node:assert/strict';
import test from 'node:test';
import { isPreseason, resolveFantasyWeek } from '../server/config/season.js';

/**
 * The NFL's week is not the fantasy week.
 *
 * Sleeper's /state/nfl answers the NFL's own week, and through August that is
 * a preseason week. On 18 August 2026 it returned week 2, season_type "pre".
 * That number was being used to index the league's schedule, so the hub priced
 * fantasy week 2 while fantasy week 1 had not been played, the head-to-head
 * card showed a matchup a week ahead of the one that counts, and the title
 * odds chart drew a decline across two weeks nobody had played.
 */

test('preseason prices week 1, whatever the NFL calls it', () => {
  assert.equal(resolveFantasyWeek({ week: 2, seasonType: 'pre' }), 1);
  assert.equal(resolveFantasyWeek({ week: 4, seasonType: 'pre' }), 1);
  assert.equal(resolveFantasyWeek({ displayWeek: 3, week: 3, seasonType: 'pre' }), 1);
});

test('the off-season also prices week 1', () => {
  assert.equal(resolveFantasyWeek({ week: 0, seasonType: 'off' }), 1);
  assert.equal(resolveFantasyWeek({}), 1);
});

test('the regular season indexes normally', () => {
  assert.equal(resolveFantasyWeek({ displayWeek: 5, week: 5, seasonType: 'regular' }), 5);
  assert.equal(resolveFantasyWeek({ week: 1, seasonType: 'regular' }), 1);
});

test('a week can never fall outside the schedule', () => {
  assert.equal(resolveFantasyWeek({ week: 99, seasonType: 'regular' }), 18);
  assert.equal(resolveFantasyWeek({ week: -3, seasonType: 'regular' }), 1);
});

test('snake_case from the raw provider payload is read too', () => {
  assert.equal(resolveFantasyWeek({ week: 2, season_type: 'pre' }), 1);
  assert.equal(resolveFantasyWeek({ week: 6, season_type: 'regular' }), 6);
});

test('preseason is flagged so the app can say so rather than guess', () => {
  assert.equal(isPreseason({ seasonType: 'pre' }), true);
  assert.equal(isPreseason({ seasonType: 'off' }), true);
  assert.equal(isPreseason({ seasonType: 'regular' }), false);
  assert.equal(isPreseason({ seasonType: 'post' }), false);
});
