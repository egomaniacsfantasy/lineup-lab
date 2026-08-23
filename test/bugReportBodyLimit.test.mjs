import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The bug that made this file exist.
 *
 * `app.use(express.json())` was mounted app-wide ahead of the support router.
 * An app-wide parser reads and rejects the body before Express has chosen a
 * route, so the 6MB limit the support router declares for itself was never
 * consulted — the 100KB default won every time. Every bug report carrying a
 * screenshot is over 100KB, so the feature would have failed on precisely the
 * reports worth having, and passed every hand test done with a small payload.
 *
 * Nothing about the source reveals this: both mounts look correct in
 * isolation. Only a body over 100KB going through the real server shows it, so
 * that is what this does.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8817;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForHealth(deadlineMs = 30_000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

test('a report with a real screenshot is not rejected by a body limit', async (t) => {
  const server = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  t.after(() => server.kill());

  if (!(await waitForHealth())) {
    assert.fail(`server did not come up on ${PORT}`);
  }

  /* ~400KB of base64 — what a 1600px-wide JPEG of a dark UI actually weighs,
     and four times over the default limit that used to eat it. */
  const screenshot = `data:image/jpeg;base64,${'A'.repeat(400_000)}`;

  const response = await fetch(`${BASE}/api/support/bug-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: 'a report with a picture', screenshot }),
  });

  assert.equal(
    response.status,
    200,
    'a 400KB report was refused — the app-wide body parser is ahead of the support router again',
  );
  const body = await response.json();
  assert.match(body.reference, /^OG-[0-9A-F]{4}$/);

  /* And the limit that IS meant to bite still bites, with a message the
     reporter can act on rather than a generic 500. */
  const huge = await fetch(`${BASE}/api/support/bug-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'too big',
      screenshot: `data:image/jpeg;base64,${'A'.repeat(8_000_000)}`,
    }),
  });
  assert.equal(huge.status, 413, 'an oversized body should be 413, not a 500');

  /* Routes below the shared parser must still get their bodies parsed — the
     reordering could plausibly have broken every other POST in the app. */
  const telemetry = await fetch(`${BASE}/api/telemetry/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ area: 'test', event: 'ping', at: 0 }),
  });
  assert.equal(telemetry.status, 200, 'the shared json parser stopped working');
});
