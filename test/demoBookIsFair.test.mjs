import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * The demo league is the only league anyone sees before they connect one, and
 * since the futures board moved onto the marketing page it is the most
 * screenshottable thing we publish. So it has to be a book the engine could
 * actually have produced.
 *
 * `probToAmerican` in server/engine/engine.js charges no vig. That is the
 * whole constraint: a fair book's prices imply exactly the number of outcomes
 * available. One champion, two finalists, six playoff teams. The board that
 * shipped here before implied 144.3% on the title market, which is 44 points
 * of overround we do not charge and do not model, and 4.92 of 6 playoff seats.
 */

const impliedProbability = (american) =>
  american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);

async function board() {
  const source = await fs.readFile(path.resolve('src/mocks/league.ts'), 'utf8');
  const start = source.indexOf('export const MOCK_LEAGUE_FUTURES');
  const block = source.slice(start, source.indexOf('\n];', start));
  const column = (key) =>
    [...block.matchAll(new RegExp(`${key}: (-?[0-9.]+)`, 'g'))].map((m) => Number(m[1]));
  const records = [...block.matchAll(/record: .(\d+)-(\d+)./g)].map((m) => [+m[1], +m[2]]);
  return { column, records, teams: column('avgSeed').length };
}

const total = (values) => values.reduce((a, b) => a + b, 0);

test('the demo book prices exactly one champion, two finalists and six playoff teams', async () => {
  const { column, teams } = await board();
  assert.equal(teams, 12, 'the demo league is twelve teams');

  /* Tolerance is one rounding step per team: American odds are integers, so a
     perfectly fair set of probabilities still lands a fraction of a point off. */
  const markets = [
    { key: 'championOdds', outcomes: 1, name: 'title' },
    { key: 'finalsOdds', outcomes: 2, name: 'finals' },
    { key: 'playoffOdds', outcomes: 6, name: 'playoff' },
  ];
  for (const { key, outcomes, name } of markets) {
    const implied = total(column(key).map(impliedProbability));
    assert.ok(
      Math.abs(implied - outcomes) < 0.02,
      `${name} market implies ${(implied * 100).toFixed(2)}% of book, not ${outcomes * 100}%: that is ${((implied - outcomes) * 100).toFixed(1)} points of vig the engine does not charge`,
    );
  }
});

test('playoffProb is the same number as playoffOdds, not a second opinion', async () => {
  const { column } = await board();
  const fromOdds = column('playoffOdds').map((o) => impliedProbability(o) * 100);
  const stated = column('playoffProb');
  fromOdds.forEach((value, index) => {
    assert.ok(
      Math.abs(value - stated[index]) <= 0.6,
      `row ${index} quotes ${stated[index]}% but prices ${value.toFixed(1)}%`,
    );
  });
});

test('a team is likelier to make the playoffs than the final, and the final than the title', async () => {
  const { column } = await board();
  const [playoff, finals, title] = ['playoffOdds', 'finalsOdds', 'championOdds'].map((key) =>
    column(key).map(impliedProbability),
  );
  playoff.forEach((p, index) => {
    assert.ok(p >= finals[index], `row ${index} makes the final more often than the playoffs`);
    assert.ok(finals[index] >= title[index], `row ${index} wins the title more often than it reaches the final`);
  });
});

test('the demo league played a season that could have happened', async () => {
  const { records, column } = await board();
  const wins = total(records.map((r) => r[0]));
  const losses = total(records.map((r) => r[1]));
  assert.equal(wins, losses, `records total ${wins}-${losses}; every win in a league is someone else's loss`);

  /* Fourteen regular season games across twelve teams. */
  assert.ok(
    Math.abs(total(column('projWins')) - 84) < 0.05,
    `projected wins total ${total(column('projWins')).toFixed(1)}, not 84`,
  );
  /* Seeds one through twelve average 6.5, whatever the standings look like. */
  const meanSeed = total(column('avgSeed')) / records.length;
  assert.ok(Math.abs(meanSeed - 6.5) < 0.05, `average seed averages ${meanSeed.toFixed(2)}, not 6.5`);
});
