import assert from 'node:assert/strict';
import test from 'node:test';
import {
  laneAcceptReasons,
  priceLeague,
  priceTrade,
  rankTradeLanes,
  roundTradeDelta,
  starterImpactBand,
  tradeLaneMatchesPricedResult,
} from './engine.js';

function player(id, name, position, mean, extra = {}) {
  return {
    playerId: id,
    name,
    position,
    mean,
    stdev: Math.max(1, mean * 0.22),
    floor: Math.max(0, mean - 4),
    ceiling: mean + 5,
    seasonTotal: mean * 14,
    weekly: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [String(i + 1), mean])),
    depthRank: 1,
    ...extra,
  };
}

function team(rosterId, teamName, players, starters, isUser = false) {
  return {
    rosterId,
    teamId: String(rosterId),
    ownerId: `owner-${rosterId}`,
    ownerName: teamName,
    teamName,
    avatarUrl: null,
    players,
    starters,
    reserve: [],
    record: { wins: 0, losses: 0, ties: 0 },
    pointsFor: 0,
    pointsAgainst: 0,
    isUser,
  };
}

function realLaneContext() {
  const projections = [
    player('u-qb', 'User QB', 'QB', 18),
    player('u-rb1', 'User RB1', 'RB', 14),
    player('u-rb2', 'User RB2', 'RB', 6),
    player('u-wr1', 'User WR1', 'WR', 18),
    player('u-wr2', 'User WR2', 'WR', 17),
    player('u-wr3', 'User WR3', 'WR', 16),
    player('u-wr4', 'User WR4', 'WR', 13),
    player('u-te', 'User TE', 'TE', 8),
    player('o-qb', 'Opponent QB', 'QB', 18),
    player('o-rb1', 'Opponent RB1', 'RB', 16),
    player('o-rb2', 'Opponent RB2', 'RB', 15),
    player('o-rb3', 'Opponent RB3', 'RB', 14),
    player('o-wr1', 'Opponent WR1', 'WR', 11),
    player('o-wr2', 'Opponent WR2', 'WR', 5),
    player('o-te', 'Opponent TE', 'TE', 8),
    player('fa-wr', 'Free Agent WR', 'WR', 8, { depthRank: 9 }),
  ];
  const catalog = Object.fromEntries(projections.map((p) => [
    p.playerId,
    { id: p.playerId, name: p.name, team: 'FA', position: p.position, status: 'Active', injuryStatus: null },
  ]));
  const userStarters = ['u-qb', 'u-rb1', 'u-rb2', 'u-wr1', 'u-wr2', 'u-te', 'u-wr3'];
  const oppStarters = ['o-qb', 'o-rb1', 'o-rb2', 'o-wr1', 'o-wr2', 'o-te', 'o-rb3'];
  const teams = [
    team(1, 'You', ['u-qb', 'u-rb1', 'u-rb2', 'u-wr1', 'u-wr2', 'u-wr3', 'u-wr4', 'u-te'], userStarters, true),
    team(2, 'Roster 2', ['o-qb', 'o-rb1', 'o-rb2', 'o-rb3', 'o-wr1', 'o-wr2', 'o-te'], oppStarters, false),
  ];
  const matchups = [
    { matchupId: 1, week: 1, rosterId: 1, points: 0, playersPoints: {}, starters: userStarters, players: teams[0].players },
    { matchupId: 1, week: 1, rosterId: 2, points: 0, playersPoints: {}, starters: oppStarters, players: teams[1].players },
  ];
  return {
    league: {
      id: 'test-league',
      name: 'Test League',
      season: '2026',
      totalTeams: 2,
      scoringFamily: 'ppr',
      hasCustomScoring: false,
      rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN'],
      playoffWeekStart: 15,
      playoffTeams: 1,
      lastScoredWeek: 0,
      regularSeasonWeeks: 14,
      leagueType: 'redraft',
      bestBall: false,
    },
    teams,
    matchups,
    week: 1,
    catalog,
    scheduleWeeks: Array.from({ length: 14 }, (_, index) => ({ week: index + 1, matchups })),
    projections: { version: 'test-adjusted', projections, meta: { scoringBasis: 'ppr' } },
  };
}

test('trade lane display numbers match the priced verdict result', () => {
  const priced = {
    available: true,
    you: { valueDelta: 1.64 },
    them: { valueDelta: 0.42 },
    verdict: 'Good value',
    acceptance: { probability: 62 },
    valueGap: -8,
  };

  assert.equal(
    tradeLaneMatchesPricedResult(
      {
        valueGain: 1.6,
        partnerGain: 0.4,
        verdict: 'Good value',
        acceptanceProbability: 62,
        valueGap: -8,
      },
      priced,
    ),
    true,
  );
});

test('trade lane rejects contradictory display signs', () => {
  const priced = {
    available: true,
    you: { valueDelta: -0.1 },
    them: { valueDelta: 0.5 },
  };

  assert.equal(
    tradeLaneMatchesPricedResult(
      { valueGain: 1.6, partnerGain: 0.5 },
      priced,
    ),
    false,
  );
});

