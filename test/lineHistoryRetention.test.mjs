import assert from 'node:assert/strict';
import test from 'node:test';
import { retain } from '../server/engine/lineStore.js';
import { stampReason } from '../server/scheduler.js';

/**
 * How long the book's history is kept, and what is worth recording.
 *
 * The futures chart offers Week, Month and Season, and the Time Machine offers
 * any prior week. The store kept "the last 200 entries", which at the rate they
 * were being written was eleven days, so Month showed eleven days, Season
 * showed eleven days, and "opened at" quietly meant "the oldest snapshot still
 * on disk" rather than where the book opened. The app was offering a range it
 * could not fill.
 *
 * Measured on production before the change: 200 entries exactly, spanning 15.5
 * days, every one of them written by the scheduler, with a median gap of 28
 * minutes against a six-hour cadence. The writer was the boot pass - a restart
 * is not a repricing event, and deploys run several times a day.
 */

const DAY = 24 * 60 * 60_000;
const at = (daysAgo, now) => ({ computedAt: now - daysAgo * DAY });

test('a season of history survives, because the app offers a season', () => {
  const now = Date.parse('2026-12-20T12:00:00Z');
  /* Opening day through to now, one a day, plus in-game points. */
  const history = [];
  for (let day = 120; day >= 0; day -= 1) history.push(at(day, now));
  const kept = retain(history, now);
  assert.equal(kept.length, history.length, 'a season of daily points was trimmed');
  assert.equal(kept[0].computedAt, history[0].computedAt, 'the season opener was trimmed');
});

test('the opening entry is never dropped, however old it gets', () => {
  /* "Opened at / now" and Your Ticket's multiple are measured from it. Trimmed,
     those numbers do not go missing: they start quoting a later snapshot as the
     open, which still reads like a fact. */
  const now = Date.parse('2027-06-01T12:00:00Z');
  const history = [at(500, now), at(450, now), at(3, now), at(0, now)];
  const kept = retain(history, now);
  assert.equal(kept[0].computedAt, history[0].computedAt, 'the opener was trimmed');
  assert.ok(!kept.some((entry) => entry.computedAt === history[1].computedAt), 'last season was kept');
});

test('nothing is written just because the server restarted', () => {
  /* The defect, stated as a test: a boot 20 minutes after the last point, on a
     day that already has one, is not a moment worth recording. */
  const now = Date.parse('2026-10-07T18:00:00Z');
  const history = [{ computedAt: now - 20 * 60_000 }];
  assert.equal(stampReason(history, { now, live: false }), null);
});

test('one point a day, after the games and the waivers have settled', () => {
  /* 4am ET on Tuesday is also the week's closing line: Monday night is over and
     nothing is in flight. */
  const history = [{ computedAt: Date.parse('2026-10-06T12:00:00Z') }]; // Tue 8am ET
  const tuesdayLate = Date.parse('2026-10-07T05:00:00Z'); // Tue 1am ET, next day UTC
  assert.equal(stampReason(history, { now: tuesdayLate }), null, 'wrote before 4am ET');

  const wednesdayMorning = Date.parse('2026-10-07T08:30:00Z'); // Wed 4:30am ET
  assert.equal(stampReason(history, { now: wednesdayMorning }), 'daily');
});

test('a game day is recorded every half hour, so the chart moves on a Sunday', () => {
  /* The live numbers are recomputed every 90s and were never written down, so
     the line-movement chart sat flat through the one afternoon it matters. */
  const now = Date.parse('2026-10-11T18:00:00Z'); // Sunday, 2pm ET
  assert.equal(stampReason([{ computedAt: now - 31 * 60_000 }], { now, live: true }), 'live');
  assert.equal(stampReason([{ computedAt: now - 10 * 60_000 }], { now, live: true }), null,
    'a live day still does not write every tick');
  assert.equal(stampReason([{ computedAt: now - 31 * 60_000 }], { now, live: false }), null,
    'half-hourly points outside a game day');
});

test('a league with no history at all gets its opener', () => {
  assert.equal(stampReason([], { now: Date.now() }), 'opening');
});
