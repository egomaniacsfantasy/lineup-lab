import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRead,
  getWords,
  lineupSlots,
  netWords,
  sendRead,
  sendWords,
  sidePerGame,
  slotLabels,
  slotOf,
  weakestStarter,
} from '../src/utils/tradeSlip.ts';

/**
 * The slip reads the lineup the provider serves, not a ranking. The first
 * version ranked a roster by value and called your WR1 "from your bench"
 * because a bench receiver projected higher, two inches from a Slot column
 * that said WR1. Every read here has to agree with that column.
 */

const ROSTER_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN'];

const players = {
  qb1: { id: 'qb1', name: 'Patrick Mahomes', team: 'KC', position: 'QB', status: null, injuryStatus: null },
  rb1: { id: 'rb1', name: 'Derrick Henry', team: 'BAL', position: 'RB', status: null, injuryStatus: null },
  rb2: { id: 'rb2', name: 'Bijan Robinson', team: 'ATL', position: 'RB', status: null, injuryStatus: null },
  rb3: { id: 'rb3', name: 'Saquon Barkley', team: 'PHI', position: 'RB', status: null, injuryStatus: null },
  wr1: { id: 'wr1', name: 'Justin Jefferson', team: 'MIN', position: 'WR', status: null, injuryStatus: null },
  wr2: { id: 'wr2', name: 'CeeDee Lamb', team: 'DAL', position: 'WR', status: null, injuryStatus: null },
  wr3: { id: 'wr3', name: 'Terry McLaurin', team: 'WAS', position: 'WR', status: null, injuryStatus: null },
  wr4: { id: 'wr4', name: 'DeVonta Smith', team: 'PHI', position: 'WR', status: null, injuryStatus: null },
  te1: { id: 'te1', name: 'Travis Kelce', team: 'KC', position: 'TE', status: null, injuryStatus: null },
  te2: { id: 'te2', name: 'Trey McBride', team: 'ARI', position: 'TE', status: null, injuryStatus: null },
  k1: { id: 'k1', name: 'Brandon Aubrey', team: 'DAL', position: 'K', status: null, injuryStatus: null },
  d1: { id: 'd1', name: 'San Francisco 49ers', team: 'SF', position: 'DEF', status: null, injuryStatus: null },
  ir1: { id: 'ir1', name: 'Joe Burrow', team: 'CIN', position: 'QB', status: null, injuryStatus: null },
  // Theirs.
  gibbs: { id: 'gibbs', name: 'Jahmyr Gibbs', team: 'DET', position: 'RB', status: null, injuryStatus: null },
  london: { id: 'london', name: 'Drake London', team: 'ATL', position: 'WR', status: null, injuryStatus: null },
  nacua: { id: 'nacua', name: 'Puka Nacua', team: 'LAR', position: 'WR', status: null, injuryStatus: null },
};

/* Jefferson starts at WR1 on 16.0 while DeVonta Smith sits on the bench on
   16.8: a value ranking would call the bench player the starter. */
const values = {
  qb1: { mean: 21.4 }, rb1: { mean: 12.1 }, rb2: { mean: 19.4 }, rb3: { mean: 9.9 },
  wr1: { mean: 16.0 }, wr2: { mean: 32.5 }, wr3: { mean: 14.3 }, wr4: { mean: 16.8 },
  te1: { mean: 20.5 }, te2: { mean: 17.5 }, k1: { mean: 4.9 }, d1: { mean: 4.9 }, ir1: { mean: 10.6 },
  gibbs: { mean: 16.6 }, london: { mean: 6.1 }, nacua: { mean: 18.9 },
};

const you = {
  players: ['qb1', 'rb1', 'rb2', 'rb3', 'wr1', 'wr2', 'wr3', 'wr4', 'te1', 'te2', 'k1', 'd1', 'ir1'],
  starters: ['qb1', 'rb1', 'rb2', 'wr1', 'wr2', 'te1', 'wr3', 'k1', 'd1'],
  reserve: ['ir1'],
};

const slots = lineupSlots(you, ROSTER_POSITIONS);

