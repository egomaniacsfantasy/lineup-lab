import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const CONTEXT = 'src/contexts/LeagueConnectionContext.tsx';

/**
 * Leagues that came back after being deleted.
 *
 * Removing a league deleted the account row and held the league in an
 * in-memory Set so the hydrate — which re-reads the rows immediately, before
 * the delete has landed — would not put it straight back.
 *
 * The Set was a useRef, so it lived exactly as long as the page. The delete was
 * fired with `void`, so its result was discarded and a failure was
 * indistinguishable from success. Any delete that did not commit therefore left
 * no trace: the row was still on the account, the tombstone died with the page,
 * and the league reappeared on the next load with nothing explaining why.
 * Multiple users reported it, so it is not a rare race.
 */

test('a removal is written down, not just held in memory', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.match(source, /const REMOVED_KEY = 'og\.olympus\.removed-leagues';/);
  assert.match(
    source,
    /const removedKeysRef = useRef<Set<string>>\(readRemovedKeys\(\)\);/,
    'the tombstone set no longer starts from storage, so removals die on reload',
  );
  assert.match(
    source,
    /removedKeysRef\.current\.add\(leagueKey\(removing\)\);\s*\n\s*writeRemovedKeys/,
    'the removal is not persisted at the moment it happens',
  );
});

test('a delete that fails is noticed instead of discarded', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.match(
    source,
    /\.then\(\(\{ error \}\) => \{/,
    'the delete result is being thrown away again, which makes a failed delete '
      + 'identical to a successful one',
  );
  assert.match(source, /could not delete the account row for/);
});

test('a committed delete clears its own tombstone', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  /* Otherwise a note about a removal that already happened would filter out the
     league if it were ever added back. */
  assert.match(
    source,
    /if \(!error\) \{[\s\S]*?removedKeysRef\.current\.delete\(leagueKey\(removing\)\);[\s\S]*?writeRemovedKeys/,
    'a successful delete leaves its tombstone behind',
  );
});

test('re-adding a removed league un-tombstones it durably', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  assert.match(
    source,
    /removedKeysRef\.current\.delete\(leagueKey\(incoming\)\);\s*\n\s*writeRemovedKeys/,
    'connect() clears the in-memory tombstone but not the stored one, so a '
      + 'league you re-add would vanish again on the next load',
  );
});

test('a row that outlived its delete is retried, not hidden forever', async () => {
  const source = await fs.readFile(path.resolve(CONTEXT), 'utf8');
  /* Hiding it on this device only would leave the account wrong everywhere
     else, which is the same bug wearing a different hat. */
  assert.match(
    source,
    /const stillPresent = rows/,
    'nothing retries a delete that never committed',
  );
  assert.match(source, /for \(const zombie of stillPresent\)/);
});
