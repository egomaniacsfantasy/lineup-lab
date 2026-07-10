import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from '../src/server.js';
import { REASON } from '../src/status.js';

function request(server, body, path = '/login') {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = globalThis.fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body == null ? undefined : JSON.stringify(body),
      });
      req.then(resolve, reject).finally(() => server.close());
    });
  });
}

test('kill switch disables login endpoint', async () => {
  const server = await createServer({
    config: { workerEnabled: false, maxConcurrent: 1, maxQueue: 1, otpTtlMs: 1_000 },
    loginMachine: {},
  });
  const response = await request(server, {
    leagueId: '2107153357',
    season: '2026',
    email: 'a@example.com',
    password: 'NeverLogged123',
  });
  assert.equal(response.status, 503);
  const json = await response.json();
  assert.equal(json.status, 'fallback');
  assert.equal(json.reason, REASON.DISABLED);
});

test('missing fields are explicit', async () => {
  const server = await createServer({
    config: { workerEnabled: true, maxConcurrent: 1, maxQueue: 1, otpTtlMs: 1_000 },
    loginMachine: {},
  });
  const response = await request(server, { leagueId: '2107153357', season: '2026' });
  assert.equal(response.status, 400);
  const json = await response.json();
  assert.equal(json.reason, REASON.MISSING_FIELDS);
  assert.match(json.message, /email and password/i);
});

test('successful login never echoes password', async () => {
  const server = await createServer({
    config: { workerEnabled: true, maxConcurrent: 1, maxQueue: 1, otpTtlMs: 1_000 },
    loginMachine: {
      startLogin: async () => ({
        status: 'connected',
        espnS2: 'session-token',
        swid: '{abc}',
        league: { id: '2107153357', name: 'Test league' },
      }),
    },
  });
  const response = await request(server, {
    leagueId: '2107153357',
    season: '2026',
    email: 'a@example.com',
    password: 'NeverLogged123',
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.includes('NeverLogged123'), false);
  assert.match(text, /connected/);
});

test('OTP continuation routes to machine without requiring password', async () => {
  const server = await createServer({
    config: { workerEnabled: true, maxConcurrent: 1, maxQueue: 1, otpTtlMs: 1_000 },
    loginMachine: {
      continueOtp: async ({ challengeId, otp }) => ({
        status: 'connected',
        challengeId,
        otpSeen: otp,
        espnS2: 'session-token',
        swid: '{abc}',
      }),
    },
  });
  const response = await request(server, {
    leagueId: '2107153357',
    season: '2026',
    challengeId: 'challenge-1',
    otp: '123456',
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.status, 'connected');
  assert.equal(json.otpSeen, '123456');
});
