import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('parses full ESPN session text in any order', () => {
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
    'Found espn_s2 but no SWID — copy the whole ESPN session line and paste it all.',
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
    'Found SWID but no espn_s2 — copy the whole ESPN session line and paste it all.',
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
    'Could not find espn_s2 or SWID — copy the whole ESPN session line and paste it all.',
  );
});
