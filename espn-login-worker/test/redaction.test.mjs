import assert from 'node:assert/strict';
import test from 'node:test';
import { redact, safeLog } from '../src/redaction.js';

test('redacts password and ESPN session-shaped fields', () => {
  assert.deepEqual(
    redact({
      email: 'user@example.com',
      password: 'NeverLogged123',
      cookie: 'espn_s2=abc123; SWID={xyz}',
      nested: { swid: '{abc}' },
    }),
    {
      email: 'user@example.com',
      password: '[redacted]',
      cookie: '[redacted]',
      nested: { swid: '[redacted]' },
    },
  );
});

test('safeLog does not pass password through', () => {
  const calls = [];
  const logger = {
    info(message, meta) {
      calls.push({ message, meta });
    },
  };
  safeLog(logger, 'info', 'attempt', {
    leagueId: '1',
    password: 'NeverLogged123',
  });
  assert.equal(JSON.stringify(calls).includes('NeverLogged123'), false);
  assert.equal(calls[0].meta.password, '[redacted]');
});
