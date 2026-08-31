import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleLeagues } from '../server/leagueChoices.js';

/**
 * The reported failure: one dynasty league, listed twice, a year apart, with
 * the same name and no way to tell which was current. Pick the wrong one and
 * every number in the product is a year stale.
 */

const league = (id, season, over = {}) => ({
  id,
  season,
  name: 'Los Talks Dynasty',
  previousLeagueId: null,
  ...over,
});

test('a dynasty chain collapses to the season it is in now', () => {
  const seen = visibleLeagues(
    [league('2025id', '2025'), league('2026id', '2026', { previousLeagueId: '2025id' })],
    '2026',
  );
  assert.equal(seen.length, 1, `offered ${seen.length} copies of one league`);
  assert.equal(seen[0].id, '2026id');
});

test('the chain is followed by id, not by name or season', () => {
  // Two genuinely different leagues that happen to share a name must both
  // survive. Only previous_league_id proves one replaced the other.
  const seen = visibleLeagues(
    [league('a', '2026'), league('b', '2026')],
    '2026',
  );
  assert.equal(seen.length, 2, 'two separate leagues were merged into one');
});

test('a chain collapses even when both links are filed under this season', () => {
  /* Pinned separately because the season filter alone hides the usual case and
     would make the chain walk look unnecessary. Sleeper files a rolled-over
     league under the new season as soon as it is created, which during a
     rollover can put both ends of the chain in the same year: name identical,
     season identical, and only previous_league_id telling them apart. */
  const seen = visibleLeagues(
    [league('old', '2026'), league('new', '2026', { previousLeagueId: 'old' })],
    '2026',
  );
  assert.deepEqual(seen.map((l) => l.id), ['new']);
});

test('a redraft league from last season is hidden once this season exists', () => {
  const seen = visibleLeagues(
    [league('old', '2025', { name: 'Last year' }), league('new', '2026', { name: 'This year' })],
    '2026',
  );
  assert.deepEqual(seen.map((l) => l.id), ['new']);
});

test('leagues still filed under last season are shown rather than nothing', () => {
  /* The off-season case the two-season merge exists for: Sleeper's idea of the
     current season can lag the season a league is filed under. Hiding
     everything that is not "current" would resurrect exactly that bug, so the
     rule only applies when there is something current to show. */
  const seen = visibleLeagues([league('a', '2025'), league('b', '2025')], '2026');
  assert.equal(seen.length, 2, 'a manager with leagues was shown an empty list');
});

test('a chain with no current-season link still shows its newest', () => {
  // Nobody has rolled this one over yet. Show the newest we know about, once.
  const seen = visibleLeagues(
    [league('2024id', '2024'), league('2025id', '2025', { previousLeagueId: '2024id' })],
    '2026',
  );
  assert.deepEqual(seen.map((l) => l.id), ['2025id']);
});

test('a three season chain collapses to one', () => {
  const seen = visibleLeagues(
    [
      league('a', '2024'),
      league('b', '2025', { previousLeagueId: 'a' }),
      league('c', '2026', { previousLeagueId: 'b' }),
    ],
    '2026',
  );
  assert.deepEqual(seen.map((l) => l.id), ['c']);
});

test('numeric and string ids are the same id', () => {
  // Sleeper sends strings; a provider or a fixture may not.
  const seen = visibleLeagues(
    [league(2025, '2025'), league(2026, '2026', { previousLeagueId: 2025 })],
    '2026',
  );
  assert.equal(seen.length, 1);
});

test('an empty or missing list is not a crash', () => {
  assert.deepEqual(visibleLeagues([], '2026'), []);
  assert.deepEqual(visibleLeagues(undefined, '2026'), []);
});
