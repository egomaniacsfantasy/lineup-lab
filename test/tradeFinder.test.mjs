import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The trade finder as a ticket, rendered against the fixture league.
 *
 * The fixture answers every trade-suggestions call with the same five deals,
 * whatever the ask, so what these prove is the client half: the ticket is
 * there beside the builder, the acceptance floor hides what the other
 * manager would laugh at, and a shape narrows to that package size.
 *
 * Acceptance with a neutral read (5/5) on the fixture's partner deltas:
 *   McLaurin for London       -1.2  ->  23%
 *   McBride for Bowers        -0.8  ->  28%
 *   Bijan+Kelce+Aubrey for JJ  1.9  ->  70%
 *   Henry+McBride for Nacua+Bowers  0.4  ->  47%   (2 for 2)
 *   Lamb for Gibbs            -0.2  ->  37%
 * So the 40% default floor shows two and hides three.
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

test('the ticket sits beside the builder, and the builder is still there', async () => {
  const page = await openMarket({ width: 390, height: 844 });
  try {
    const tabs = page.locator('.trade-cc__view');
    assert.deepEqual(await tabs.allTextContents(), ['Trade finder', 'Build trades']);

    /* Three legs and a shape, and 2 for 2 is one of the shapes. */
    assert.deepEqual(
      await page.locator('.trade-finder__leg-label').allTextContents(),
      ['Partner', 'You send', 'You get', 'Shape'],
    );
    assert.deepEqual(
      await page.locator('.trade-finder__ticket .trade-finder__seg-btn').allTextContents(),
      ['Any', '1 for 1', '2 for 1', '1 for 2', '2 for 2'],
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

test('the acceptance floor starts at 40% and hides the deals under it', async () => {
  const page = await openMarket({ width: 390, height: 844 });
  try {
    await page.locator('.trade-finder__find').click();
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });

    const floor = page.locator('.trade-finder__floor-input');
    assert.equal(await floor.inputValue(), '40');
    assert.equal(await page.locator('.trade-finder__deal').count(), 2);
    assert.match(await page.locator('.trade-finder__floor-note').innerText(), /3 under the floor/);

    /* The ticket folds into the strip on a phone; the ask reads back. */
    assert.equal(await page.locator('.trade-finder__ticket').evaluate((el) => el.checkVisibility()), false);
    assert.deepEqual(
      await page.locator('.trade-finder__summary .trade-finder__chip--static').allTextContents(),
      ['anyone', 'send anything', 'get anything', 'any shape'],
    );

    /* Dropping the floor to zero shows all five. */
    await floor.fill('0');
    assert.equal(await page.locator('.trade-finder__deal').count(), 5);

    /* Raising it past the best deal leaves the empty state with a way out. */
    await floor.fill('90');
    assert.equal(await page.locator('.trade-finder__deal').count(), 0);
    assert.match(await page.locator('.trade-finder__empty-head').innerText(), /5 deals sit under your 90% floor/);
    await page.locator('.trade-finder__loosen .trade-finder__chip', { hasText: 'Drop the floor' }).click();
    assert.equal(await page.locator('.trade-finder__deal').count(), 5);
  } finally {
    await page.close();
  }
});

test('a shape narrows the board to that package, and the lead deal opens in the builder', async () => {
  const page = await openMarket({ width: 1280, height: 1000 });
  try {
    await page.locator('.trade-finder__ticket .trade-finder__seg-btn', { hasText: '2 for 2' }).click();
    await page.locator('.trade-finder__find').click();
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });

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
