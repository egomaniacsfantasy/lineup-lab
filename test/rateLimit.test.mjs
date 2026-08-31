import assert from 'node:assert/strict';
import test from 'node:test';
import { PRICING_LIMIT, hit, resetRateLimits } from '../server/rateLimit.js';

/**
 * The accounting only. The middleware around it is three lines of Express;
 * the part with something to get wrong is the window arithmetic.
 */

const T0 = 1_700_000_000_000;
const MINUTE = 60_000;

test('a visitor gets the whole allowance before being refused', () => {
  resetRateLimits();
  for (let i = 0; i < PRICING_LIMIT; i += 1) {
    assert.equal(hit('1.1.1.1', T0).allowed, true, `request ${i + 1} should be allowed`);
  }
  assert.equal(hit('1.1.1.1', T0).allowed, false, 'the one past the limit should be refused');
});

test('the window rolls, so a refusal is temporary', () => {
  resetRateLimits();
  for (let i = 0; i <= PRICING_LIMIT; i += 1) hit('2.2.2.2', T0);
  assert.equal(hit('2.2.2.2', T0).allowed, false);
  assert.equal(hit('2.2.2.2', T0 + MINUTE).allowed, true, 'a new window starts clean');
});

test('one visitor cannot lock out another', () => {
  // The failure this guards is a wrong key: with req.ip resolving to the proxy
  // for everybody, one script would refuse the entire internet.
  resetRateLimits();
  for (let i = 0; i <= PRICING_LIMIT * 3; i += 1) hit('3.3.3.3', T0);
  assert.equal(hit('3.3.3.3', T0).allowed, false);
  assert.equal(hit('4.4.4.4', T0).allowed, true, 'a different address has its own allowance');
});

test('retry-after counts down inside the window rather than resetting', () => {
  resetRateLimits();
  for (let i = 0; i <= PRICING_LIMIT; i += 1) hit('5.5.5.5', T0);
  const early = hit('5.5.5.5', T0 + 10_000).retryAfterMs;
  const later = hit('5.5.5.5', T0 + 40_000).retryAfterMs;
  assert.ok(early > later, `expected the wait to shrink: ${early} then ${later}`);
  assert.ok(later > 0 && later <= MINUTE);
});

test('a hammered address does not extend its own penalty for ever', () => {
  // A fixed window, not a sliding one: requests during the penalty must not
  // push the reset further out, or a retry loop locks itself out permanently.
  resetRateLimits();
  for (let i = 0; i <= PRICING_LIMIT; i += 1) hit('6.6.6.6', T0);
  for (let t = 0; t < MINUTE; t += 5_000) hit('6.6.6.6', T0 + t);
  assert.equal(hit('6.6.6.6', T0 + MINUTE).allowed, true, 'the window still expires on time');
});
