import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The trade finder as a ticket, rendered against the fixture league.
 *
 * The fixture holds five deals across two managers (rosters 2 and 3) and
 * answers each per-manager scan with that manager's share, so what these prove
 * is the client half: the ticket sits beside the builder, every leg takes
 * several picks, the board is filtered and ranked the trade sender's way, and
 * picked shapes narrow it to those package sizes.
 *
 *   McLaurin for London              you +2.1  them -1.2
 *   McBride for Bowers               you +1.4  them -0.8
 *   Bijan+Kelce+Aubrey for JJ        you -2.7  them +1.9   (lowers your odds: never shown)
 *   Henry+McBride for Nacua+Bowers   you +2.2  them +0.4   (2 for 2)
 *   Lamb for Gibbs                   you +0.4  them -0.2
 *
 * The board opens on every deal that helps you (minimum gain 0, they lose at most
 * 3.0), so all four show. There is no "chance they accept" number anywhere.
 */

const cwd = process.cwd();
const port = 4227;
const baseUrl = `http://127.0.0.1:${port}`;

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
    vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd,
      env: process.env,
      stdio: 'ignore',
    });
    ownsVite = true;
  }
  await waitForUrl(`${baseUrl}/design/market`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

async function openMarket(viewport) {
  const page = await browser.newPage({ viewport, colorScheme: 'dark' });
  await page.goto(`${baseUrl}/design/market`, { waitUntil: 'domcontentloaded' });
  await page.locator('.trade-finder__ticket').waitFor({ state: 'visible' });
  return page;
}

/* The walk scans one manager per call; the board is settled once it says when it scanned. */
async function findAndSettle(page) {
  await page.locator('.trade-finder__find').click();
  await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
  await page.waitForFunction(() => /scanned/.test(document.querySelector('.trade-finder__rows-meta')?.textContent ?? ''));
}

test('the ticket sits beside the builder, and the builder is still there', async () => {
  const page = await openMarket({ width: 390, height: 844 });
  try {
    const tabs = page.locator('.trade-cc__view');
    assert.deepEqual(await tabs.allTextContents(), ['Trade finder', 'Build trades']);

    /* Three legs and a shape, and every size up to 3 for 3 is one of the shapes. */
    assert.deepEqual(
      await page.locator('.trade-finder__leg-label').allTextContents(),
      ['Partner', 'You send', 'You get', 'Shape'],
    );
    assert.deepEqual(
      await page.locator('.trade-finder__ticket .trade-finder__seg-btn').allTextContents(),
      ['Any', '1 for 1', '2 for 1', '1 for 2', '2 for 2', '2 for 3', '3 for 2', '3 for 3'],
    );

    /* Starting points come from the fixture roster, not a fixed list. */
    const starts = await page.locator('.trade-finder__start-title').allTextContents();
    assert.ok(starts.length >= 2, `expected roster-derived starting points, got ${starts.join(' | ')}`);
    assert.ok(starts.some((text) => /^Upgrade /.test(text)), starts.join(' | '));

    await tabs.nth(1).click();
    assert.equal(await page.locator('.trade-cc__builder').evaluate((el) => el.checkVisibility()), true);
    assert.equal(await page.locator('.trade-cc__finder').evaluate((el) => el.checkVisibility()), false);
  } finally {
    await page.close();
  }
});

test('every deal that helps you shows, ranked by your gain, with no acceptance number', async () => {
  const page = await openMarket({ width: 390, height: 844 });
  try {
    await findAndSettle(page);

    /* Opens on everything that helps you: minimum gain 0, they lose at most 3.0. */
    const minGain = page.locator('#trade-finder-min-gain');
    const maxLoss = page.locator('#trade-finder-max-loss');
    assert.equal(await minGain.inputValue(), '0');
    assert.equal(await maxLoss.inputValue(), '3');
    assert.equal(await page.locator('.trade-finder__deal').count(), 4);
    assert.match(await page.locator('.trade-finder__floor-note').first().innerText(), /Nothing hidden/);

    /* Ranked by your title gain, biggest first. */
    const gains = await page.locator('.trade-finder__deal .trade-finder__num--lead').allTextContents();
    assert.deepEqual(gains.map((text) => Number(text.replace(/[^0-9.+-]/g, ''))), [2.2, 2.1, 1.4, 0.4]);

    /* A deal that lowers your title odds is never on the board at all, and no row
       carries a guess at whether the other manager says yes. */
    const board = await page.locator('.trade-finder__rows').innerText();
    assert.doesNotMatch(board, /Justin Jefferson/);
    assert.doesNotMatch(board, /coin flip|unlikely|likely|long shot|lock/i, 'an acceptance read is back on the rows');
    assert.equal(await page.locator('.trade-finder__tag--accept, .trade-finder__track').count(), 0);

    /* The ticket folds into the strip on a phone; the ask reads back. */
    assert.equal(await page.locator('.trade-finder__ticket').evaluate((el) => el.checkVisibility()), false);
    assert.deepEqual(
      await page.locator('.trade-finder__summary .trade-finder__chip--static').allTextContents(),
      ['anyone', 'send anything', 'get anything', 'any shape'],
    );

    /* The two limits narrow it: a minimum gain of 1.0 hides the +0.4 deal. */
    await minGain.fill('1');
    assert.equal(await page.locator('.trade-finder__deal').count(), 3);
    assert.match(await page.locator('.trade-finder__floor-note').first().innerText(), /1 outside your limits/);

    /* Raising it past the best deal leaves the empty state with a way out. */
    await minGain.fill('5');
    assert.equal(await page.locator('.trade-finder__deal').count(), 0);
    assert.match(await page.locator('.trade-finder__empty-head').innerText(), /4 deals help you, but outside your limits/);
    await page.locator('.trade-finder__loosen .trade-finder__chip', { hasText: 'Show every deal that helps me' }).click();
    assert.equal(await page.locator('.trade-finder__deal').count(), 4);
  } finally {
    await page.close();
  }
});

test('a shape narrows the board to that package, and the lead deal opens in the builder', async () => {
  const page = await openMarket({ width: 1280, height: 1000 });
  try {
    await page.locator('.trade-finder__ticket .trade-finder__seg-btn', { hasText: '2 for 2' }).click();
    await findAndSettle(page);

    const deals = page.locator('.trade-finder__deal');
    assert.equal(await deals.count(), 1);
    assert.match(await deals.first().innerText(), /2 for 2/i);
    assert.match(await deals.first().innerText(), /Puka Nacua/);

    /* Opening it lands on Build trades with both sides filled in. */
    await deals.first().locator('.trade-finder__deal-open').click();
    await page.locator('.trade-cc__builder').waitFor({ state: 'visible' });
    const selected = await page.locator('.trade-cc__asset-name').allTextContents();
    assert.deepEqual(selected.sort(), ['Brock Bowers', 'Derrick Henry', 'Puka Nacua', 'Trey McBride']);
  } finally {
    await page.close();
  }
});

test('every leg takes several picks: managers, positions and shapes', async () => {
  const page = await openMarket({ width: 1280, height: 1000 });
  try {
    /* Two managers. The sheet stays open while you pick and closes on Done. */
    await page.locator('.trade-finder__leg').nth(0).click();
    const managers = page.locator('.trade-finder__sheet .trade-finder__item');
    await managers.nth(0).click();
    await managers.nth(1).click();
    assert.equal(await page.locator('.trade-finder__sheet .trade-finder__item--on').count(), 2);
    await page.locator('.trade-finder__sheet-done').click();
    assert.match(await page.locator('.trade-finder__leg').nth(0).innerText(), /2 managers/);

    /* Two positions to send. */
    await page.locator('.trade-finder__leg').nth(1).click();
    await page.locator('.trade-finder__sheet .trade-finder__tile', { hasText: 'RB' }).click();
    await page.locator('.trade-finder__sheet .trade-finder__tile', { hasText: 'WR' }).click();
    assert.equal(await page.locator('.trade-finder__sheet .trade-finder__tile--on').count(), 2);
    await page.locator('.trade-finder__sheet-done').click();
    assert.match(await page.locator('.trade-finder__leg').nth(1).innerText(), /RB, WR/);

    /* Two shapes at once; "Any" switches off, and clears them again. */
    const shapeButtons = page.locator('.trade-finder__ticket .trade-finder__seg-btn');
    await shapeButtons.filter({ hasText: '1 for 1' }).click();
    await shapeButtons.filter({ hasText: '2 for 2' }).click();
    assert.deepEqual(
      await page.locator('.trade-finder__ticket .trade-finder__seg-btn--on').allTextContents(),
      ['1 for 1', '2 for 2'],
    );
    await shapeButtons.filter({ hasText: 'Any' }).click();
    assert.deepEqual(await page.locator('.trade-finder__ticket .trade-finder__seg-btn--on').allTextContents(), ['Any']);
  } finally {
    await page.close();
  }
});
