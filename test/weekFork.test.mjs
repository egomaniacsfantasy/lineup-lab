import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { forkPairs, forkScale } from '../src/utils/forkRows.ts';

const FORK = 'src/components/league/WeekFork.tsx';
const FORK_CSS = 'src/components/league/WeekFork.css';

const TEAMS = {
  '1': { teamName: "Zeus's Bolts", avatarUrl: null },
  '2': { teamName: 'Hermes Express', avatarUrl: 'https://example.test/he.png' },
  '3': { teamName: 'Apollo Archers', avatarUrl: null },
  '4': { teamName: 'Athena Owls', avatarUrl: null },
};

const teamFor = (rosterId) => TEAMS[rosterId] ?? null;

function side(rosterId, nowProb, winProb, lossProb) {
  return { rosterId, nowProb, winProb, lossProb };
}

test('a matchup arrives as one pair, not two loose rows', () => {
  const [pair] = forkPairs(
    [{ matchupId: 801, importance: 94, sides: [side('1', 75, 88, 61), side('2', 64, 79, 47)] }],
    teamFor,
    '1',
  );

  assert.equal(pair.matchupId, 801);
  assert.equal(pair.sides.length, 2);
  assert.deepEqual(
    pair.sides.map((entry) => entry.teamName),
    ["Zeus's Bolts", 'Hermes Express'],
  );
  /* The crest has to survive the mapping or the strip draws twelve identical
     grey discs where the identities should be. */
  assert.equal(pair.sides[1].avatarUrl, 'https://example.test/he.png');
  assert.equal(pair.sides[0].isUser, true);
  assert.equal(pair.sides[1].isUser, false);
});

test('a side nobody can name takes its whole matchup with it', () => {
  /* Half a fork is not a fork. Drawing one bar of a pair states that a team
     gains from a game without saying who it is playing, and the empty half of
     that column reads as a bye. */
  const pairs = forkPairs(
    [
      { matchupId: 801, importance: 90, sides: [side('1', 75, 88, 61), side('99', 40, 55, 25)] },
      { matchupId: 802, importance: 80, sides: [side('3', 85, 93, 75), side('4', 43, 62, 26)] },
    ],
    teamFor,
    null,
  );

  assert.deepEqual(
    pairs.map((pair) => pair.matchupId),
    [802],
  );
});

test('anything that is not two-sided is dropped rather than half-drawn', () => {
  const pairs = forkPairs(
    [
      { matchupId: 801, importance: 90, sides: [side('1', 75, 88, 61)] },
      { matchupId: 802, importance: 80, sides: [] },
    ],
    teamFor,
    null,
  );

  assert.deepEqual(pairs, []);
});

test('one ruler across the week, set by the biggest single branch', () => {
  /* The failure this guards: scaling each game to its own range. Under that
     bug the quiet game and the season-defining one draw identical bars, which
     is the exact opposite of what the graphic is for. */
  const quiet = { matchupId: 1, importance: 10, sides: [side('1', 50, 52, 48), side('2', 50, 52, 48)] };
  const huge = { matchupId: 2, importance: 100, sides: [side('3', 50, 80, 20), side('4', 50, 80, 20)] };

  const { reach, leg } = forkScale([quiet, huge]);
  assert.equal(reach, 30, 'the ruler is the biggest branch, rounded up to a five');

  const quietLeg = leg(52 - 50);
  const hugeLeg = leg(80 - 50);
  assert.ok(hugeLeg > quietLeg * 10, `quiet ${quietLeg} should be dwarfed by huge ${hugeLeg}`);
  assert.equal(hugeLeg, 50, 'the biggest branch fills its half of the track exactly');
});

test('a week with nothing at stake does not magnify noise into drama', () => {
  const flat = { matchupId: 1, importance: 0, sides: [side('1', 50, 50.4, 49.6), side('2', 50, 50.4, 49.6)] };
  const { reach, leg } = forkScale([flat]);

  assert.equal(reach, 5, 'the floor holds');
  assert.ok(leg(0.4) < 5, `a 0.4 point branch should stay tiny, drew ${leg(0.4)}`);
});

test('up and down legs are measured against the same ruler', () => {
  const { leg } = forkScale([
    { matchupId: 1, importance: 50, sides: [side('1', 60, 75, 40), side('2', 40, 60, 25)] },
  ]);
  /* A 20 point gain and a 20 point loss must draw the same length, or the
     asymmetry the split bar exists to show becomes an artefact of the scale. */
  assert.equal(leg(20), leg(-20));
});

test('the strip carries no header and no explainer paragraph', async () => {
  const source = await fs.readFile(path.resolve(FORK), 'utf8');

  /* This sits above the board. A title, a subtitle and a closing paragraph
     spent about a hundred pixels restating what the axis label and the
     colours already say, on the one surface whose job is to not push the
     board down the page. */
  assert.doesNotMatch(source, /week-fork__head\b/, 'the header block is back');
  assert.doesNotMatch(source, /week-fork__foot\b/, 'the explainer paragraph is back');
  assert.doesNotMatch(source, /<h2/, 'the strip grew a heading again');
  /* What replaced them, in the gutter that was empty anyway. */
  assert.match(source, /week-fork__axis-label/);
  assert.match(source, /week-fork__key-item/);
});

test('league size costs width, never height', async () => {
  const css = await fs.readFile(path.resolve(FORK_CSS), 'utf8');

  /* The bug this replaced: one horizontal row per team, so a twelve team
     league rendered a five hundred pixel wall above the board. Games lay out
     along a row now, and the track height is a fixed value rather than
     anything that multiplies by team count. */
  assert.match(css, /\.week-fork__games\s*\{[^}]*display:\s*flex/);
  assert.match(css, /--fork-track:\s*\d+px/);
  /* And on a phone it wraps instead of scrolling sideways: a strip running off
     the edge hides half the week behind a gesture nobody knows is there. */
  assert.match(css, /\.week-fork__games\s*\{[^}]*flex-wrap:\s*wrap/);
});
