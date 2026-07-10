import assert from 'node:assert/strict';
import test from 'node:test';
import { LoginQueue } from '../src/queue.js';
import { REASON } from '../src/status.js';

test('queue returns backpressure instead of hanging forever', async () => {
  const queue = new LoginQueue({ maxConcurrent: 1, maxQueue: 0 });
  let release;
  const first = queue.run(() => new Promise((resolve) => {
    release = () => resolve({ ok: true });
  }));
  const second = await queue.run(() => Promise.resolve({ ok: false }));
  assert.equal(second.status, 'fallback');
  assert.equal(second.reason, REASON.QUEUE_FULL);
  release();
  assert.deepEqual(await first, { ok: true });
});
