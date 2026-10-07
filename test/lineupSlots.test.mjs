import assert from 'node:assert/strict';
import test from 'node:test';
import { assignStartersToSlots, slotAccepts } from '../src/utils/lineupSlots.ts';

/**
 * Which starter sits in which slot.
 *
 * The defect: both providers drop a slot nobody filled (Sleeper strips the '0',
 * ESPN has no entry), and the app labelled starters by their position in that
 * array. A manager whose quarterback was on bye saw his running back in the QB
 * row, every row below it shifted up one, and a "no starter" row stranded at
 * the bottom under the kicker.
 */

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const p = (id, position) => ({ id, position });
const positionOf = (player) => player.position;
const layout = (rows) => rows.map((row) => `${row.slotLabel}:${row.starter?.id ?? '-'}`);

test('a full lineup lands exactly where it was set', () => {
  const starters = [
    p('qb', 'QB'), p('rb1', 'RB'), p('rb2', 'RB'), p('wr1', 'WR'), p('wr2', 'WR'),
    p('te', 'TE'), p('flex', 'WR'), p('k', 'K'), p('def', 'DEF'),
  ];
  assert.deepEqual(layout(assignStartersToSlots(starters, SLOTS, positionOf)), [
    'QB:qb', 'RB:rb1', 'RB:rb2', 'WR:wr1', 'WR:wr2', 'TE:te', 'FLEX:flex', 'K:k', 'DEF:def',
  ]);
});

test('a quarterback on bye leaves the QB slot empty, and nothing below it moves', () => {
  /* The reported bug, exactly: no QB started, so the provider sends eight
     players for nine slots. */
  const starters = [
    p('rb1', 'RB'), p('rb2', 'RB'), p('wr1', 'WR'), p('wr2', 'WR'),
    p('te', 'TE'), p('flex', 'RB'), p('k', 'K'), p('def', 'DEF'),
  ];
  assert.deepEqual(layout(assignStartersToSlots(starters, SLOTS, positionOf)), [
    'QB:-', 'RB:rb1', 'RB:rb2', 'WR:wr1', 'WR:wr2', 'TE:te', 'FLEX:flex', 'K:k', 'DEF:def',
  ]);
});

test('a gap in the middle stays in the middle', () => {
  /* One running back short: the hole belongs at RB2, not at the end. */
  const starters = [
    p('qb', 'QB'), p('rb1', 'RB'), p('wr1', 'WR'), p('wr2', 'WR'),
    p('te', 'TE'), p('flex', 'WR'), p('k', 'K'), p('def', 'DEF'),
  ];
  assert.deepEqual(layout(assignStartersToSlots(starters, SLOTS, positionOf)), [
    'QB:qb', 'RB:rb1', 'RB:-', 'WR:wr1', 'WR:wr2', 'TE:te', 'FLEX:flex', 'K:k', 'DEF:def',
  ]);
});

test('the flex takes what the strict slots did not', () => {
  /* Three running backs and one flex: two fill RB, the third is the flex, and
     it holds even when the league lists its flex first. */
  const starters = [p('rb1', 'RB'), p('rb2', 'RB'), p('rb3', 'RB')];
  assert.deepEqual(layout(assignStartersToSlots(starters, ['FLEX', 'RB', 'RB'], positionOf)), [
    'FLEX:rb3', 'RB:rb1', 'RB:rb2',
  ]);
});

test('a superflex can hold the quarterback, a plain flex cannot', () => {
  const starters = [p('qb1', 'QB'), p('qb2', 'QB')];
  assert.deepEqual(layout(assignStartersToSlots(starters, ['QB', 'SUPER_FLEX'], positionOf)), [
    'QB:qb1', 'SUPER_FLEX:qb2',
  ]);
  /* A second quarterback has nowhere legal to go in a plain flex league, and
     must still be on screen somewhere rather than silently dropped. */
  const plain = assignStartersToSlots(starters, ['QB', 'FLEX'], positionOf);
  assert.equal(plain.filter((row) => row.starter != null).length, 2, 'a starter vanished');
});

test('no starter is ever dropped, whatever the slots say', () => {
  /* A player with an unknown position, and more starters than slots. */
  const starters = [p('qb', 'QB'), p('mystery', 'LB'), p('rb', 'RB'), p('extra', 'WR')];
  const rows = assignStartersToSlots(starters, ['QB', 'RB'], positionOf);
  const shown = rows.map((row) => row.starter?.id).filter(Boolean).sort();
  assert.deepEqual(shown, ['extra', 'mystery', 'qb', 'rb'], 'a starter is missing from the board');
});

test('slot eligibility is the product rule, not a guess', () => {
  assert.equal(slotAccepts('QB', 'RB'), false);
  assert.equal(slotAccepts('FLEX', 'QB'), false);
  assert.equal(slotAccepts('FLEX', 'TE'), true);
  assert.equal(slotAccepts('SUPER_FLEX', 'QB'), true);
  assert.equal(slotAccepts('WRRB_FLEX', 'TE'), false);
  assert.equal(slotAccepts('BN', 'QB'), true, 'an unmapped slot must not block everything');
  assert.equal(slotAccepts('QB', undefined), false);
});
