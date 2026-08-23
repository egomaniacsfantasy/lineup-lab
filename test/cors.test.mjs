import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedOrigin, corsMiddleware } from '../server/cors.js';

/**
 * The guest list on the API's door.
 *
 * This API answers with a user's league, their roster, and the ESPN session
 * that reads it. The whole value of an allowlist is what it refuses, so most of
 * these are refusals.
 */

/** Minimal Express-ish req/res so the middleware can be driven directly. */
function run(middleware, { origin, method = 'GET' } = {}) {
  const headers = {};
  let status = null;
  let ended = false;
  let nexted = false;
  const req = { method, get: (name) => (name.toLowerCase() === 'origin' ? origin : undefined) };
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    status: (code) => { status = code; return res; },
    end: () => { ended = true; },
  };
  middleware(req, res, () => { nexted = true; });
  return { headers, status, ended, nexted };
}

test('the app itself is allowed, from the web and from the phone', () => {
  assert.ok(isAllowedOrigin('https://oddsgods.net'));
  assert.ok(isAllowedOrigin('https://www.oddsgods.net'));
  /* capacitor.config.ts sets iosScheme https, so the shell reports this. */
  assert.ok(isAllowedOrigin('https://localhost'));
});

test('the internet is not allowed', () => {
  for (const origin of [
    'https://evil.com',
    'http://oddsgods.net',            // downgraded to http
    'https://oddsgods.net.evil.com',  // suffix trick
    'https://notoddsgods.net',        // prefix trick
    'https://oddsgods.net.',          // trailing dot
    'null',
    '',
    undefined,
  ]) {
    assert.equal(
      isAllowedOrigin(origin),
      false,
      `${JSON.stringify(origin)} should not be allowed`,
    );
  }
});

test('localhost is a development convenience, never a production one', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173'), false);
  assert.equal(isAllowedOrigin('http://localhost:5173', { allowLocalhost: true }), true);
  /* A remote host that merely mentions localhost is still a remote host. */
  assert.equal(isAllowedOrigin('http://localhost.evil.com', { allowLocalhost: true }), false);
});

test('a new origin can be added without shipping code', () => {
  /* The CDN site's URL does not exist until it is created, and adding it should
     not require a deploy that restarts the API. */
  const before = isAllowedOrigin('https://oddsgods-web.onrender.com');
  process.env.CORS_EXTRA_ORIGINS = 'https://oddsgods-web.onrender.com';
  try {
    assert.equal(before, false);
    assert.equal(isAllowedOrigin('https://oddsgods-web.onrender.com'), true);
  } finally {
    delete process.env.CORS_EXTRA_ORIGINS;
  }
});

test('credentials are never granted, so a mistake cannot leak a session', () => {
  const { headers } = run(corsMiddleware(), { origin: 'https://oddsgods.net' });
  assert.equal(headers['Access-Control-Allow-Credentials'], undefined);
  /* And the origin is echoed exactly, never widened to a wildcard. */
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://oddsgods.net');
  assert.notEqual(headers['Access-Control-Allow-Origin'], '*');
});

test('caches are told the answer depends on who asked', () => {
  /* Without Vary, a cache that saw oddsgods.net can hand that response to any
     other origin, which quietly undoes the allowlist. */
  const { headers } = run(corsMiddleware(), { origin: 'https://oddsgods.net' });
  assert.equal(headers.Vary, 'Origin');
});

test('every header the client sends is on the list', () => {
  const { headers } = run(corsMiddleware(), { origin: 'https://oddsgods.net' });
  const allowed = headers['Access-Control-Allow-Headers'].toLowerCase();
  /* Miss one of these and the browser drops the request with no error the user
     can see: the feature just stops. ESPN sync is two of them. */
  for (const header of [
    'content-type', 'authorization', 'x-admin-password', 'x-espn-s2',
    'x-espn-swid', 'x-olympus-overlay', 'x-owner-user-id', 'x-skip-overlay',
    'x-user-id',
  ]) {
    assert.ok(allowed.includes(header), `${header} is not allowed`);
  }
});

test('only the methods the client uses are granted', () => {
  const { headers } = run(corsMiddleware(), { origin: 'https://oddsgods.net' });
  const methods = headers['Access-Control-Allow-Methods'];
  ['GET', 'POST', 'PUT', 'OPTIONS'].forEach((m) => assert.ok(methods.includes(m)));
  assert.ok(!methods.includes('DELETE'), 'nothing sends DELETE');
});

test('a preflight is answered here, not passed to a route that would 404 it', () => {
  const ok = run(corsMiddleware(), { origin: 'https://oddsgods.net', method: 'OPTIONS' });
  assert.equal(ok.status, 204);
  assert.ok(ok.ended);
  assert.ok(!ok.nexted, 'a preflight must not reach the routes');

  const denied = run(corsMiddleware(), { origin: 'https://evil.com', method: 'OPTIONS' });
  assert.equal(denied.status, 403);
});

test('a same-origin request is untouched, which is every request today', () => {
  /* No Origin header means same-origin. Nothing should be added, and the
     request must carry on: this is how the API behaves right now and the split
     must not change it. */
  const { headers, nexted } = run(corsMiddleware(), { origin: undefined });
  assert.equal(headers['Access-Control-Allow-Origin'], undefined);
  assert.ok(nexted);
});
