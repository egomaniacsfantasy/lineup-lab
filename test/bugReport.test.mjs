import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeScreenshot, reportScreenshotPath } from '../server/routes/support.js';
import {
  collectDiagnostics,
  recordError,
  recordRequest,
  redactUrl,
  resetDiagnostics,
} from '../src/utils/diagnostics.ts';
import { buildBugReport } from '../src/services/bugReport.ts';

/**
 * A bug report is only worth building if it answers the questions the reporter
 * was never going to answer. These tests are mostly about two failure modes
 * that are invisible until it matters: a report that carries a secret, and a
 * report that carries nothing useful.
 */

test('a report carries the state nobody would think to type out', () => {
  resetDiagnostics();
  recordRequest({ method: 'GET', url: '/api/league/123/bootstrap', status: 502, ms: 91, at: 1 });
  recordError('error', new TypeError('x is not a function'), 'at Board.tsx:12');

  const report = buildBugReport({ description: '  my league vanished  ' });

  assert.equal(report.description, 'my league vanished', 'the description is trimmed');
  assert.equal(report.diagnostics.requests.at(-1).status, 502);
  assert.match(report.diagnostics.errors.at(-1).message, /not a function/);
  assert.ok(report.diagnostics.route, 'the page is recorded');
  assert.ok(report.diagnostics.build, 'the bundle is recorded');
});

/* The point of the recorder is the failing request. If a report only ever
   carried the description, this would still pass everything else. */
test('a report without any recorded state is visibly empty', () => {
  resetDiagnostics();
  const report = buildBugReport({ description: 'something broke' });
  assert.equal(report.diagnostics.requests.length, 0);
  assert.equal(report.diagnostics.errors.length, 0);
});

test('identifiers survive redaction, credentials do not', () => {
  /* These are what make a report reproducible and they are the reporter's own
     ids, so they must come through intact. */
  assert.match(redactUrl('/api/league/998/lines?userId=42'), /userId=42/);
  assert.match(redactUrl('/api/league/998/lines?userId=42'), /league\/998/);

  /* These are credentials. */
  for (const [param, value] of [
    ['token', 'abc123'],
    ['s2', 'AEBxyz'],
    ['swid', '{GUID}'],
    ['password', 'hunter2'],
    ['code', 'oauth-code'],
  ]) {
    const redacted = redactUrl(`/api/thing?${param}=${encodeURIComponent(value)}`);
    assert.ok(
      !redacted.includes(value),
      `${param} leaked through redaction: ${redacted}`,
    );
    assert.match(redacted, /\*\*\*/);
  }
});

test('redaction survives a URL it cannot parse', () => {
  assert.doesNotThrow(() => redactUrl('::::not a url::::?token=secret'));
  assert.ok(!redactUrl('::::not a url::::?token=secret').includes('secret'));
});

test('diagnostics never throw, whatever the page is doing', () => {
  resetDiagnostics();
  recordError('console', { circular: true });
  recordError('console', undefined);
  assert.doesNotThrow(() => collectDiagnostics());
});

test('the buffers stay bounded so a long session cannot grow without limit', () => {
  resetDiagnostics();
  for (let i = 0; i < 500; i += 1) {
    recordRequest({ method: 'GET', url: `/api/x/${i}`, status: 200, ms: 1, at: i });
    recordError('console', `error ${i}`);
  }
  const { requests, errors } = collectDiagnostics();
  assert.ok(requests.length <= 40, `requests grew to ${requests.length}`);
  assert.ok(errors.length <= 25, `errors grew to ${errors.length}`);
  /* Oldest dropped, newest kept — a buffer that kept the first 40 would be
     useless, and the length check alone would not notice. */
  assert.match(requests.at(-1).url, /499$/);
});

test('a screenshot is accepted only in the shape the capture path produces', () => {
  const jpeg = `data:image/jpeg;base64,${Buffer.from('pretend-jpeg').toString('base64')}`;
  assert.equal(decodeScreenshot(jpeg).extension, 'jpg');

  const png = `data:image/png;base64,${Buffer.from('pretend-png').toString('base64')}`;
  assert.equal(decodeScreenshot(png).extension, 'png');

  /* Anything that is not one of those two is a mistake or an attempt to get an
     arbitrary file written next to the reports. */
  assert.equal(decodeScreenshot('data:text/html;base64,PHNjcmlwdD4='), null);
  assert.equal(decodeScreenshot('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(decodeScreenshot('https://example.com/shot.jpg'), null);
  assert.equal(decodeScreenshot(''), null);
  assert.equal(decodeScreenshot(null), null);
  assert.equal(decodeScreenshot('data:image/jpeg;base64,'), null);

  /* Oversized is refused rather than written. */
  const huge = `data:image/jpeg;base64,${'A'.repeat(9 * 1024 * 1024)}`;
  assert.equal(decodeScreenshot(huge), null);
});

test('a screenshot filename cannot walk out of the reports directory', () => {
  for (const attempt of [
    '../../.env',
    '../../../etc/passwd',
    '..%2F..%2F.env',
    'not-a-report.json',
    'x.jpg',
    '',
    null,
  ]) {
    assert.equal(
      reportScreenshotPath(attempt),
      null,
      `traversal or junk accepted: ${attempt}`,
    );
  }
  /* A correctly shaped name for a file that does not exist is still null —
     the shape check alone is not treated as proof. */
  assert.equal(reportScreenshotPath('2026-08-23T20-00-00-000Z-OG-1A2B.jpg'), null);
});
