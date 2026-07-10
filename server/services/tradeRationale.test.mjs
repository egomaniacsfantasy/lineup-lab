import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTradeRationaleFactors,
  maybeNarrateTradeRationale,
  renderStructuredTradeRationale,
  validateTradeNarration,
} from './tradeRationale.js';

const league = {
  scoringFamily: 'ppr',
  rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN'],
};

const teams = [
  {
    rosterId: 1,
    isUser: true,
    teamName: 'Odds Gods',
    players: ['give-rb', 'my-qb', 'my-wr', 'my-te', 'my-k', 'my-def'],
  },
  {
    rosterId: 2,
    isUser: false,
    teamName: 'Roster 4',
    players: ['get-wr', 'their-qb', 'their-rb', 'their-te', 'their-k', 'their-def'],
  },
];

const catalog = {
  'give-rb': { name: 'Saquon Barkley', position: 'RB', team: 'PHI' },
  'get-wr': { name: 'Rashee Rice', position: 'WR', team: 'KC' },
  'my-qb': { name: 'Joe Burrow', position: 'QB', team: 'CIN' },
  'my-wr': { name: 'Puka Nacua', position: 'WR', team: 'LAR' },
  'my-te': { name: 'Trey McBride', position: 'TE', team: 'ARI' },
  'my-k': { name: 'Brandon Aubrey', position: 'K', team: 'DAL' },
  'my-def': { name: 'Eagles DEF', position: 'DEF', team: 'PHI' },
  'their-qb': { name: 'Josh Allen', position: 'QB', team: 'BUF' },
  'their-rb': { name: 'Kyren Williams', position: 'RB', team: 'LAR' },
  'their-te': { name: 'Sam LaPorta', position: 'TE', team: 'DET' },
  'their-k': { name: 'Jake Elliott', position: 'K', team: 'PHI' },
  'their-def': { name: 'Bills DEF', position: 'DEF', team: 'BUF' },
};

const projections = Object.entries(catalog).map(([playerId, player], index) => ({
  playerId,
  ...player,
  mean: 10 + index,
  floor: 7 + index,
  ceiling: 15 + index,
  seasonTotal: 150 + index * 8,
}));

const price = {
  available: true,
  projectionVersion: 'FRANCO-2026-07-07',
  you: {
    teamName: 'Odds Gods',
    titleProbBefore: 21.8,
    titleProbAfter: 22.6,
    valueDelta: 1.2,
    depthBefore: { QB: 1, RB: 1, WR: 1, TE: 1, K: 1, DEF: 1 },
    depthAfter: { QB: 1, RB: 0, WR: 2, TE: 1, K: 1, DEF: 1 },
  },
  them: {
    teamName: 'Roster 4',
    valueDelta: 0.4,
  },
  verdict: 'Good value',
  acceptance: {
    band: 'Likely',
    probability: 75,
    reasons: ['They land the best player in the deal (Saquon Barkley).'],
  },
  valueGap: -4,
  bestPlayer: { name: 'Saquon Barkley', toThem: true },
};

const analysis = {
  available: true,
  you: {
    delta: {
      playoffProb: 1.1,
      titleProb: 0.8,
      expWins: 0.2,
      avgSeed: -0.1,
    },
  },
  partner: {
    delta: {
      playoffProb: 0.6,
      titleProb: 0.3,
      expWins: 0.1,
      avgSeed: -0.1,
    },
  },
};

function fixtureFactors() {
  return buildTradeRationaleFactors({
    leagueId: 'league-1',
    projectionVersion: 'FRANCO-2026-07-07',
    league,
    teams,
    catalog,
    projections,
    price,
    analysis,
    partnerRosterId: 2,
    give: ['give-rb'],
    get: ['get-wr'],
  });
}

test('structured trade rationale renders grounded factors', () => {
  const factors = fixtureFactors();
  const structured = renderStructuredTradeRationale(factors);
  assert.equal(factors.available, true);
  assert.match(structured.summary, /Rashee Rice/);
  assert.deepEqual(
    structured.sections.find((section) => section.label === 'Lineup')?.facts,
    ['You +1.2 pts/wk to starters.', 'Roster 4 +0.4 pts/wk to starters.'],
  );
  assert.equal(
    structured.sections.some((section) =>
      section.facts.some((fact) => fact.includes('75% to accept')),
    ),
    true,
  );
});

test('narration validator rejects ungrounded or off-voice claims', () => {
  const factors = fixtureFactors();
  assert.equal(validateTradeNarration('Rashee Rice gives you +1.2 pts/wk. Acceptance is 75%.', factors), true);
  assert.equal(validateTradeNarration('Rashee Rice gives you +99 pts/wk. Acceptance is 75%.', factors), false);
  assert.equal(validateTradeNarration('Patrick Mahomes makes this a smash.', factors), false);
  assert.equal(
    validateTradeNarration(`Rashee Rice gives you +1.2 pts/wk ${String.fromCharCode(8212)} take it.`, factors),
    false,
  );
});

test('optional narration caches by trade signature', async () => {
  const factors = fixtureFactors();
  let calls = 0;
  const first = await maybeNarrateTradeRationale(factors, {
    enabled: true,
    provider: 'fixture',
    model: 'fixture-model',
    generator: async () => {
      calls += 1;
      return 'Rashee Rice gives you +1.2 pts/wk. Acceptance is 75%.';
    },
  });
  const second = await maybeNarrateTradeRationale(factors, {
    enabled: true,
    provider: 'fixture',
    model: 'fixture-model',
    generator: async () => {
      calls += 1;
      return 'Rashee Rice gives you +1.2 pts/wk. Acceptance is 75%.';
    },
  });

  assert.equal(first?.cached, false);
  assert.equal(second?.cached, true);
  assert.equal(calls, 1);
});