test('trade lane rejects mismatched verdict fields', () => {
  const priced = {
    available: true,
    you: { valueDelta: 1.2 },
    them: { valueDelta: 0.6 },
    verdict: 'Fair',
    acceptance: { probability: 47 },
    valueGap: 3,
  };

  assert.equal(
    tradeLaneMatchesPricedResult(
      {
        valueGain: 1.2,
        partnerGain: 0.6,
        verdict: 'Good value',
        acceptanceProbability: 47,
        valueGap: 3,
      },
      priced,
    ),
    false,
  );
});

test('trade lane card deltas must equal verdict display deltas exactly', () => {
  const priced = {
    available: true,
    you: { valueDelta: 0.64 },
    them: { valueDelta: 0.24 },
    verdict: 'Fair',
    acceptance: { probability: 41 },
    valueGap: 1,
  };

  assert.equal(
    tradeLaneMatchesPricedResult(
      {
        valueGain: 0.7,
        partnerGain: 0.2,
        verdict: 'Fair',
        acceptanceProbability: 41,
        valueGap: 1,
      },
      priced,
    ),
    false,
  );
  assert.equal(
    tradeLaneMatchesPricedResult(
      {
        valueGain: 0.6,
        partnerGain: 0.2,
        verdict: 'Fair',
        acceptanceProbability: 41,
        valueGap: 1,
      },
      priced,
    ),
    true,
  );
});

test('priced trade title baseline matches the league futures snapshot', () => {
  // Trade-lane movers were retired (the manager-first finder owns discovery),
  // so build a trade directly. The invariant that matters: priceTrade's own
  // "before" title odds are the SAME per-player season sim as the Futures tab.
  const ctx = realLaneContext();
  const pricing = priceLeague(ctx);
  const userFuture = pricing.futures.find((future) => future.rosterId === 1);

  const verdict = priceTrade(ctx, {
    userRosterId: 1,
    partnerRosterId: 2,
    give: ['u-wr1'],
    get: ['o-rb1'],
    traits: { toughness: 5, dealAppetite: 5, fandomTeam: null, fandomLevel: 5 },
  });

  assert.equal(verdict.available, true);
  assert.equal(verdict.you.titleBefore, userFuture.championOdds);
});

test('negative weekly starter impact cannot improve displayed title odds', () => {
  const ctx = realLaneContext();
  const verdict = priceTrade(ctx, {
    userRosterId: 1,
    partnerRosterId: 2,
    give: ['u-wr1'],
    get: ['o-wr2'],
    traits: { toughness: 5, dealAppetite: 5, fandomTeam: null, fandomLevel: 5 },
  });

  assert.equal(verdict.available, true);
  assert.equal(verdict.you.valueDelta < 0, true);
  assert.equal((verdict.you.titleProbAfter ?? 0) <= (verdict.you.titleProbBefore ?? 0), true);
});

test('fallback lane reasons are low-cost asks, not self-sabotage', () => {
  const reasons = laneAcceptReasons({
    opp: { teamName: 'Roster 4' },
    give: ['1'],
    get: ['2'],
    catalog: {
      1: { name: 'Outgoing Player' },
      2: { name: 'Incoming Player' },
    },
    framing: 'near_fair_you_win',
    priced: {
      you: { valueDelta: 1.84 },
      them: { valueDelta: 0 },
    },
  });

  assert.equal(reasons.length >= 3, true);
  assert.equal(reasons.some((reason) => /barely|little reason/i.test(reason)), false);
  assert.equal(reasons[0], 'Costs Roster 4 nothing this week; you add 1.8.');
});

test('lane reason variants use different sentence structures', () => {
  const reasons = laneAcceptReasons({
    opp: { teamName: 'Roster 4' },
    give: ['1'],
    get: ['2'],
    catalog: {
      1: { name: 'Outgoing Player' },
      2: { name: 'Incoming Player' },
    },
    framing: 'both_upgrade',
    priced: {
      you: { valueDelta: 2.1 },
      them: { valueDelta: 0.6 },
    },
  });

  assert.equal(new Set(reasons).size, reasons.length);
  assert.match(reasons[0], /upgrades starters/);
  assert.match(reasons[1], /Both starters move/);
});

test('lane and verdict share starter-impact bands', () => {
  assert.equal(starterImpactBand(0.2), 'flat');
  assert.equal(starterImpactBand(0.6), 'upgrade');
  assert.equal(starterImpactBand(-0.6), 'downgrade');
});

test('title-negative lanes cannot rank first over title-positive lanes', () => {
  const [first, second] = rankTradeLanes([
    {
      partnerRosterId: 1,
      framing: 'both_upgrade',
      score: 110,
      titleOddsBefore: 358,
      titleOddsAfter: 380,
    },
    {
      partnerRosterId: 2,
      framing: 'near_fair_you_win',
      score: 20,
      titleOddsBefore: 358,
      titleOddsAfter: 330,
    },
  ]);

  assert.equal(first.partnerRosterId, 2);
  assert.equal(second.partnerRosterId, 1);
});
