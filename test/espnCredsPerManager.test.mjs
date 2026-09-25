import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// The store writes server/data/espn-creds.json; park any real file and restore it.
const FILE = path.join(process.cwd(), 'server', 'data', 'espn-creds.json');
const backup = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
test.after(() => {
  if (backup) fs.writeFileSync(FILE, backup);
  else if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
});

const { saveEspnCreds, getEspnCreds, getEspnCredsFor } = await import('../server/providers/espnCredStore.js');
const { createEspnProvider } = await import('../server/providers/espnProvider.js');

const LEAGUE = '999';
const TEAM1 = '{AAAA-1111}';
const TEAM4 = '{05CAB3BA-9DB9-47EB-8888-4E985C60E319}';

test('a league-mate linking last never becomes my login for writes', () => {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  saveEspnCreds(LEAGUE, { espnS2: 's2-team1', swid: TEAM1 });
  assert.equal(getEspnCredsFor(LEAGUE, TEAM4), null, 'only team 1 linked: nothing for me');
  assert.equal(getEspnCredsFor(LEAGUE, TEAM1).espnS2, 's2-team1');

  saveEspnCreds(LEAGUE, { espnS2: 's2-team4', swid: TEAM4 });
  saveEspnCreds(LEAGUE, { espnS2: 's2-team1-new', swid: TEAM1 }); // team 1 re-links after me
  assert.equal(getEspnCredsFor(LEAGUE, TEAM4).espnS2, 's2-team4', 'mine survives his re-link');
  assert.equal(getEspnCredsFor(LEAGUE, '%7B05CAB3BA-9DB9-47EB-8888-4E985C60E319%7D').espnS2, 's2-team4', 'URL-encoded SWID matches');
  assert.equal(getEspnCredsFor(LEAGUE, TEAM1).espnS2, 's2-team1-new');
  assert.equal(getEspnCreds(LEAGUE).espnS2, 's2-team1-new', 'reads still use the latest link');
});

test('legacy single-login file: carried over under its real owner only', () => {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  saveEspnCreds(LEAGUE, { espnS2: 's2-team1', swid: TEAM1 });
  // Strip `members` to mimic a file written before per-manager storage.
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  delete raw[LEAGUE].members;
  fs.writeFileSync(FILE, JSON.stringify(raw));
  assert.equal(getEspnCredsFor(LEAGUE, TEAM4), null);
  saveEspnCreds(LEAGUE, { espnS2: 's2-team4', swid: TEAM4 });
  assert.equal(getEspnCredsFor(LEAGUE, TEAM1).espnS2, 's2-team1', 'the old owner keeps his login');
  assert.equal(getEspnCredsFor(LEAGUE, TEAM4).espnS2, 's2-team4');
});

test('writes refuse to act with anyone else\'s login', async () => {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  saveEspnCreds(LEAGUE, { espnS2: 's2-team1', swid: TEAM1 });
  // Headless, acting for team 4, only team 1's login on file -> refused, no request made.
  const headless = createEspnProvider({ season: 2026, actAs: TEAM4 });
  await assert.rejects(headless.setLineup(LEAGUE, 4, 3, []), { message: 'espn_creds_not_yours', status: 401 });
  await assert.rejects(headless.proposeTrade(LEAGUE, 4, 3, []), { message: 'espn_creds_not_yours' });
  // Request cookies that belong to someone else are not used for my write either.
  const wrongHeaders = createEspnProvider({ season: 2026, espnS2: 's2-team1', swid: TEAM1, actAs: TEAM4 });
  await assert.rejects(wrongHeaders.cancelTrade(LEAGUE, 4, 3, 'x'), { message: 'espn_creds_not_yours' });
  // No acting manager at all -> refused.
  const anonymous = createEspnProvider({ season: 2026 });
  await assert.rejects(anonymous.setLineup(LEAGUE, 4, 3, []), { message: 'espn_write_needs_user' });
});

test('autopilot + trade sender: per manager, legacy entries re-keyed to their owner', async () => {
  const DATA = path.join(process.cwd(), 'server', 'data');
  const files = ['autopilot.json', 'trade-sender.json'].map((f) => path.join(DATA, f));
  const saved = files.map((f) => (fs.existsSync(f) ? fs.readFileSync(f) : null));
  try {
    fs.writeFileSync(files[0], JSON.stringify({ [LEAGUE]: { userId: TEAM4, enabled: true } }));
    fs.writeFileSync(files[1], JSON.stringify({ [LEAGUE]: { userId: TEAM4, enabled: true, settings: { minYouDelta: 2 } } }));
    const ap = await import('../server/engine/autopilotStore.js');
    const ts = await import('../server/engine/tradeSenderStore.js');
    assert.equal(ap.getAutopilot(LEAGUE, TEAM4)?.enabled, true, 'my old autopilot opt-in carries over');
    assert.equal(ap.getAutopilot(LEAGUE, TEAM1), null, 'a league-mate does not inherit it');
    ap.setAutopilot(LEAGUE, TEAM1, { enabled: true });
    assert.equal(ap.listEnabledAutopilot().length, 2, 'both managers keep their own switch');
    assert.equal(ts.getTradeSender(LEAGUE, TEAM4)?.settings.minYouDelta, 2);
    assert.equal(ts.getTradeSender(LEAGUE, TEAM1), null);
    ts.setTradeSender(LEAGUE, TEAM1, { enabled: true, settings: { minYouDelta: 5 } });
    assert.equal(ts.getTradeSender(LEAGUE, TEAM4).settings.minYouDelta, 2, 'his rules never overwrite mine');
    assert.deepEqual(ts.listEnabledTradeSenders().map((e) => e.userId).sort(), [TEAM1, TEAM4].sort());
  } finally {
    files.forEach((f, i) => (saved[i] ? fs.writeFileSync(f, saved[i]) : fs.existsSync(f) && fs.unlinkSync(f)));
  }
});
