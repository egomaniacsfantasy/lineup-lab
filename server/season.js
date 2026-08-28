/**
 * Which season a request is about.
 *
 * Two bugs lived in the one-liner this replaces:
 *
 *   season: req.query.season ?? String(new Date().getUTCFullYear())
 *
 * `??` only falls back on null and undefined, and the client sends
 * `?season=` unconditionally — so a league URL with no seasonId in it, which
 * is the normal shape of one people copy out of ESPN, arrived as an empty
 * string and passed straight through. The provider then built
 * `.../seasons//segments/0/leagues/123`, ESPN answered 404, and a perfectly
 * public league was reported to its owner as unreachable.
 *
 * And the fallback was the calendar year. A fantasy season runs from
 * September into the following January, so every January the default points
 * at a season ESPN has no data for yet, and the whole app would fail to
 * connect anything until March.
 */

/** ESPN and Sleeper both name a season by the September it starts in. */
export function currentFantasySeason(now = new Date()) {
  const year = now.getUTCFullYear();
  /* Months are zero-based: 0-5 is January through June, which is the tail of
     the previous season (playoffs, and the long offseason before the next
     league year opens). July onward belongs to the season about to start. */
  return now.getUTCMonth() <= 5 ? year - 1 : year;
}

/**
 * A season from a query string, or the current one.
 *
 * Anything that is not a four-digit year is treated as absent rather than
 * forwarded. A season is going straight into a provider URL path, so a blank
 * or malformed one does not fail loudly; it silently builds a URL for a
 * league that cannot exist.
 */
export function seasonParam(raw, now = new Date()) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  return String(currentFantasySeason(now));
}
