/**
 * Who is allowed to call this API from a browser.
 *
 * Today the site and the API are the same origin, so browsers never ask this
 * question and there is no CORS layer at all. Splitting the frontend onto a CDN
 * puts them on different origins, and at that moment every request from the app
 * becomes a cross-origin request that browsers block by default.
 *
 * Two deliberate choices.
 *
 * The allowlist is exact strings, never a wildcard and never a reflection of
 * whatever Origin arrived. This API serves a user's league, their roster and
 * their ESPN session; `*` would let any page on the internet read all of it
 * from their browser.
 *
 * And credentials stay OFF. Nothing in the client sends cookies (auth is a
 * bearer token in localStorage), so Access-Control-Allow-Credentials is never
 * set. That is the difference between a mistake here being a leak and a mistake
 * here being an inconvenience: without credentials, a request from an origin
 * that slipped through still carries no session.
 */

/** Origins that are always allowed. */
const ALWAYS = [
  'https://oddsgods.net',
  'https://www.oddsgods.net',
  /* The iOS shell. capacitor.config.ts sets iosScheme: 'https', so WKWebView
     serves the bundle from https://localhost and sends that as its Origin. */
  'https://localhost',
];

/**
 * The CDN site's URL is not known until it exists, and it should not need a
 * code deploy to add. CORS_EXTRA_ORIGINS is a comma-separated list.
 */
function configuredOrigins() {
  return (process.env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Vite's dev server and the preview build, local only. */
const LOCAL_DEV = /^http:\/\/localhost:\d+$/;

export function isAllowedOrigin(origin, { allowLocalhost = false } = {}) {
  if (!origin) return false;
  if (ALWAYS.includes(origin)) return true;
  if (configuredOrigins().includes(origin)) return true;
  return allowLocalhost && LOCAL_DEV.test(origin);
}

/* Every header the client actually sends, plus the two the server reads but the
   client does not send yet. A header missing from this list is not an error the
   user sees: the browser drops the request and the feature silently stops. */
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'x-admin-password',
  'x-espn-s2',
  'x-espn-swid',
  'x-olympus-overlay',
  'x-owner-user-id',
  'x-skip-overlay',
  'x-user-id',
].join(', ');

/* Only what the client uses. DELETE and PATCH are absent because nothing sends
   them, and a method nobody needs is a method nobody should be granted. */
const ALLOWED_METHODS = 'GET, POST, PUT, OPTIONS';

export function corsMiddleware({ allowLocalhost = false } = {}) {
  return (req, res, next) => {
    const origin = req.get('origin');

    if (isAllowedOrigin(origin, { allowLocalhost })) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      /* Without this, a cache that saw one origin's response can hand it to a
         page from another, which quietly defeats the allowlist. */
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    /* A preflight is the browser asking permission before the real request. It
       is answered here and never reaches a route: routes do not handle OPTIONS
       and would 404 it, which the browser reports as a CORS failure. */
    if (req.method === 'OPTIONS') {
      res.status(isAllowedOrigin(origin, { allowLocalhost }) ? 204 : 403).end();
      return;
    }

    next();
  };
}
