import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANY_PICK,
  DEFAULT_MAX_PARTNER_LOSS,
  DEFAULT_MIN_GAIN,
  EMPTY_QUERY,
  FINDER_SHAPES,
  deriveStartingPoints,
  describeQuery,
  finderLayout,
  isExactTrade,
  matchesShapes,
  partnersToScan,
  passesLimits,
  queryToRequests,
  rankDeals,
  reconcileQuery,
  togglePartner,
  togglePlayer,
  togglePosition,
  toggleShape,
  DEFAULT_LIMITS,
  LOPSIDED_PPG,
  NOISE_PP,
  boardMatches,
  groupDeals,
  headlinePlayer,
  isLopsided,
  partnerValueDelta,
  sendConsequence,
  servedByBoard,
  standingOf,
  withinNoise,
  passesPointsLimit,
} from '../src/utils/tradeFinderQuery.ts';

/**
 * The finder's ticket is the trade sender's rules asked on demand: every blank
 * is a pool ("any of these", empty = no limit) and takes several picks. These
 * pin the pools, the per-manager requests they become, the sender's keep rule
 * and ranking, and the roster facts the starting points read.
 */

const team = (rosterId, players, isUser = false) => ({
  rosterId,
  teamId: String(rosterId),
  ownerId: null,
  ownerName: null,
  teamName: `Team ${rosterId}`,
  avatarUrl: null,
  players,
  starters: [],
  reserve: [],
  record: { wins: 0, losses: 0, ties: 0 },
  pointsFor: 0,
  pointsAgainst: 0,
  isUser,
  division: null,
});

test('the shape row offers every size up to 3 for 3, and the first number is what you send', () => {
  assert.deepEqual(FINDER_SHAPES.map((shape) => shape.label),
    ['1 for 1', '2 for 1', '1 for 2', '2 for 2', '2 for 3', '3 for 2', '3 for 3']);
  assert.deepEqual(FINDER_SHAPES.find((shape) => shape.id === '2-1')?.sizes, { give: 2, get: 1 });
  assert.deepEqual(FINDER_SHAPES.find((shape) => shape.id === '2-3')?.sizes, { give: 2, get: 3 });
});

test('every leg takes several picks, and an emptied leg is open again', () => {
  /* Positions: any number of the four. */
  let send = togglePosition(ANY_PICK, 'WR');
  send = togglePosition(send, 'RB');
  assert.deepEqual(send, { kind: 'position', positions: ['RB', 'WR'] }, 'kept in QB/RB/WR/TE order');
  assert.deepEqual(togglePosition(togglePosition(send, 'RB'), 'WR'), ANY_PICK, 'removing the last pick reopens the leg');

  /* Players: any number, and picking a player replaces a position pool. */
  let get = togglePlayer({ kind: 'position', positions: ['TE'] }, 'p1');
  get = togglePlayer(get, 'p2');
  assert.deepEqual(get, { kind: 'player', ids: ['p1', 'p2'] });
  assert.deepEqual(togglePlayer(get, 'p1'), { kind: 'player', ids: ['p2'] });

  /* Shapes and managers toggle the same way. */
  assert.deepEqual(toggleShape(toggleShape([], '2-2'), '1-1'), ['1-1', '2-2']);
  assert.deepEqual(toggleShape(['1-1', '2-2'], '1-1'), ['2-2']);
  assert.deepEqual(togglePartner(togglePartner([], 4), 7), [4, 7]);
  assert.deepEqual(togglePartner([4, 7], 4), [7]);
});

test('the ticket becomes one sender-rules request per manager per shape', () => {
  const teams = [team(1, ['mine'], true), team(2, ['a']), team(3, ['b']), team(4, ['c'])];
  const requests = queryToRequests({
    partnerRosterIds: [4, 2],
    send: { kind: 'position', positions: ['RB', 'WR'] },
    get: { kind: 'position', positions: ['TE'] },
    shapes: ['2-1', '1-1'],
  }, teams);
  /* Only the picked managers; each shape is its own search, so picking another
     shape can only add deals, never change what a shape already found. */
  assert.deepEqual(
    requests.map((request) => [request.partnerRosterId, request.shape]),
    [[2, '1-1'], [2, '2-1'], [4, '1-1'], [4, '2-1']],
  );
  assert.deepEqual(requests[0].rules, {
    giveAllow: [], getAllow: [], givePositions: ['RB', 'WR'], getPositions: ['TE'],
  });
  assert.deepEqual(requests[0].shapes, [{ give: 1, get: 1 }]);
  assert.deepEqual(requests[1].shapes, [{ give: 2, get: 1 }]);

  /* Nothing picked anywhere = every manager, no limits, and every shape on the ticket. */
  const open = queryToRequests(EMPTY_QUERY, teams);
  assert.equal(open.length, 3 * FINDER_SHAPES.length);
  assert.deepEqual([...new Set(open.map((request) => request.partnerRosterId))], [2, 3, 4]);
  assert.deepEqual(open.slice(0, FINDER_SHAPES.length).map((request) => request.shape), FINDER_SHAPES.map((shape) => shape.id));
  assert.deepEqual(open[0].rules, { giveAllow: [], getAllow: [], givePositions: [], getPositions: [] });
});

