import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const PAGE = 'src/pages/MatchupPage.tsx';

/**
 * Starting a comparison from the bench used to be a dead end.
 *
 * The first pick is what sets `compareSlot`, and every starter card is gated
 * on `compareSlot != null`. The bench call site passed no slot label, so
 * picking a bench player first left it null and disabled every starter on the
 * page. Measured in the browser before the fix: nine starter buttons, nine
 * disabled, none pickable.
 *
 * Starting from a starter worked, which is exactly backwards — a start/sit
 * question usually begins with the bench player you are tempted by.
 *
 * A bench player's slot context is their position, which is a real key in
 * SLOT_ELIGIBILITY. After the fix, picking bench RB Barkley leaves exactly the
 * two RB starters pickable and correctly disables the QB, WRs, TE, K and DEF.
 */

test('the bench passes a slot label when it starts a comparison', async () => {
  const source = await fs.readFile(path.resolve(PAGE), 'utf8');

  assert.match(
    source,
    /onClick=\{\(\) => handleComparePick\(player, isLineupSlot \? slotLabel : player\.position\)\}/,
    'the bench call site is passing no slot label again, which leaves compareSlot '
      + 'null and disables every starter card',
  );

  /* The bare form is the bug. If it comes back anywhere, the dead end is back. */
  assert.doesNotMatch(
    source,
    /handleComparePick\(player\)\s*\}/,
    'handleComparePick is being called without a slot label',
  );
});

test('the starter gate still depends on compareSlot being set', async () => {
  const source = await fs.readFile(path.resolve(PAGE), 'utf8');
  /* This is the other half of the pair. If this gate is ever removed the test
     above stops meaning anything, so it is asserted rather than assumed —
     otherwise a future edit could make the first assertion vacuous. */
  assert.match(
    source,
    /compareSlot != null &&\s*\n\s*slotsAreComparable\(/,
    'the starter eligibility gate moved or changed shape',
  );
});

test('a slot label is only skipped for rows that have no slot', async () => {
  const source = await fs.readFile(path.resolve(PAGE), 'utf8');
  /* isLineupSlot is what tells a starter row from a bench row. If it stops
     being derived from the tone, the conditional above silently picks wrong. */
  assert.match(
    source,
    /const isLineupSlot = tone === 'starter';/,
    'isLineupSlot is no longer derived from the row tone',
  );
});
