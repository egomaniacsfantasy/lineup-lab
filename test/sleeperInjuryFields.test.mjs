import assert from 'node:assert/strict';
import test from 'node:test';
import { trimCatalogEntry } from '../server/providers/sleeperProvider.js';

/**
 * The catalogue is trimmed on the way in and the trimmed copy is what the
 * whole app sees, so a field dropped here is a field that does not exist
 * downstream — and the loss is silent. Sleeper's injury block is the material
 * for return timelines, so these assert that every part of it survives the
 * trim, including the parts that are empty today.
 */

/** A row shaped like Sleeper's, with every injury field populated. */
const RAW = {
  full_name: 'Test Player',
  first_name: 'Test',
  last_name: 'Player',
  team: 'NE',
  position: 'WR',
  fantasy_positions: ['WR'],
  status: 'Active',
  number: 11,
  injury_status: 'Questionable',
  injury_body_part: 'Knee - ACL',
  injury_notes: 'Surgery',
  injury_start_date: '2026-09-14',
  practice_participation: 'Limited Participation in Practice',
  practice_description: 'Limited',
  news_updated: 1766443825172,
};

test('the whole injury block survives the trim', () => {
  const entry = trimCatalogEntry('4034', RAW);

  assert.equal(entry.injuryStatus, 'Questionable');
  assert.equal(entry.injuryBodyPart, 'Knee - ACL');
  assert.equal(entry.injuryNotes, 'Surgery');
  assert.equal(entry.injuryStartDate, '2026-09-14');
  assert.equal(entry.practiceParticipation, 'Limited Participation in Practice');
  assert.equal(entry.practiceDescription, 'Limited');
  assert.equal(entry.newsUpdated, 1766443825172);
});

test('a healthy player carries nulls, not absent keys', () => {
  /* The distinction matters downstream: `undefined` reads as "we never asked",
     null as "we asked and there is nothing". A UI deciding whether to show a
     practice report needs the second. */
  const entry = trimCatalogEntry('1', { full_name: 'Healthy Guy', position: 'RB' });

  for (const field of [
    'injuryStatus',
    'injuryBodyPart',
    'injuryNotes',
    'injuryStartDate',
    'practiceParticipation',
    'practiceDescription',
    'newsUpdated',
  ]) {
    assert.ok(field in entry, `${field} is missing from the trimmed entry`);
    assert.equal(entry[field], null, `${field} should be null, not ${entry[field]}`);
  }
});

test('the fields that were already there did not move', () => {
  const entry = trimCatalogEntry('4034', RAW);
  assert.equal(entry.id, '4034');
  assert.equal(entry.name, 'Test Player');
  assert.equal(entry.team, 'NE');
  assert.equal(entry.position, 'WR');
  assert.equal(entry.number, 11);
});

test('a snapshot written before the injury fields existed is not served', async () => {
  const { snapshotMatchesCurrentShape } = await import('../server/providers/sleeperProvider.js');

  /* The shape the old code wrote. It is not stale by age — a deploy does not
     touch the file's mtime — so nothing else would have caught it. */
  const old = { 4034: { id: '4034', name: 'X', team: 'NE', injuryStatus: null, number: 11 } };
  assert.equal(snapshotMatchesCurrentShape(old), false);

  const current = { 4034: trimCatalogEntry('4034', RAW) };
  assert.equal(snapshotMatchesCurrentShape(current), true);

  /* An empty or missing snapshot is not "current" either: serving {} would
     mean an app with no players in it. */
  assert.equal(snapshotMatchesCurrentShape({}), false);
  assert.equal(snapshotMatchesCurrentShape(null), false);
});