test('a pool of players you want narrows the scan to the managers who own them', () => {
  const teams = [team(1, ['mine'], true), team(2, ['x']), team(3, ['y']), team(4, ['z'])];
  const query = { ...EMPTY_QUERY, get: { kind: 'player', ids: ['x', 'z'] } };
  assert.deepEqual(partnersToScan(query, teams), [2, 4]);
  assert.deepEqual(queryToRequests(query, teams)[0].rules.getAllow, ['x', 'z']);
});

test('the ticket never asks for a player the picked managers do not own', () => {
  const teams = [team(1, ['mine'], true), team(2, ['theirs']), team(3, ['other'])];
  const wide = reconcileQuery({ ...EMPTY_QUERY, get: { kind: 'player', ids: ['theirs', 'other'] } }, teams);
  assert.deepEqual(wide.get, { kind: 'player', ids: ['theirs', 'other'] }, 'with anyone, every opponent player is fair');
  /* Narrowing to one manager drops the players he does not own, never the manager. */
  const narrowed = reconcileQuery({ ...wide, partnerRosterIds: [3] }, teams);
  assert.deepEqual(narrowed.get, { kind: 'player', ids: ['other'] });
  assert.deepEqual(narrowed.partnerRosterIds, [3]);
  /* A send pool only ever holds your own players. */
  const send = reconcileQuery({ ...EMPTY_QUERY, send: { kind: 'player', ids: ['mine', 'theirs'] } }, teams);
  assert.deepEqual(send.send, { kind: 'player', ids: ['mine'] });
});

test('every leg exact is a trade to price, not a search', () => {
  const exact = {
    partnerRosterIds: [2],
    send: { kind: 'player', ids: ['a'] },
    get: { kind: 'player', ids: ['b'] },
    shapes: ['1-1'],
  };
  assert.equal(isExactTrade(exact), true);
  assert.equal(isExactTrade({ ...exact, shapes: [] }), false, 'any shape allows throw-ins, so it is still a search');
  assert.equal(isExactTrade({ ...exact, shapes: ['1-1', '2-1'] }), false);
  assert.equal(isExactTrade({ ...exact, send: ANY_PICK }), false);
  assert.equal(isExactTrade({ ...exact, get: { kind: 'player', ids: ['b', 'c'] } }), false, 'a pool of two is a search');
  assert.equal(isExactTrade({ ...exact, partnerRosterIds: [2, 3] }), false);
});

test('picked shapes keep only those package sizes', () => {
  const twoForTwo = { give: [{ id: 'a' }, { id: 'b' }], get: [{ id: 'c' }, { id: 'd' }] };
  const oneForOne = { give: [{ id: 'a' }], get: [{ id: 'c' }] };
  const threeForThree = { give: [{ id: 'a' }, { id: 'b' }, { id: 'e' }], get: [{ id: 'c' }, { id: 'd' }, { id: 'f' }] };
  assert.equal(matchesShapes(twoForTwo, ['2-2']), true);
  assert.equal(matchesShapes(oneForOne, ['2-2']), false);
  assert.equal(matchesShapes(oneForOne, ['1-1', '2-1']), true, 'several shapes at once');
  assert.equal(matchesShapes(threeForThree, ['1-1', '2-1']), false, 'a 3 for 3 cannot crowd out the sizes asked for');
  assert.equal(matchesShapes(threeForThree, []), true, 'no shape picked = any size');
});

