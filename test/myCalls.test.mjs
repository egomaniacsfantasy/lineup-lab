import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { isMyCallValue, myCallDirection, myCallLabel } from '../src/utils/myCalls.ts';

test('unrated players never flag as calls', () => {
  for (const value of [null, undefined, '', '50', 'not-a-number']) {
    assert.equal(isMyCallValue(value), false, `value ${JSON.stringify(value)} must not be a call`);
    assert.equal(myCallLabel(value), null, `value ${JSON.stringify(value)} must not render a chip`);
  }
});

test('saved off-50 ratings flag with the right direction', () => {
  assert.equal(myCallLabel('80'), 'YOU ▲');
  assert.equal(myCallLabel('51'), 'YOU ▲');
  assert.equal(myCallLabel('20'), 'YOU ▼');
  assert.equal(myCallLabel('49'), 'YOU ▼');
  assert.equal(myCallDirection('80'), 'up');
  assert.equal(myCallDirection('20'), 'down');
});

test('influence-chip count always equals the My calls count', () => {
  const agreeSaved = { a: '80', b: '50', c: '20', d: '', e: '65' };
  const playerIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const chipCount = playerIds.filter((id) => myCallLabel(agreeSaved[id] ?? '') != null).length;
  const myCallsCount = playerIds.filter((id) => isMyCallValue(agreeSaved[id] ?? '')).length;
  assert.equal(chipCount, myCallsCount);
  assert.equal(myCallsCount, 3);
});

test('board surfaces derive markers from the one shared util', async () => {
  const boardSource = await fs.readFile(new URL('../src/pages/MyBoardPage.tsx', import.meta.url), 'utf8');
  const loopSource = await fs.readFile(new URL('../src/pages/DesignBoardLoopPage.tsx', import.meta.url), 'utf8');
  assert.match(boardSource, /from '\.\.\/utils\/myCalls'/, 'MyBoardPage must import the shared myCalls util');
  assert.match(loopSource, /from '\.\.\/utils\/myCalls'/, 'DesignBoardLoopPage must import the shared myCalls util');
  for (const [name, source] of [['MyBoardPage', boardSource], ['DesignBoardLoopPage', loopSource]]) {
    assert.doesNotMatch(
      source,
      /function (isMyCallValue|myCallDirection|myCallLabel)/,
      `${name} must not redefine my-call marker logic locally`,
    );
    assert.doesNotMatch(source, /'YOU [▲▼]'/, `${name} must not hand-roll YOU chips`);
  }
});
