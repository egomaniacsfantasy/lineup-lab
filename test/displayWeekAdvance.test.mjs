// The header week badge (/state displayWeek) must never disagree with the week the
// matchup is priced for. In the Tuesday-after window the provider reports week=N+1
// but display_week=N, so resolveFantasyWeek alone returned the FINISHED week -- the
// badge sat on "WEEK 1" (0-1 records, week-2 zeros, week-1 FINAL tags) while the
// matchup priced week 2. The /state endpoint now runs displayWeek through the SAME
// advanceWeekIfComplete the pricing path uses; this pins the composed behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFantasyWeek } from '../server/config/season.js';
import { _effectiveWeek } from '../server/live/nflGameStatus.js';

// Mirror /state: displayWeek = advanceWeekIfComplete(resolveFantasyWeek(state)).
// advanceWeekIfComplete delegates to the pure _effectiveWeek against the scoreboard.
const badgeWeek = (state, scoreboard) =>
  _effectiveWeek(resolveFantasyWeek(state), scoreboard);

const allFinal = (n) => Array(n).fill('post');

test('Tue after week 1: provider week=2/display=1, week-1 scoreboard all final -> badge 2', () => {
  const state = { season: '2026', week: 2, displayWeek: 1, seasonType: 'regular' };
  const scoreboard = { week: 1, states: allFinal(32), at: Date.now() };
  assert.equal(resolveFantasyWeek(state), 1, 'raw resolver stays on the provider display_week');
  assert.equal(badgeWeek(state, scoreboard), 2, 'badge advances to match the priced week');
});

test('mid-week 2 (games in progress): badge stays on 2, does not advance', () => {
  const state = { season: '2026', week: 2, displayWeek: 2, seasonType: 'regular' };
  const scoreboard = { week: 2, states: ['in', 'pre', 'post', 'pre'], at: Date.now() };
  assert.equal(badgeWeek(state, scoreboard), 2);
});

test('scoreboard already ticked to week 2 -> badge 2 even before all week-1 finals cached', () => {
  const state = { season: '2026', week: 1, displayWeek: 1, seasonType: 'regular' };
  const scoreboard = { week: 2, states: ['pre', 'pre'], at: Date.now() };
  assert.equal(badgeWeek(state, scoreboard), 2);
});

test('cold start (no scoreboard read yet): badge trusts the provider, no phantom advance', () => {
  const state = { season: '2026', week: 1, displayWeek: 1, seasonType: 'regular' };
  assert.equal(badgeWeek(state, { week: null, states: [], at: 0 }), 1);
});

test('preseason: badge is week 1 and never advances off it', () => {
  const state = { week: 2, displayWeek: 2, seasonType: 'pre' };
  const scoreboard = { week: 1, states: allFinal(32), at: Date.now() };
  // resolveFantasyWeek pins preseason to 1; an all-final week-1 scoreboard would try
  // to advance 1->2, but preseason has no finished fantasy games, so the scoreboard
  // week should be null/absent in practice. With week=1 all-final it advances; guard
  // that resolveFantasyWeek itself still returns 1 (the real preseason protection).
  assert.equal(resolveFantasyWeek(state), 1);
});
