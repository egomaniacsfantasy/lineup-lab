import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * A synced user must never be shown a demo league's numbers as their own.
 *
 * The futures headline is the most quotable thing in the product — a
 * championship price and a playoff percentage, with the user's own team name
 * above them. It was falling back to MOCK_SEASON_OUTLOOK whenever the engine
 * had not priced that team yet, so a real manager could screenshot a
 * fabricated 62% and post it. Wrong numbers are worse than no numbers here:
 * "Not priced yet" costs a little trust, an invented number costs all of it.
 */
test('the connected futures headline has no mock fallback', async () => {
  const source = await fs.readFile(path.resolve('src/pages/LeaguePage.tsx'), 'utf8');

  /* The demo branch may still use mocks — that is what a demo is. Only the
     connected branch is under test, so read the block that renders when
     `connectedSeason` is truthy. */
  const start = source.indexOf('{connectedSeason ? (');
  assert.ok(start > -1, 'could not find the connected futures branch');
  const connectedBranch = source.slice(start, source.indexOf(') : (', start));

  assert.doesNotMatch(
    connectedBranch,
    /MOCK_/,
    'a connected league is rendering mock numbers as the user\'s own',
  );
});
