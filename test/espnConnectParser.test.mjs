import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildEspnLaunchCode,
  espnSessionPasteError,
  parseEspnLeagueInput,
  parseEspnSessionPaste,
} from '../src/utils/espnConnect.js';

test('parses ESPN URL leagueId without concatenating other params', () => {
  assert.deepEqual(
    parseEspnLeagueInput('https://fantasy.espn.com/football/team?leagueId=2107153357&teamId=1&seasonId=2026'),
    { leagueId: '2107153357', season: '2026' },
  );
});

test('falls back to longest standalone digit run only for loose text', () => {
  assert.deepEqual(
    parseEspnLeagueInput('league 2107153357 team 1 season 2026'),
    { leagueId: '2107153357', season: '' },
  );
});

test('parses full ESPN login capture in any order', () => {
  assert.deepEqual(
    parseEspnSessionPaste('foo=1; SWID=ABC-123; other=2; espn_s2=AEBabcdefghijklmnopqrstuvwxyz1234567890'),
    {
      creds: {
        espnS2: 'AEBabcdefghijklmnopqrstuvwxyz1234567890',
        swid: '{ABC-123}',
      },
      missing: [],
    },
  );
});

test('reports missing ESPN session values separately', () => {
  assert.deepEqual(parseEspnSessionPaste('espn_s2=AEBabcdefghijklmnopqrstuvwxyz1234567890'), {
    creds: null,
    missing: ['SWID'],
  });
});

test('paste state: both ESPN session values present', () => {
  const parsed = parseEspnSessionPaste('SWID={ABC-123}; espn_s2=AEBabcdefghijklmnopqrstuvwxyz1234567890');
  assert.deepEqual(parsed, {
    creds: {
      espnS2: 'AEBabcdefghijklmnopqrstuvwxyz1234567890',
      swid: '{ABC-123}',
    },
    missing: [],
  });
  assert.equal(espnSessionPasteError(parsed.missing), null);
});

test('paste state: espn_s2 present but SWID missing', () => {
  const parsed = parseEspnSessionPaste('espn_s2=AEBabcdefghijklmnopqrstuvwxyz1234567890');
  assert.deepEqual(parsed, {
    creds: null,
    missing: ['SWID'],
  });
  assert.equal(
    espnSessionPasteError(parsed.missing),
    'Found espn_s2 but no SWID — ESPN only exposed part of the login. Reopen your league page, run the connector again, and paste the full output.',
  );
});

test('paste state: SWID present but espn_s2 missing', () => {
  const parsed = parseEspnSessionPaste('foo=1; SWID=ABC-123; other=2');
  assert.deepEqual(parsed, {
    creds: null,
    missing: ['espn_s2'],
  });
  assert.equal(
    espnSessionPasteError(parsed.missing),
    'Found SWID but no espn_s2 — ESPN only exposed part of the login. Reopen your league page, run the connector again, and paste the full output.',
  );
});

test('paste state: neither ESPN session value present', () => {
  const parsed = parseEspnSessionPaste('just some unrelated browser text');
  assert.deepEqual(parsed, {
    creds: null,
    missing: ['espn_s2', 'SWID'],
  });
  assert.equal(
    espnSessionPasteError(parsed.missing),
    'Could not find espn_s2 or SWID — run the Odds Gods connector on your ESPN league page, then paste what it gives you.',
  );
});

test('builds runnable ESPN launch code that captures readable ESPN values', () => {
  const code = buildEspnLaunchCode('https://oddsgods.net/connect');
  assert.equal(code.startsWith('javascript:'), true);
  assert.match(code, /fantasy\\.espn\\.com/);
  assert.match(code, /document\.cookie/);
  assert.match(code, /espn_s2=/);
  assert.match(code, /SWID=/);
  assert.match(code, /espnCapture/);
  assert.match(code, /espnLeagueId/);
  assert.match(code, /location\.href = url\.toString\(\)/);
  assert.match(code, /https:\/\/oddsgods\.net\/connect/);
  assert.equal(code.includes('React has ' + 'blocked'), false);
  assert.equal(code.includes('throw new ' + 'Error'), false);
});

test('ESPN connect flow does not mention invisible login artifacts', () => {
  const files = [
    'src/components/league/EspnConnect.tsx',
    'src/utils/espnConnect.js',
  ];
  const badText = 'session' + ' text';
  const badLine = 'session' + ' line';
  const badBookmark = 'book' + 'mark';
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8').toLowerCase();
    assert.equal(text.includes(badText), false, file);
    assert.equal(text.includes(badLine), false, file);
    assert.equal(text.includes(badBookmark), false, file);
  }
});