test('slots are named the way a manager says them, and bench slots are not slots', () => {
  assert.deepEqual(slotLabels(ROSTER_POSITIONS), ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX', 'K', 'DEF']);
  assert.deepEqual(slotLabels(['QB', 'WR', 'BN']), ['QB', 'WR']);
});

test('the lineup comes from the provider: the nth starter holds the nth slot', () => {
  assert.equal(slots.get('wr1'), 'WR1');
  assert.equal(slots.get('wr3'), 'FLEX');
  assert.equal(slots.get('wr4'), undefined);
  /* An empty seat in the provider's list is skipped, not given a slot. */
  const gapped = lineupSlots({ starters: ['qb1', '0', 'rb2'] }, ROSTER_POSITIONS);
  assert.equal(gapped.get('rb2'), 'RB2');
  assert.equal(gapped.has('0'), false);
});

test('a player who does not start is on the bench, or on reserve', () => {
  assert.equal(slotOf('wr4', slots, you), 'Bench');
  assert.equal(slotOf('ir1', slots, you), 'IR');
  assert.equal(slotOf('wr1', slots, you), 'WR1');
});

test('the thinnest starter is the lowest-ranked one at a priced position', () => {
  const outlooks = new Map([
    ['qb1', { perGame: 21.4, positionRank: 3, position: 'QB' }],
    ['rb1', { perGame: 12.1, positionRank: 4, position: 'RB' }],
    ['rb2', { perGame: 19.4, positionRank: 2, position: 'RB' }],
    ['wr1', { perGame: 16.0, positionRank: 4, position: 'WR' }],
    ['wr2', { perGame: 32.5, positionRank: 1, position: 'WR' }],
    ['wr3', { perGame: 14.3, positionRank: 6, position: 'WR' }],
    ['te1', { perGame: 20.5, positionRank: 1, position: 'TE' }],
    /* A kicker ranked last at his position is not where a trade starts. */
    ['k1', { perGame: 4.9, positionRank: 30, position: 'K' }],
  ]);
  const thin = weakestStarter(you, players, outlooks, slots);
  assert.equal(thin?.id, 'wr3');
  assert.equal(thin?.slot, 'FLEX');
  assert.equal(thin?.rank, 6);
  assert.equal(weakestStarter(you, players, null, slots), null);
});

test('sending a starter names the slot his manager has him in, not where a ranking would put him', () => {
  const read = sendRead('wr1', you, slots, ['wr1'], players, values);
  assert.equal(read.slot, 'WR1');
  /* DeVonta Smith is the best bench receiver, so he is who starts instead. */
  assert.equal(read.replacement?.id, 'wr4');
  assert.equal(sendWords(read), 'Your WR1. DeVonta Smith starts instead (16.8).');
});

test('a flex starter can be replaced by any flex-eligible bench player', () => {
  const read = sendRead('wr3', you, slots, ['wr3'], players, values);
  assert.equal(read.slot, 'FLEX');
  /* McBride (17.5) beats Smith (16.8) for the flex. */
  assert.equal(read.replacement?.id, 'te2');
});

test('a replacement is never someone else in the deal, or on reserve', () => {
  const read = sendRead('wr1', you, slots, ['wr1', 'wr4'], players, values);
  assert.equal(read.replacement, null);
  assert.equal(sendWords(read), 'Your WR1, with nobody on the bench to take it.');
  const qb = sendRead('qb1', you, slots, ['qb1'], players, values);
  assert.equal(qb.replacement, null, 'Burrow is on IR');
});

test('sending a bench player says so', () => {
  const read = sendRead('wr4', you, slots, ['wr4'], players, values);
  assert.equal(read.slot, 'bench');
  assert.equal(sendWords(read), 'From your bench.');
});

test('an incoming player fills the slot a sent player vacated', () => {
  const read = getRead('london', you, slots, ['wr1'], ['london'], players, values);
  assert.equal(read.kind, 'starts');
  assert.equal(read.slot, 'WR1');
  assert.equal(read.displaced, null);
  assert.equal(getWords(read), 'Starts at WR1.');
});

test('with no slot vacated, he wins the weakest starter\'s slot only if he is worth more', () => {
  const gibbs = getRead('gibbs', you, slots, ['wr4'], ['gibbs'], players, values);
  assert.equal(gibbs.kind, 'starts');
  assert.equal(gibbs.slot, 'RB1', 'Henry on 12.1 is the weaker starter, so that is the slot');
  assert.equal(gibbs.displaced?.id, 'rb1');
  assert.equal(getWords(gibbs), 'Starts at RB1. Derrick Henry to the bench.');

  const london = getRead('london', you, slots, ['rb3'], ['london'], players, values);
  assert.equal(london.kind, 'bench');
  assert.equal(london.behind?.id, 'wr1', 'Jefferson on 16.0 is the weakest starting receiver');
  assert.equal(getWords(london), 'Bench, behind Justin Jefferson (16.0).');
});

test('two incoming players at one position are seated best first', () => {
  const nacua = getRead('nacua', you, slots, ['wr1'], ['nacua', 'london'], players, values);
  assert.equal(nacua.slot, 'WR1', 'the better receiver takes the vacated slot');
  const london = getRead('london', you, slots, ['wr1'], ['nacua', 'london'], players, values);
  assert.equal(london.kind, 'bench');
  /* The slot Nacua filled is gone, so London is read against the kept starters. */
  assert.equal(london.behind?.id, 'wr2');
});

test('a kicker or a defence gets no lineup read', () => {
  assert.equal(getRead('k1', you, slots, [], ['k1'], players, values).kind, null);
  assert.equal(getWords(getRead('k1', you, slots, [], ['k1'], players, values)), null);
});

test('the weight of the deal reads in per-game points, neither side coloured', () => {
  assert.equal(sidePerGame(['wr1', 'wr3'], values), 30.3);
  assert.equal(sidePerGame(['nobody'], values), null);
  assert.equal(sidePerGame(['wr1'], null), null);
  assert.equal(netWords(6.1, 14.3), 'You send 8.2 more per game.');
  assert.equal(netWords(14.3, 6.1), 'You get 8.2 more per game.');
  assert.equal(netWords(10, 10.04), 'Even per game.');
  assert.equal(netWords(null, 10), null);
});
