/**
 * Per-IP throttling for the routes anyone can reach without an account.
 *
 * The phone gate prices a real league for a stranger who has typed a username
 * and nothing else. That is the point of it, and it is also the whole of the
 * expensive path: a username lookup, a bootstrap, and a 10,000-sim pricing
 * run, none of which are behind a login. One person with a loop can occupy the
 * box that also serves everybody's board.
 *
 * A fixed window rather than a token bucket. The failure being prevented is a
 * script, not a burst of enthusiasm, and a window is a Map of counters that
 * anybody can reason about at 2am. A burst is not the problem here: the
 * pricing run is measured in seconds, so a human cannot generate one.
 *
 * IN MEMORY, and therefore per instance. If this ever runs on more than one
 * box the real limit is LIMIT x instances, which is a ceiling worth knowing
 * rather than a reason to reach for a shared store on a service with one
 * instance.
 */

const WINDOW_MS = 60_000;

/** Requests per IP per window on the unauthenticated pricing path. */
export const PRICING_LIMIT = 20;

const windows = new Map();

/** Dropped on the floor rather than grown for ever: a Map keyed by IP is a
 *  memory leak with a public entry point unless something empties it. */
function sweep(now) {
  for (const [key, entry] of windows) {
    if (now - entry.start >= WINDOW_MS) windows.delete(key);
  }
}

export function resetRateLimits() {
  windows.clear();
}

/**
 * Count one hit and say whether it is allowed.
 *
 * Exported separately from the middleware so the accounting can be tested
 * without an HTTP server, which is the only part with anything to get wrong.
 */
export function hit(key, now, limit = PRICING_LIMIT) {
  const entry = windows.get(key);
  if (!entry || now - entry.start >= WINDOW_MS) {
    windows.set(key, { start: now, count: 1 });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: WINDOW_MS - (now - entry.start),
    };
  }
  return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
}

/**
 * The client's address.
 *
 * Behind Render this is the proxy's address unless the app trusts the
 * forwarded header, which index.js sets up. Getting that wrong is worse than
 * having no limiter at all: every visitor lands in one bucket, and the first
 * twenty requests from ANYBODY lock out everybody else. That is a limiter that
 * only fires during exactly the traffic spike it was added for.
 */
function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function rateLimitPricing(limit = PRICING_LIMIT) {
  return (req, res, next) => {
    const now = Date.now();
    if (windows.size > 5_000) sweep(now);

    const result = hit(clientKey(req), now, limit);
    res.set('x-ratelimit-remaining', String(result.remaining));

    if (result.allowed) {
      next();
      return;
    }

    const seconds = Math.ceil(result.retryAfterMs / 1000);
    res.set('retry-after', String(seconds));
    res.status(429).json({
      error: 'rate_limited',
      message: `That is a lot of leagues at once. Try again in ${seconds} seconds.`,
    });
  };
}
