import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
