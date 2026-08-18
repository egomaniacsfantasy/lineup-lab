import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';

/**
 * You compare two players because you are choosing between them for one slot,
 * so the only useful partners are the ones that could take that slot. Before
 * this, every starter was pickable against every other: a quarterback could be
 * weighed against a kicker, which answers a question nobody asked.
 *
 * The rules live in MatchupPage as a table. This pins the table itself, since
 * the failure mode is silent — a wrong entry just offers a comparison that
 * makes no sense, and nothing errors.
 */
const source = await fsp.readFile('src/pages/MatchupPage.tsx', 'utf8');

function eligibilityTable() {
  const block = source.match(/const SLOT_ELIGIBILITY[^=]*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(block, 'SLOT_ELIGIBILITY table not found');
  const table = {};
  for (const line of block[1].split('\n')) {
    const match = line.match(/^\s*([A-Z_]+):\s*\[([^\]]*)\]/);
    if (!match) continue;
    table[match[1]] = match[2]
      .split(',')
      .map((entry) => entry.trim().replace(/['"]/g, ''))
      .filter(Boolean);
  }
  return table;
}

test('a dedicated slot only accepts its own position', () => {
  const table = eligibilityTable();
  for (const position of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
    assert.deepEqual(
      table[position],
      [position],
      `${position} should accept only ${position}`,
    );
  }
});

test('flex slots accept exactly the positions they are named for', () => {
  const table = eligibilityTable();
  assert.deepEqual(table.FLX, ['RB', 'WR', 'TE']);
  assert.deepEqual(table.FLEX, ['RB', 'WR', 'TE']);
  assert.deepEqual(table.WRRB_FLEX, ['RB', 'WR']);
  assert.deepEqual(table.REC_FLEX, ['WR', 'TE']);
  assert.deepEqual(table.SUPER_FLEX, ['QB', 'RB', 'WR', 'TE']);
  /* A quarterback belongs in a superflex and nowhere else among the flexes.
     Getting this wrong offers a QB against a tight end and reads as a bug. */
  for (const slot of ['FLX', 'FLEX', 'WRRB_FLEX', 'REC_FLEX']) {
    assert.ok(!table[slot].includes('QB'), `${slot} must not accept QB`);
    assert.ok(!table[slot].includes('DEF'), `${slot} must not accept DEF`);
    assert.ok(!table[slot].includes('K'), `${slot} must not accept K`);
  }
});

test('an unmapped slot stays open rather than blocking everything', () => {
  /* A bench row or a league with a custom slot has no entry, and defaulting to
     "accepts nothing" would dim the whole lineup with no way to tell why. */
  assert.match(
    source,
    /if \(!accepted\) return true;/,
    'slotAccepts must fall open for slots it does not know',
  );
});

test('eligibility is checked in both directions', () => {
  /* One-way would let a flex running back be picked against a quarterback in a
     superflex: the superflex accepts the RB, but the RB slot does not accept
     the QB. Both have to hold. */
  assert.match(
    source,
    /return slotAccepts\(slotA, positionB\) && slotAccepts\(slotB, positionA\);/,
  );
});
