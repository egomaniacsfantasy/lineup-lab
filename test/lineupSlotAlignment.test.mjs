import assert from 'node:assert/strict';
import test from 'node:test';
import { orderStartersBySlot } from '../server/providers/espnProvider.js';

/**
 * A lineup is read positionally: starters[i] occupies rosterPositions[i], and
 * that pairing is the only thing standing between the board and an illegal
 * recommendation.
 *
 * ESPN returns roster entries in its own order rather than slot order. Taken as
 * they arrived, every starter got paired with somebody else's slot label, and
 * the board offered a running back for the D/ST slot: the engine's legality
 * check was working perfectly on a slot label that was a lie.
 */

/* ESPN slot ids: 0 QB, 2 RB, 4 WR, 6 TE, 16 DEF, 17 K, 23 FLEX. */
const QB = 0, RB = 2, WR = 4, TE = 6, DEF = 16, K = 17, FLEX = 23;

test('starters come back in slot order however ESPN hands them over', () => {
  /* Deliberately scrambled, the way a real roster arrives. */
  const scrambled = [
    { id: 'lions', lineupSlotId: DEF },
    { id: 'odunze', lineupSlotId: FLEX },
    { id: 'stafford', lineupSlotId: QB },
    { id: 'fairbairn', lineupSlotId: K },
    { id: 'gibbs', lineupSlotId: RB },
    { id: 'bowers', lineupSlotId: TE },
    { id: 'flowers', lineupSlotId: WR },
    { id: 'montgomery', lineupSlotId: RB },
    { id: 'adams', lineupSlotId: WR },
  ];
  assert.deepEqual(orderStartersBySlot(scrambled), [
    'stafford', 'gibbs', 'montgomery', 'flowers', 'adams', 'bowers', 'lions', 'fairbairn', 'odunze',
  ]);
});

test('the defence lands on the defence slot, which is the whole bug', () => {
  /* rosterPositionsFromCounts emits starter labels in ascending slot id, so
     this is the label list the ordering has to agree with. */
  const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'DEF', 'K', 'FLEX'];
  const position = {
    stafford: 'QB', gibbs: 'RB', montgomery: 'RB', flowers: 'WR',
    adams: 'WR', bowers: 'TE', lions: 'DEF', fairbairn: 'K', odunze: 'WR',
  };
  const ordered = orderStartersBySlot([
    { id: 'lions', lineupSlotId: DEF },
    { id: 'odunze', lineupSlotId: FLEX },
    { id: 'stafford', lineupSlotId: QB },
    { id: 'fairbairn', lineupSlotId: K },
    { id: 'gibbs', lineupSlotId: RB },
    { id: 'bowers', lineupSlotId: TE },
    { id: 'flowers', lineupSlotId: WR },
    { id: 'montgomery', lineupSlotId: RB },
    { id: 'adams', lineupSlotId: WR },
  ]);

  const FLEX_OK = { FLEX: ['RB', 'WR', 'TE'], WRRB_FLEX: ['WR', 'RB'], REC_FLEX: ['WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'] };
  const allows = (slot, pos) => (FLEX_OK[slot] ? FLEX_OK[slot].includes(pos) : slot === pos);

  ordered.forEach((id, index) => {
    assert.ok(
      allows(slots[index], position[id]),
      `${id} (${position[id]}) was placed in the ${slots[index]} slot`,
    );
  });
  assert.equal(ordered[6], 'lions', 'the defence must sit in the DEF slot');
  assert.equal(ordered[7], 'fairbairn', 'the kicker must sit in the K slot');
});

test('two players sharing a slot keep a stable order', () => {
  /* Either back is equally legal in either back slot, but the answer must not
     change between two reads of the same roster. */
  const entries = [
    { id: 'montgomery', lineupSlotId: RB },
    { id: 'gibbs', lineupSlotId: RB },
  ];
  assert.deepEqual(orderStartersBySlot(entries), ['montgomery', 'gibbs']);
  assert.deepEqual(orderStartersBySlot(entries), orderStartersBySlot(entries));
});

test('an empty list is an empty lineup, not a crash', () => {
  assert.deepEqual(orderStartersBySlot([]), []);
  assert.deepEqual(orderStartersBySlot(undefined), []);
});
