import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { weekMovement } from '../src/utils/openAnchors.ts';

const SLATE = 'src/components/league/MatchupSlate.tsx';

/**
 * A caption that disagreed with the number above it.
 *
 * The board measured movement from the first snapshot of the same calendar
 * DAY, while the line underneath read "since the week opened". Both looked
 * right in isolation, which is why it survived: the number was real, the
 * sentence was real, and they were describing different spans.
 *
 * It was not a harmless mislabel. Most of a week's movement happens before
 * today, so the figure shown was a fraction of the true one, and a line that
 * moved four points on Wednesday and sat still since showed nothing at all,
 * because the same-day window needed two snapshots to say anything.
 */

test('the board anchors to the week open, not to today', async () => {
  const source = await fs.readFile(path.resolve(SLATE), 'utf8');

  assert.match(
    source,
    /weekMovement\(history \?\? \[\], currentWeek\)/,
    'the slate is no longer reading the shared week-open anchor',
  );
  /* The exact shape of the old bug: a same-calendar-day window. */
  assert.doesNotMatch(
    source,
    /dayKey\(point\.at\) === dayKey\(latest\.at\)/,
    'the same-day movement window is back',
  );
});

test('the caption says percentage points, and says which open', async () => {
  const source = await fs.readFile(path.resolve(SLATE), 'utf8');

  /* Rule 3: never the bare word "points" for anything but fantasy points.
     "moved up 2.1 points" reads as fantasy scoring on a page full of it. */
  assert.match(source, /percentage points since this week's line opened/);
  assert.doesNotMatch(
    source,
    /\$\{Math\.abs\(selectedRow\.summary\.move\)\.toFixed\(1\)\} points/,
    'the caption calls percentage points "points" again',
  );
});

test('a line that moved early still shows a move', async () => {
  /* The case the same-day window silently dropped: one snapshot on Wednesday,
     one today, nothing since. The move is real and belongs on the board. */
  const wednesday = 1_000;
  const today = 500_000;
  const history = [
    {
      computedAt: wednesday,
      week: 5,
      lines: [{ matchupId: 3, sides: { '1': { moneyline: -110, winProbability: 52 }, '2': { moneyline: 110, winProbability: 48 } } }],
    },
    {
      computedAt: today,
      week: 5,
      lines: [{ matchupId: 3, sides: { '1': { moneyline: -140, winProbability: 58 }, '2': { moneyline: 140, winProbability: 42 } } }],
    },
  ];

  const moves = weekMovement(history, 5);
  const home = moves.find((move) => move.rosterId === '1');
  assert.ok(home, 'no movement found across separate days');
  assert.ok(Math.abs(home.movePp - 6) < 1e-9, `expected +6.0pp, got ${home.movePp}`);
});

test('the weekly board asks the weekly question of the title market', async () => {
  const { marketMovement } = await import('../src/utils/openAnchors.ts');

  /* A team can be well up on the season and down on the week. The board is a
     weekly surface, so its movers list must anchor to this week's open, not
     the season's, or it repeats what Futures already says. */
  const history = [
    { computedAt: 1, week: 1, titleOdds: { '1': 900 }, titleProb: { '1': 10 } },
    { computedAt: 2, week: 5, titleOdds: { '1': 300 }, titleProb: { '1': 25 } },
    { computedAt: 3, week: 5, titleOdds: { '1': 400 }, titleProb: { '1': 20 } },
  ];

  const season = marketMovement(history, 'title')[0];
  assert.equal(season.openOdds, 900, 'season anchor moved');
  assert.ok(season.movePp > 0, 'up +10pp across the season');

  const thisWeek = marketMovement(history, 'title', 5)[0];
  assert.equal(thisWeek.openOdds, 300, 'the week anchor is week 5 open, not the season open');
  assert.ok(thisWeek.movePp < 0, 'down 5pp on the week, opposite to the season');
});

test('the closest line is quoted as a price, not as "pts"', async () => {
  const source = await fs.readFile(path.resolve(SLATE), 'utf8');
  /* "1.5 pts" on a page full of fantasy points reads as fantasy scoring. */
  assert.doesNotMatch(source, /winProb - 50\)\.toFixed\(1\)\} pts/);
  assert.match(
    source,
    /formatAmericanOdds\(closestLine\.favorite\.odds\)/,
    'the closest line stopped quoting a price',
  );
  /* And it names both sides now: "closest line, Poseidon" answered half a
     question. The glance card takes the two teams as props and draws each
     with its crest, so the naming is in the arguments rather than inline. */
  assert.match(source, /left=\{closestLine\.left\}/);
  assert.match(source, /right=\{closestLine\.right\}/);
});
