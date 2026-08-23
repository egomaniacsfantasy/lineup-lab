import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * When an ESPN league's playoffs start.
 *
 * This was computed as matchupPeriodCount minus playoffMatchupPeriodLength,
 * which is not a meaningful subtraction: the first is how long the regular
 * season runs and the second is how many weeks each playoff ROUND lasts. A
 * fourteen week league with one week rounds resolved to week 13, so the season
 * sim treated two real regular season weeks as playoff weeks and priced every
 * ESPN league on a schedule its members do not play.
 *
 * It is arithmetic on two numbers ESPN hands us, so it is checked here as
 * arithmetic rather than over the network.
 */

const playoffWeekStartFrom = (scheduleSettings = {}) => {
  const regularSeasonWeeks = scheduleSettings.matchupPeriodCount ?? 14;
  return { regularSeasonWeeks, playoffWeekStart: regularSeasonWeeks + 1 };
};

test('playoffs open the week after the regular season ends', () => {
  /* The real settings of a twelve-team league whose playoffs start in week 15. */
  const real = { matchupPeriodCount: 14, playoffMatchupPeriodLength: 1, playoffTeamCount: 8 };
  const { regularSeasonWeeks, playoffWeekStart } = playoffWeekStartFrom(real);
  assert.equal(regularSeasonWeeks, 14);
  assert.equal(playoffWeekStart, 15);
});

test('the length of a playoff round does not move the start of the playoffs', () => {
  /* A two-week final makes the playoffs longer, not earlier. Subtracting it
     was the bug. */
  const oneWeek = playoffWeekStartFrom({ matchupPeriodCount: 14, playoffMatchupPeriodLength: 1 });
  const twoWeek = playoffWeekStartFrom({ matchupPeriodCount: 14, playoffMatchupPeriodLength: 2 });
  assert.equal(oneWeek.playoffWeekStart, twoWeek.playoffWeekStart);
  assert.equal(twoWeek.playoffWeekStart, 15);
});

test('a shorter regular season moves the playoffs earlier, by exactly one week', () => {
  assert.equal(playoffWeekStartFrom({ matchupPeriodCount: 13 }).playoffWeekStart, 14);
  assert.equal(playoffWeekStartFrom({ matchupPeriodCount: 15 }).playoffWeekStart, 16);
});

test('the provider computes it that way and does not paper over a zero', async () => {
  const source = await fs.readFile(path.resolve('server/providers/espnProvider.js'), 'utf8');
  assert.match(source, /const playoffWeekStart = regularSeasonWeeks \+ 1;/);

  /* The old line ended in `|| 15`, which rewrote any zero into a plausible
     looking fifteen. A league whose settings we failed to read then looked
     exactly like a normal one. */
  assert.doesNotMatch(
    source,
    /playoffMatchupPeriodLength[^\n]*\|\| 15/,
    'the playoff start is being defaulted over a failure again',
  );
});
