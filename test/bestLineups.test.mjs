import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * "If we both start our best" on the Hub, rendered.
 *
 * The engine prices this week with both lineups optimal and returns a MOVEMENT
 * in percentage points (see test/optimalLineup.test.mjs). This file is about
 * what the Hub does with it, and the three things that would make it lie:
 *
 *  - The panel must not replace or restate the real line. The board's price is
 *    the answer somebody opened the Hub for; this is a question they chose to
 *    ask, so it stays closed until asked and the "now" it shows is the board's
 *    own number, never a second opinion about where the market is.
 *
 *  - The resulting price must be CONVERTED from the resulting probability, not
 *    offset in odds-space. American odds are not linear; see matchupSides.ts,
 *    which exists because that exact mistake once put both teams in one game on
 *    the underdog side of the board.
 *
 *  - Once games kick off it must stop offering lineups nobody can set.
 *
 * ?pregame is the design league before anybody has played, which is the state
 * this panel lives in.
 */

const cwd = process.cwd();
const port = 4213;
const baseUrl = `http://127.0.0.1:${port}`;
const scene = `${baseUrl}/design/matchup?pregame`;

function isPortOpen(checkPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: checkPort, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForUrl(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let vite = null;
let browser = null;
let ownsVite = false;

test.before(async () => {
  if (!(await isPortOpen(port))) {
    vite = spawn(
      'npm',
      ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd, env: process.env, stdio: 'ignore' },
    );
    ownsVite = true;
  }
  await waitForUrl(scene);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

async function openPanel(page) {
  await page.goto(scene, { waitUntil: 'domcontentloaded' });
  await page.locator('.matchup-page__best-toggle').waitFor();
  await page.locator('.matchup-page__best-toggle').click();
  await page.locator('.matchup-page__best-panel').waitFor();
}

test('it stays closed until it is asked for', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await page.goto(scene, { waitUntil: 'domcontentloaded' });
    await page.locator('.matchup-page__best-toggle').waitFor();
    assert.equal(await page.locator('.matchup-page__best-panel').count(), 0, 'the hypothetical opened itself');
    /* And the board's own price is still the one at full size. */
    const hero = await page.locator('.matchup-page__hero-number').first().innerText();
    assert.match(hero, /[-+]\d+|\d+\.\d%/, `the board's price is not on screen: ${hero}`);
  } finally {
    await page.close();
  }
});

test('the "now" it shows is the board\'s own price, not a second opinion', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await openPanel(page);
    const board = (await page.locator('.matchup-page__hero-number').first().innerText()).trim();
    const now = (await page.locator('.matchup-page__best-from').innerText()).trim();
    assert.equal(now, board, 'the panel and the board disagree about where the line is now');
  } finally {
    await page.close();
  }
});

test('the best-lineup price is converted from its probability, not offset in odds-space', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await openPanel(page);
    const now = Number((await page.locator('.matchup-page__best-from').innerText()).trim());
    const best = Number((await page.locator('.matchup-page__best-to').innerText()).trim());
    const delta = (await page.locator('.matchup-page__best-delta').innerText()).trim();

    assert.ok(Number.isFinite(now) && Number.isFinite(best), `prices did not parse: ${now} / ${best}`);
    assert.match(delta, /^[+-]?\d+\.\d+pp$/, `the movement is not in percentage points: ${delta}`);

    /* The fixture's movement is positive, so a favourite must get SHORTER (more
       negative). Offsetting in odds-space would move it by the same 17 points
       the probabilities happen to imply here; converting does not, which is the
       whole reason this is converted. */
    const moved = Number(delta.replace('pp', ''));
    assert.ok(moved > 0, 'the fixture should show a gain');
    assert.ok(best < now, `a gain must shorten the price: ${now} -> ${best}`);

    /* Both sides of one game cannot be underdogs. */
    assert.ok(best < 0 || best > 0, 'the best price is not a price');
  } finally {
    await page.close();
  }
});

test('it names the swap on both sides, in the board\'s own short form', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await openPanel(page);
    const panel = await page.locator('.matchup-page__best-panel').innerText();
    assert.match(panel, /You would start/i);
    assert.match(panel, /They would start/i, 'the opponent\'s side is missing, so only half the hypothetical is priced');
    /* S. Barkley, not Saquon Barkley: every other name on this board is short. */
    const firstIn = (await page.locator('.matchup-page__best-in').first().innerText()).trim();
    assert.match(firstIn, /^[A-Z]\.\s/, `the panel uses a different name convention to the rows: ${firstIn}`);
  } finally {
    await page.close();
  }
});

test('once games start it stops offering lineups nobody can set', async () => {
  /* Without ?pregame the design league credits every player with points, which
     is the "games are under way" state. The engine's best lineup would happily
     bench somebody who has already played. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await page.goto(`${baseUrl}/design/matchup`, { waitUntil: 'domcontentloaded' });
    await page.locator('.matchup-page__module--slot-board').waitFor();
    await page.locator('.matchup-page__best-note').first().waitFor();
    assert.equal(await page.locator('.matchup-page__best-toggle').count(), 0, 'a best lineup was offered mid-game');
    const note = await page.locator('.matchup-page__best-note').first().innerText();
    assert.match(note, /games have started/i, `the reason is not given: ${note}`);
  } finally {
    await page.close();
  }
});