test('the keep rule and ranking are the trade sender\'s, not an acceptance estimate', () => {
  /* Opens on every deal that helps you at all and costs the other side at
     most 2 points of title odds. The limits sheet changes it. */
  assert.equal(DEFAULT_MIN_GAIN, 0);
  assert.equal(DEFAULT_MAX_PARTNER_LOSS, 2);
  const deal = (youDelta, partnerDelta) => ({ suggestion: { youDelta, partnerDelta } });
  /* Kept only if your title odds rise at least X and theirs fall at most Y. */
  assert.equal(passesLimits({ youDelta: 2.1, partnerDelta: -1.2 }, 1, 3), true);
  assert.equal(passesLimits({ youDelta: 0.4, partnerDelta: -0.2 }, 1, 3), false, 'under your minimum gain');
  assert.equal(passesLimits({ youDelta: 4, partnerDelta: -3.5 }, 1, 3), false, 'they lose more than your limit');
  assert.equal(passesLimits({ youDelta: 4, partnerDelta: -3.5 }, 1, null), true, 'no limit on their loss');
  assert.equal(passesLimits({ youDelta: -0.5, partnerDelta: 2 }, 0, null), false, 'a deal that lowers your odds is never kept');
  /* Ranked by your title gain, biggest first. */
  const ranked = rankDeals([deal(1.4, -0.8), deal(2.2, 0.4), deal(2.1, -1.2)]);
  assert.deepEqual(ranked.map((entry) => entry.suggestion.youDelta), [2.2, 2.1, 1.4]);
});

test('a leg pinned to one player is the header; anything wider is the row', () => {
  assert.equal(finderLayout({ ...EMPTY_QUERY, get: { kind: 'player', ids: ['x'] } }), 'get-player');
  assert.equal(finderLayout({ ...EMPTY_QUERY, send: { kind: 'player', ids: ['x'] } }), 'send-player');
  assert.equal(finderLayout({ ...EMPTY_QUERY, get: { kind: 'player', ids: ['x', 'y'] } }), 'open');
  assert.equal(finderLayout({ ...EMPTY_QUERY, get: { kind: 'position', positions: ['RB'] } }), 'open');
});

test('the ask reads back as one sentence', () => {
  const text = describeQuery(
    { partnerRosterIds: [2], send: { kind: 'position', positions: ['WR'] }, get: { kind: 'player', ids: ['x'] }, shapes: ['2-1'] },
    { partners: ['Hermes Express'], getPlayers: ['Bijan Robinson'] },
  );
  assert.equal(text, 'With Hermes Express, send a WR, get Bijan Robinson, 2 for 1');
  const wide = describeQuery(
    { partnerRosterIds: [2, 3, 4], send: { kind: 'position', positions: ['RB', 'WR'] }, get: ANY_PICK, shapes: ['1-1', '2-2'] },
    { partners: ['Hermes Express', 'Apollo Archers', 'Ares'] },
  );
  assert.equal(wide, 'With Hermes Express, Apollo Archers or 1 more, send RB or WR, get anything, 1 for 1 or 2 for 2');
  assert.equal(describeQuery(EMPTY_QUERY), 'With anyone, send anything, get anything');
});

