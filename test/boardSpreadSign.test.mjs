import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { spreadLabel, teamsFor } from '../src/utils/boardSides.ts';

/**
 * The favourite lays the points.
 *
 * A board that quotes a team at -113 and +2.9 in the same row is not a board;
 * it is two numbers that happen to be near each other. This is what shipped,
 * and the cause was not the sign flip - that was right - but the seating. The
 * card seats the favourite on the left whichever letter it arrived as, and
 * the left cell was reading matchup.teamASpread regardless. Every game where
 * team B was favoured printed both lines backwards.
 *
 * So the fixture below has team B as the favourite. A version of this test
 * built on a team-A favourite would pass against the bug it exists to catch.
 */

/* B is favoured: shorter price, positive margin. */
const B_FAVOURED = {
  matchupId: 1,
  teamA: 'Adam’s Astounding Team',
  teamARecord: '0-0',
  teamAOdds: 113,
  teamAWinProb: 46.9,
  teamASpread: -2.9,
  teamB: 'Sonic and Knuckles',
  teamBRecord: '0-0',
  teamBOdds: -113,
  teamBWinProb: 53.1,
  teamBSpread: 2.9,
  totalProjection: 239.5,
  isUserGame: false,
};

test('the seated favourite carries its own line, not team A’s', () => {
  const { left, right } = teamsFor(B_FAVOURED);

  /* The swap happened, so the assertions below are about the swapped case. */
  assert.equal(left.side, 'b', 'the shorter price is not on the left; the fixture no longer tests the swap');
  assert.equal(left.name, 'Sonic and Knuckles');

  assert.equal(left.spread, 2.9, 'the favourite is carrying the underdog’s margin');
  assert.equal(right.spread, -2.9);

  assert.equal(spreadLabel(left.spread), '-2.9', 'a -113 favourite is being quoted as an underdog');
  assert.equal(spreadLabel(right.spread), '+2.9');
});

test('the side laying the points is the side with the shorter price', () => {
  for (const matchup of [B_FAVOURED, { ...B_FAVOURED, isUserGame: true, teamAIsUser: true }]) {
    const { left, right } = teamsFor(matchup);
    for (const [side, other] of [
      [left, right],
      [right, left],
    ]) {
      if (side.odds >= other.odds) continue;
      assert.ok(
        spreadLabel(side.spread).startsWith('-'),
        `${side.name} is the favourite at ${side.odds} but quoted ${spreadLabel(side.spread)}`,
      );
    }
  }
});

test('a pick’em says PK and a missing line says nothing', () => {
  assert.equal(spreadLabel(0), 'PK');
  assert.equal(spreadLabel(undefined), '');
  /* Never a dash: an empty cell is a line that was not posted, a dash reads
     as one we are withholding. */
  assert.doesNotMatch(spreadLabel(undefined), /[-–—]/);
});

test('the card reads the spread off the seated team, never off the letter', async () => {
  const source = await fs.readFile(
    path.resolve('src/components/league/MatchupSlate.tsx'),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /matchup\.team[AB]Spread/,
    'the board is reading a spread by letter again, which breaks every game where B is favoured',
  );
  assert.match(source, /spreadLabel\(side\.spread\)/);
});
