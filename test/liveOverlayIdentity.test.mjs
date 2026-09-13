import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeLiveOverlay } from '../server/live/liveEngine.js';

/**
 * Whose team is "you" once live mode is on.
 *
 * The live cycle prices each registered league once, for the one userId the
 * registry holds, and stores one overlay per league. Every request for that
 * league merges the same overlay. The futures it carries were built from a
 * context where `isUser` meant the REGISTRANT, and the merge used to take them
 * wholesale, so on a Sunday every other manager in the league saw somebody
 * else's team marked as theirs: in the title odds widget and across the League
 * tab, while the Hub's head-to-head (which reads identity from bootstrap) was
 * right. Two surfaces disagreeing about who you are.
 *
 * The overlay's numbers are the same for everybody. Its identity is not, and
 * must come from the request.
 */

const futuresFor = (userRosterId) =>
  [1, 2, 3, 4].map((rosterId) => ({
    rosterId,
    teamName: `Team ${rosterId}`,
    isUser: rosterId === userRosterId,
    titleProb: 10 * rosterId,
    playoffProb: 20 * rosterId,
  }));

/* The overlay was computed for the registrant, who owns roster 3. */
const overlay = {
  at: 1,
  week: 1,
  sides: {},
  futures: futuresFor(3).map((row) => ({ ...row, titleProb: row.titleProb + 1 })),
  players: { p1: { current: 4.2, projected: 18 } },
};

test('the live futures keep the requesting user as "you", not the registrant', () => {
  /* This request comes from the manager who owns roster 1. */
  const pricing = { available: true, lines: [], futures: futuresFor(1) };
  const merged = mergeLiveOverlay(pricing, overlay);

  const you = merged.futures.filter((row) => row.isUser).map((row) => row.rosterId);
  assert.deepEqual(you, [1], 'the overlay marked the registrant\'s team as this user\'s');
});

test('the live numbers still come from the overlay', () => {
  const pricing = { available: true, lines: [], futures: futuresFor(1) };
  const merged = mergeLiveOverlay(pricing, overlay);
  assert.equal(merged.futures.find((row) => row.rosterId === 2).titleProb, 21, 'live title odds were dropped');
  assert.deepEqual(merged.livePlayers, overlay.players);
});

test('a request with no team in the league is nobody, not the registrant', () => {
  /* A league opened by someone who is not a member, or before the ESPN team is
     confirmed: nobody is "you", and the overlay must not volunteer somebody. */
  const pricing = { available: true, lines: [], futures: futuresFor(null) };
  const merged = mergeLiveOverlay(pricing, overlay);
  assert.equal(merged.futures.some((row) => row.isUser), false);
});