test('starting points come from roster facts, and name the mirror manager', () => {
  const players = {
    qb1: { id: 'qb1', name: 'QB One', team: null, position: 'QB', status: null, injuryStatus: null },
    rb1: { id: 'rb1', name: 'RB One', team: null, position: 'RB', status: null, injuryStatus: null },
    rb2: { id: 'rb2', name: 'RB Two', team: null, position: 'RB', status: null, injuryStatus: null },
    wr1: { id: 'wr1', name: 'WR One', team: null, position: 'WR', status: null, injuryStatus: null },
    wr2: { id: 'wr2', name: 'WR Two', team: null, position: 'WR', status: null, injuryStatus: null },
    wr3: { id: 'wr3', name: 'WR Three', team: null, position: 'WR', status: null, injuryStatus: null },
    wr4: { id: 'wr4', name: 'WR Four', team: null, position: 'WR', status: null, injuryStatus: null },
    te1: { id: 'te1', name: 'TE One', team: null, position: 'TE', status: null, injuryStatus: null },
    orb1: { id: 'orb1', name: 'Their RB One', team: null, position: 'RB', status: null, injuryStatus: null },
    orb2: { id: 'orb2', name: 'Their RB Two', team: null, position: 'RB', status: null, injuryStatus: null },
    owr1: { id: 'owr1', name: 'Their WR One', team: null, position: 'WR', status: null, injuryStatus: null },
    owr2: { id: 'owr2', name: 'Their WR Two', team: null, position: 'WR', status: null, injuryStatus: null },
    oqb1: { id: 'oqb1', name: 'Their QB', team: null, position: 'QB', status: null, injuryStatus: null },
    ote1: { id: 'ote1', name: 'Their TE', team: null, position: 'TE', status: null, injuryStatus: null },
  };
  const m = (mean) => ({ mean, stdev: 1, unpriced: false, zeroed: false, derived: false });
  const playerMeans = {
    qb1: m(20), rb1: m(14), rb2: m(6), wr1: m(15), wr2: m(14), wr3: m(12), wr4: m(10), te1: m(9),
    orb1: m(16), orb2: m(15), owr1: m(9), owr2: m(8), oqb1: m(20), ote1: m(9),
  };
  const teams = [
    team(1, ['qb1', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'wr4', 'te1'], true),
    team(2, ['oqb1', 'orb1', 'orb2', 'owr1', 'owr2', 'ote1']),
  ];
  const rosterPositions = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN'];
  const points = deriveStartingPoints({ teams, players, playerMeans, rosterPositions });

  /* Your RB2 projects 6 against a league median of 10.5: that is the upgrade. */
  const upgrade = points.find((point) => point.id === 'upgrade-RB');
  assert.ok(upgrade, `expected an RB upgrade, got ${points.map((p) => p.id).join(', ')}`);
  assert.deepEqual(upgrade.query, { get: { kind: 'position', positions: ['RB'] } });
  assert.match(upgrade.detail, /RB2 projects 6\.0/);

  /* Four receivers for two slots: sell from WR. */
  const sell = points.find((point) => point.id === 'sell-WR');
  assert.ok(sell, 'expected a WR sell');
  assert.deepEqual(sell.query, { send: { kind: 'position', positions: ['WR'] } });
  assert.match(sell.detail, /carry 4, 2 ride the bench/);

  /* Team 2 is deep at RB and thin at WR: the mirror, with both legs filled. */
  const mirror = points.find((point) => point.id === 'mirror-2');
  assert.ok(mirror, 'expected team 2 as the mirror');
  assert.deepEqual(mirror.query, {
    partnerRosterIds: [2],
    send: { kind: 'position', positions: ['WR'] },
    get: { kind: 'position', positions: ['RB'] },
  });

  /* Without per-player means there are no facts, so there are no points. */
  assert.deepEqual(deriveStartingPoints({ teams, players, playerMeans: null, rosterPositions }), []);
});

/* ── The board, and how a deal is read ──
   The open ask is answered from a background scan that already ran; a named
   player walks the league live. Deals group by the player you would land,
   swings under a point are ties, and a robbery of a team that is out is
   caught on roster value because title odds cannot see it. */

const deal = (partnerRosterId, give, get, youDelta, partnerDelta = 0) => ({
  partnerRosterId,
  partnerName: `Team ${partnerRosterId}`,
  give: give.map((id) => ({ id, name: id })),
  get: get.map((id) => ({ id, name: id })),
  youDelta,
  partnerDelta,
});

test('managers and shapes are answered from the board; a position or a player walks live', () => {
  assert.equal(servedByBoard(EMPTY_QUERY), true);
  assert.equal(servedByBoard({ ...EMPTY_QUERY, partnerRosterIds: [2], shapes: ['1-1'] }), true);
  /* The engine builds candidates from the pools it is given, so a position
     rule finds packages the open scan never simmed. Filtering the open scan
     down to running backs left two or three deals; the live rule found many. */
  assert.equal(servedByBoard({ ...EMPTY_QUERY, get: { kind: 'position', positions: ['RB'] } }), false);
  assert.equal(servedByBoard({ ...EMPTY_QUERY, send: { kind: 'position', positions: ['WR'] } }), false);
  assert.equal(servedByBoard({ ...EMPTY_QUERY, get: { kind: 'player', ids: ['x'] } }), false);
  assert.equal(servedByBoard({ ...EMPTY_QUERY, send: { kind: 'player', ids: ['x'] } }), false);
});

test('the board is filtered by the ticket the way the live search would be', () => {
  const players = { a: { position: 'RB' }, b: { position: 'WR' }, c: { position: 'TE' }, d: { position: 'RB' } };
  const rbForTe = deal(2, ['c'], ['a'], 2);
  const rbAndWrForTe = deal(2, ['c'], ['a', 'b'], 2);
  const otherManager = deal(3, ['c'], ['d'], 2);
  const wantRBs = { ...EMPTY_QUERY, get: { kind: 'position', positions: ['RB'] } };
  assert.equal(boardMatches(rbForTe, wantRBs, players), true);
  /* Every player received must come from the pool: a WR rider fails it. */
  assert.equal(boardMatches(rbAndWrForTe, wantRBs, players), false);
  assert.equal(boardMatches(otherManager, { ...wantRBs, partnerRosterIds: [2] }, players), false);
  assert.equal(boardMatches(rbForTe, { ...EMPTY_QUERY, shapes: ['2-1'] }, players), false);
});

