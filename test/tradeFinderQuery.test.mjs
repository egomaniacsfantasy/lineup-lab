import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANY_PICK,
  EMPTY_QUERY,
  FINDER_SHAPES,
  deriveStartingPoints,
  describeQuery,
  finderLayout,
  isExactTrade,
  matchesShape,
  queryToRequest,
  reconcileQuery,
} from '../src/utils/tradeFinderQuery.ts';

/**
 * The finder's ticket is one question with three blanks and a shape. Every
 * prompt a manager brings maps onto a parameter the engine already accepts;
 * these pin the mapping and the roster facts the starting points read.
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

test('the shape row offers 2 for 2, and the first number is what you send', () => {
  const twoForTwo = FINDER_SHAPES.find((shape) => shape.id === '2-2');
  assert.deepEqual(twoForTwo?.sizes, { give: 2, get: 2 });
  const twoForOne = FINDER_SHAPES.find((shape) => shape.id === '2-1');
  assert.deepEqual(twoForOne?.sizes, { give: 2, get: 1 });
});

test('each leg becomes the engine parameter it stands for', () => {
  const request = queryToRequest({
    partnerRosterId: 4,
    send: { kind: 'position', position: 'WR' },
    get: { kind: 'player', id: 'p9' },
    shape: '2-1',
  });
  assert.deepEqual(request, {
    partnerRosterId: 4,
    position: null,
    givePosition: 'WR',
    givePlayerIds: [],
    getPlayerIds: ['p9'],
    shape: { give: 2, get: 1 },
  });
  const upgrade = queryToRequest({ ...EMPTY_QUERY, get: { kind: 'position', position: 'RB' } });
  assert.equal(upgrade.position, 'RB');
  assert.equal(upgrade.givePosition, null);
  assert.equal(upgrade.shape, null);
});

test('a pinned get-player fixes the partner to whoever owns him', () => {
  const teams = [team(1, ['mine'], true), team(2, ['theirs']), team(3, ['other'])];
  const pinned = reconcileQuery({ ...EMPTY_QUERY, get: { kind: 'player', id: 'theirs' } }, teams);
  assert.equal(pinned.partnerRosterId, 2);
  /* Switching to a manager who does not own him drops the player, never the
     manager: the ticket must not ask the engine for an impossible trade. */
  const switched = reconcileQuery({ ...pinned, partnerRosterId: 3 }, teams);
  assert.deepEqual(switched.get, ANY_PICK);
  assert.equal(switched.partnerRosterId, 3);
});

test('every leg exact is a trade to price, not a search', () => {
  const exact = {
    partnerRosterId: 2,
    send: { kind: 'player', id: 'a' },
    get: { kind: 'player', id: 'b' },
    shape: '1-1',
  };
  assert.equal(isExactTrade(exact), true);
  assert.equal(isExactTrade({ ...exact, shape: 'any' }), false, 'any shape allows throw-ins, so it is still a search');
  assert.equal(isExactTrade({ ...exact, send: ANY_PICK }), false);
});

test('a shape filter keeps only that package size', () => {
  const twoForTwo = { give: [{ id: 'a' }, { id: 'b' }], get: [{ id: 'c' }, { id: 'd' }] };
  const oneForOne = { give: [{ id: 'a' }], get: [{ id: 'c' }] };
  assert.equal(matchesShape(twoForTwo, '2-2'), true);
  assert.equal(matchesShape(oneForOne, '2-2'), false);
  assert.equal(matchesShape(oneForOne, 'any'), true);
});

test('the pinned leg is the header, the open leg is the row', () => {
  assert.equal(finderLayout({ ...EMPTY_QUERY, get: { kind: 'player', id: 'x' } }), 'get-player');
  assert.equal(finderLayout({ ...EMPTY_QUERY, send: { kind: 'player', id: 'x' } }), 'send-player');
  assert.equal(finderLayout({ ...EMPTY_QUERY, get: { kind: 'position', position: 'RB' } }), 'open');
});

test('the ask reads back as one sentence', () => {
  const text = describeQuery(
    { partnerRosterId: 2, send: { kind: 'position', position: 'WR' }, get: { kind: 'player', id: 'x' }, shape: '2-1' },
    { partner: 'Hermes Express', getPlayer: 'Bijan Robinson' },
  );
  assert.equal(text, 'With Hermes Express, send a WR, get Bijan Robinson, 2 for 1');
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
  assert.deepEqual(upgrade.query, { get: { kind: 'position', position: 'RB' } });
  assert.match(upgrade.detail, /RB2 projects 6\.0/);

  /* Four receivers for two slots: sell from WR. */
  const sell = points.find((point) => point.id === 'sell-WR');
  assert.ok(sell, 'expected a WR sell');
  assert.deepEqual(sell.query, { send: { kind: 'position', position: 'WR' } });
  assert.match(sell.detail, /carry 4, 2 ride the bench/);

  /* Team 2 is deep at RB and thin at WR: the mirror, with both legs filled. */
  const mirror = points.find((point) => point.id === 'mirror-2');
  assert.ok(mirror, 'expected team 2 as the mirror');
  assert.deepEqual(mirror.query, {
    partnerRosterId: 2,
    send: { kind: 'position', position: 'WR' },
    get: { kind: 'position', position: 'RB' },
  });

  /* Without per-player means there are no facts, so there are no points. */
  assert.deepEqual(deriveStartingPoints({ teams, players, playerMeans: null, rosterPositions }), []);
});
