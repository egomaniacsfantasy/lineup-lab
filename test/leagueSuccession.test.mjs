import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_CHAIN, findSuccessorLeague } from '../server/leagueSuccession.js';

/**
 * Walking previous_league_id back to the league someone has connected.
 *
 * The rendered tests cover the banner; they cannot cover this, because the
 * design fixtures answer the route directly and never touch a provider. This
 * is the only place the walk itself is exercised, which matters because it is
 * the only part with anything to get wrong: it reads a chain of ids supplied
 * by somebody else's API and must terminate on all of them.
 */

/** A Sleeper standing in for the real one. `chain` maps id -> previous id. */
function stubProvider({ leagues, chain, season = '2026', seasons = {} }) {
  return {
    providerId: 'sleeper',
    getSeasonState: async () => ({ season }),
    getLeagues: async () => leagues,
    getLeague: async (id) => ({
      id,
      season: seasons[id] ?? '2025',
      previousLeagueId: chain[id] ?? null,
    }),
  };
}

test('the league that points straight back is the successor', async () => {
  const provider = stubProvider({
    leagues: [{ id: 'L2026', name: 'This year', previousLeagueId: 'L2025' }],
    chain: { L2026: 'L2025' },
  });
  const result = await findSuccessorLeague(provider, 'L2025', 'user');
  assert.equal(result.reason, 'found');
  assert.equal(result.successor.id, 'L2026');
  assert.equal(result.season, '2026');
});

test('a league connected several seasons ago is still found', async () => {
  /* 2026 -> 2025 -> 2024 -> 2023, connected in 2023. */
  const provider = stubProvider({
    leagues: [{ id: 'L2026', name: 'This year', previousLeagueId: 'L2025' }],
    chain: { L2025: 'L2024', L2024: 'L2023' },
  });
  const result = await findSuccessorLeague(provider, 'L2023', 'user');
  assert.equal(result.reason, 'found');
  assert.equal(result.successor.id, 'L2026');
});

test('the right league is picked out of several this season', async () => {
  const provider = stubProvider({
    leagues: [
      { id: 'OTHER', name: 'A redraft', previousLeagueId: null },
      { id: 'DECOY', name: 'Another dynasty', previousLeagueId: 'SOMEONE-ELSE' },
      { id: 'L2026', name: 'The one', previousLeagueId: 'L2025' },
    ],
    chain: { L2026: 'L2025', DECOY: 'SOMEONE-ELSE' },
  });
  const result = await findSuccessorLeague(provider, 'L2025', 'user');
  assert.equal(result.successor.id, 'L2026');
});

test('a league nobody has rolled over yet reports why, not a bare null', async () => {
  /* The common case in August, and the one where telling someone to
     reconnect would send them looking for a league that does not exist. */
  const provider = stubProvider({ leagues: [], chain: {} });
  const result = await findSuccessorLeague(provider, 'L2025', 'user');
  assert.equal(result.successor, null);
  assert.equal(result.reason, 'not_rolled_over');
});

test('a league that is already this season is not stale at all', async () => {
  const provider = stubProvider({
    leagues: [],
    chain: {},
    seasons: { L2026: '2026' },
  });
  const result = await findSuccessorLeague(provider, 'L2026', 'user');
  assert.equal(result.reason, 'already_current');
});

test('ESPN is not asked, because it has no chain', async () => {
  const provider = { providerId: 'espn' };
  const result = await findSuccessorLeague(provider, 'L', 'user');
  assert.equal(result.reason, 'unsupported_provider');
});

test('a chain that loops terminates instead of spinning', async () => {
  /* Two leagues naming each other. Somebody else's data, so this is not a
     hypothetical: it has to end whatever arrives. */
  let reads = 0;
  const provider = {
    providerId: 'sleeper',
    getSeasonState: async () => ({ season: '2026' }),
    getLeagues: async () => [{ id: 'L2026', name: 'Loop', previousLeagueId: 'A' }],
    getLeague: async (id) => {
      reads += 1;
      if (reads > 50) throw new Error('the walk did not terminate');
      return { id, season: '2025', previousLeagueId: id === 'A' ? 'B' : 'A' };
    },
  };
  const result = await findSuccessorLeague(provider, 'NEVER-IN-THE-CHAIN', 'user');
  assert.equal(result.reason, 'not_rolled_over');
  /* And it noticed the loop rather than grinding to the step bound. */
  assert.ok(reads <= MAX_CHAIN + 1, `walked ${reads} leagues on a two-league loop`);
});

test('a league the provider cannot find is reported as missing', async () => {
  const provider = {
    providerId: 'sleeper',
    getSeasonState: async () => ({ season: '2026' }),
    getLeagues: async () => [],
    getLeague: async () => null,
  };
  const result = await findSuccessorLeague(provider, 'GONE', 'user');
  assert.equal(result.reason, 'league_not_found');
});