test('deals group under the player you would land, best package first', () => {
  const values = { hall: { mean: 18 }, kittle: { mean: 11 }, pollard: { mean: 7 }, brown: { mean: 16 } };
  const entries = [
    { suggestion: deal(2, ['kittle', 'pollard'], ['hall'], 1.3) },
    { suggestion: deal(2, ['kittle'], ['hall'], 1.4) },
    { suggestion: deal(3, ['kittle'], ['brown', 'pollard'], 1.5) },
  ];
  const groups = groupDeals(entries, values);
  assert.deepEqual(groups.map((group) => group.headlineId), ['brown', 'hall']);
  const hall = groups.find((group) => group.headlineId === 'hall');
  assert.equal(hall.best.suggestion.youDelta, 1.4);
  assert.equal(hall.others.length, 1);
  /* The headline is the most valuable incoming player, not the first listed. */
  assert.equal(headlinePlayer(deal(3, [], ['pollard', 'brown'], 1), values), 'brown');
});

test('under a point of title odds is a tie, and the default limits lift both sides', () => {
  assert.equal(withinNoise(0.9), true);
  assert.equal(withinNoise(NOISE_PP), false);
  assert.deepEqual(DEFAULT_LIMITS, { minGain: 0, maxLoss: 2, hideLopsided: true, maxGiveUp: null });
});

test('a robbery of a team that is out is caught on roster value, not title odds', () => {
  const values = { lamb: { mean: 16.8 }, coker: { mean: 6.1 } };
  /* Frank is 0-3; his title odds cannot fall, so partnerDelta reads 0. */
  const robbery = deal(2, ['coker'], ['lamb'], 5.8, 0);
  const gap = partnerValueDelta(robbery, values);
  assert.equal(Number(gap.toFixed(1)), -10.7);
  assert.equal(isLopsided(gap), true);
  assert.equal(isLopsided(-LOPSIDED_PPG + 0.1), false);
  assert.equal(standingOf(5), 'out');
  assert.equal(standingOf(40), 'bubble');
  assert.equal(standingOf(80), 'contender');
});

test('the finder shows no acceptance estimate anywhere', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['src/components/trade/TradeFinder.tsx', 'src/components/trade/TradeAnalyzerPanel.tsx']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /acceptanceProbability|getAcceptanceLingo|acceptanceWord|take it|accept\?/, `${file} shows acceptance`);
  }
});

test('sending a starter names who starts instead; sending a bench piece costs the lineup nothing', () => {
  const players = {
    te1: { id: 'te1', name: 'Kittle', team: null, position: 'TE', status: null, injuryStatus: null },
    te2: { id: 'te2', name: 'McBride', team: null, position: 'TE', status: null, injuryStatus: null },
  };
  const values = { te1: { mean: 11.2 }, te2: { mean: 9.4 } };
  const myTeam = { players: ['te1', 'te2'] };
  const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
  assert.deepEqual(sendConsequence('te1', myTeam, players, values, slots), {
    slot: 'TE1',
    replacement: { id: 'te2', name: 'McBride', perGame: 9.4 },
  });
  assert.deepEqual(sendConsequence('te2', myTeam, players, values, slots), { slot: 'bench', replacement: null });
});

test('the points limit: you give up at most N projected points, net', () => {
  assert.equal(passesPointsLimit(-40, 50), true);
  assert.equal(passesPointsLimit(-60, 50), false, 'giving up 60 net is past a 50 limit');
  assert.equal(passesPointsLimit(25, 0), true, 'gaining points always passes');
  assert.equal(passesPointsLimit(-500, null), true, 'no limit');
  assert.equal(passesPointsLimit(undefined, 50), true, 'a deal from an older scan, with no value line, is kept');
});

test('a tie is a change inside its own interval; the fixed line only without one', () => {
  assert.equal(withinNoise(0.5, 0.6), true, '+0.5 with a +/-0.6 range is noise');
  assert.equal(withinNoise(0.8, 0.4), false, '+0.8 with a +/-0.4 range is real, though under 1pp');
  assert.equal(withinNoise(1.5, 2.1), true, 'a wide range swallows even a larger change');
  assert.equal(withinNoise(0.5), true, 'no interval: the old 1pp line');
  assert.equal(withinNoise(1.2), false);
});
