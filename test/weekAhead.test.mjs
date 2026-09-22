import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * Looking ahead from the Hub.
 *
 * A beta user asked for "a page where you only see your team", then explained
 * what he actually wanted: to click through weeks and see what is coming. The
 * Hub can answer that, because the unit of the page is already YOUR matchup;
 * it just never had a week other than this one.
 *
 * The properties that make a future week honest rather than a projection table:
 *
 *  - It says the lineups are the best each roster COULD field. Nobody has set a
 *    week 9 lineup, and a projection must not pass for a decision.
 *  - It carries the fork: playoff odds if you win against if you lose, which is
 *    what makes a week worth caring about and is the thing a roster page
 *    somewhere else cannot show.
 *  - The widgets anchored to now do not come with it. A start/sit call and a
 *    line-movement chart are both about this week; carried forward unchanged
 *    they would be quietly wrong.
 *  - There is no way back past the current week. A played week is a result, not
 *    a price.
 */

const cwd = process.cwd();
const port = 4217;
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

async function lookAhead(page) {
  await page.goto(scene, { waitUntil: 'domcontentloaded' });
  await page.locator('.matchup-page__week-step').first().waitFor();
  await page.locator('.matchup-page__week-step').first().click();
  await page.locator('.matchup-page__ahead').waitFor();
}

test('the Hub offers next week, and opens it', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await page.goto(scene, { waitUntil: 'domcontentloaded' });
    const control = page.locator('.matchup-page__week-step').first();
    await control.waitFor();
    assert.match(await control.innerText(), /Week 9/, 'the control does not name the week it opens');

    await control.click();
    await page.locator('.matchup-page__ahead').waitFor();
    const view = await page.locator('.matchup-page__ahead').innerText();
    assert.match(view, /week 9/i);
    assert.match(view, /Athena Owls/, "the week's opponent is missing");
    assert.match(view, /best lineup vs best lineup/i, 'it does not say the lineups are hypothetical');
  } finally {
    await page.close();
  }
});

test('it prices what the week is worth, on both branches', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await lookAhead(page);
    const fork = page.locator('.matchup-page__ahead-fork');
    await fork.locator('.matchup-page__ahead-fork-line').waitFor();
    const text = await fork.innerText();
    assert.match(text, /Win\s+\d+\.\d%/, 'no playoff odds for winning');
    assert.match(text, /Lose\s+\d+\.\d%/, 'no playoff odds for losing');
    assert.match(text, /\d+\.\dpp apart/, 'the swing between the branches is not stated');
  } finally {
    await page.close();
  }
});

test('the widgets anchored to this week do not come with it', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await lookAhead(page);
    assert.equal(await page.locator('.matchup-page__rail').count(), 0, "this week's rail followed the scrubber");
    assert.equal(await page.locator('.matchup-page__module--rail-chart').count(), 0, 'a line-movement chart on a week with no history');
    assert.equal(await page.locator('.matchup-page__module--slot-board').count(), 0, "this week's board is still mounted");
  } finally {
    await page.close();
  }
});

test('it marks who is in that lineup but not in yours today', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await lookAhead(page);
    const changed = page.locator('.matchup-page__ahead-change');
    assert.ok(await changed.count() > 0, 'nothing is flagged as a change, so the fixture proves nothing');
    const row = page.locator('.matchup-page__ahead-row', { has: changed.first() }).first();
    assert.match(await row.innerText(), /Barkley/, 'the promoted player is not the one flagged');
    /* And the names read like every other lineup row in the product. */
    assert.match(await row.innerText(), /S\. Barkley/, 'the week-ahead lineup uses a different name convention');
  } finally {
    await page.close();
  }
});

test('there is no way back past the current week', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await lookAhead(page);
    const back = page.locator('.matchup-page__week-nav .matchup-page__week-step').first();
    assert.equal(await back.isDisabled(), true, 'the scrubber offers a week that has already been played');

    /* The way back to the board is a step, not a dead end. */
    await page.locator('.matchup-page__week-back').click();
    await page.locator('.matchup-page__module--slot-board').waitFor();
    assert.equal(await page.locator('.matchup-page__ahead').count(), 0);
  } finally {
    await page.close();
  }
});
