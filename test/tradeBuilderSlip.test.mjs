import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * Build trades as a market and a slip (2026-10-09).
 *
 * Rendered against the fixture league. The market is every manager as a
 * pill and one roster at a time as a priced list; the slip at the right
 * holds the trade, says what each player does to your lineup, and prices
 * it. Priced, the verdict takes the market's place and the slip keeps the
 * number. The fixture prices exactly one hand-built trade: Terry McLaurin
 * to Hermes Express for Drake London.
 */

const cwd = process.cwd();
const port = 4233;
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

const DESKTOP = { width: 1280, height: 1000 };

async function openBuilder(viewport = DESKTOP) {
  const page = await browser.newPage({ viewport, colorScheme: 'dark' });
  await page.goto(`${baseUrl}/design/market`, { waitUntil: 'domcontentloaded' });
  await page.locator('.trade-finder__ticket').waitFor({ state: 'visible' });
  await page.locator('.trade-cc__view').nth(1).click();
  await page.locator('.trade-cc__builder').waitFor({ state: 'visible' });
  /* The per-game sheet arrives a moment after the page: wait for a rank to
     be filled in. Attached, not visible: a narrow row hides the rank. */
  await page.locator('.trade-cc__roster-rank:not(:empty)').first().waitFor({ state: 'attached' });
  return page;
}

const row = (page, name) => page.locator('.trade-cc__roster-row', { hasText: name });

test('the market is every manager as a pill, and your roster as a priced list until one is picked', async () => {
  const page = await openBuilder();
  try {
    assert.equal(await page.locator('.trade-cc__partner').count(), 5);
    assert.equal(await page.locator('.trade-cc__partner--on').count(), 0);
    assert.equal(await page.locator('.trade-cc__market-title').innerText(), 'Pick a manager');
    assert.equal(await page.locator('.trade-cc__roster-tab--active').innerText(), 'Your roster');
    assert.equal(await page.locator('.trade-cc__roster-tab').nth(0).isDisabled(), true, 'no roster to show yet');

    /* The slot column reads the lineup the provider set, not a ranking:
       Jefferson starts at WR1 on 16.0 while Smith sits on 16.8. */
    assert.equal(await row(page, 'Justin Jefferson').locator('.trade-cc__roster-slot').innerText(), 'WR1');
    assert.equal(await row(page, 'DeVonta Smith').locator('.trade-cc__roster-slot').innerText(), 'Bench');
    assert.equal(await row(page, 'Terry McLaurin').locator('.trade-cc__roster-slot').innerText(), 'FLEX');
    /* Per game and the rank at the position, the finder's numbers. */
    assert.match(await row(page, 'Justin Jefferson').locator('.trade-cc__roster-num').first().innerText(), /^\d+\.\d$/);
    assert.match(await row(page, 'Justin Jefferson').locator('.trade-cc__roster-rank').innerText(), /^WR\d+$/);

    /* The slip says what to do, and has no title. */
    const empties = await page.locator('.trade-cc__slip-empty').allInnerTexts();
    assert.deepEqual(empties, ['Pick a manager', 'Pick from your roster']);
    assert.equal(await page.locator('.trade-cc__slip h2, .trade-cc__slip h3').count(), 0);
    assert.equal(await page.locator('.trade-cc__price-btn').isDisabled(), true);
  } finally {
    await page.close();
  }
});

test('one press picks a manager, names them, and opens their roster', async () => {
  const page = await openBuilder();
  try {
    await page.locator('.trade-cc__partner', { hasText: 'Hermes Express' }).click();
    assert.equal(await page.locator('.trade-cc__partner--on').innerText().then((t) => t.replace(/\s+/g, ' ').trim()), 'HE Hermes Express 4-3');
    assert.equal(await page.locator('.trade-cc__market-title').innerText(), 'Hermes Express');
    assert.match(await page.locator('.trade-cc__market-read').innerText(), /^Title .+ · playoffs .+ · thinnest at [A-Z0-9]+: .+ \([A-Z]+\d+\)$/);
    assert.equal(await page.locator('.trade-cc__roster-tab--active').innerText(), 'Their roster');
    assert.equal(await page.locator('.trade-cc__pool-search').getAttribute('placeholder'), 'Search Hermes Express');
    assert.equal(await row(page, 'Drake London').count(), 1);
    assert.equal(await page.locator('.trade-cc__slip-empty').first().innerText(), 'Pick from their roster');
    assert.match(await page.locator('.trade-cc__deal-tag').first().innerText(), /^You get from Hermes Express$/);
  } finally {
    await page.close();
  }
});

test('a pick fills the slip with a line on your lineup, the price lands in the slip, and Edit trade reopens the market', async () => {
  const page = await openBuilder();
  try {
    await page.locator('.trade-cc__partner', { hasText: 'Hermes Express' }).click();
    await row(page, 'Drake London').click();
    await page.locator('.trade-cc__roster-tab', { hasText: 'Your roster' }).click();
    await row(page, 'Terry McLaurin').click();

    assert.deepEqual(await page.locator('.trade-cc__asset-name').allInnerTexts(), ['Drake London', 'Terry McLaurin']);
    const notes = await page.locator('.trade-cc__asset-note').allInnerTexts();
    assert.match(notes[0], /^Bench, behind .+ \(\d+\.\d\)\.$/, 'London on 6.1 does not start');
    /* McLaurin holds the FLEX in the lineup his manager set, so that is the
       slot named, whatever a value ranking would say. */
    assert.match(notes[1], /^Your FLEX\. .+ starts instead \(\d+\.\d\)\.$/);
    assert.equal(await page.locator('.trade-cc__slip-shape').innerText(), '1 for 1');
    assert.match(await page.locator('.trade-cc__slip-net').innerText(), /^You send \d+\.\d more per game\.$/);
    assert.equal(await page.locator('.trade-cc__slip-sum').count(), 2);

    await page.locator('.trade-cc__price-btn').click();
    await page.locator('.trade-cc__verdict').waitFor({ state: 'visible' });
    /* The verdict took the market's place; the slip kept the trade and got the number. */
    assert.equal(await page.locator('.trade-cc__roster').count(), 0);
    assert.equal(await page.locator('.trade-cc__partners').count(), 0);
    assert.equal(await page.locator('.trade-cc__price-btn').count(), 0);
    assert.match(await page.locator('.trade-cc__slip .trade-cc__deal-number').innerText(), /^[+-]\d+\.\d%/);
    assert.deepEqual(await page.locator('.trade-cc__slip .trade-cc__asset-name').allInnerTexts(), ['Drake London', 'Terry McLaurin']);
    assert.equal(await page.locator('.trade-cc__asset-remove').count(), 0, 'a priced slip is not edited by its crosses');
    /* The verdict sits in the left column, beside the slip, not under it. */
    const verdict = await page.locator('.trade-cc__verdict').boundingBox();
    const slip = await page.locator('.trade-cc__slip').boundingBox();
    assert.ok(verdict && slip && verdict.x + verdict.width <= slip.x, 'verdict is left of the slip');

    await page.locator('.trade-cc__edit-btn').click();
    await page.locator('.trade-cc__roster').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.trade-cc__price-btn').count(), 1);
    assert.equal(await page.locator('.trade-cc__verdict').count(), 0);
    assert.equal(await page.locator('.trade-cc__asset-remove').count(), 2);
  } finally {
    await page.close();
  }
});

test('a sent starter is read off the lineup, never off a value ranking', async () => {
  const page = await openBuilder();
  try {
    await page.locator('.trade-cc__partner', { hasText: 'Hermes Express' }).click();
    await page.locator('.trade-cc__roster-tab', { hasText: 'Your roster' }).click();
    await row(page, 'Justin Jefferson').click();
    /* The first slip read this "From your bench", because Smith projects
       higher and a ranking put him in the slot. */
    assert.match(await page.locator('.trade-cc__asset-note').innerText(), /^Your WR1\. DeVonta Smith starts instead \(\d+\.\d\)\.$/);
  } finally {
    await page.close();
  }
});

test('below a laptop the slip comes first and the row drops rank and bye', async () => {
  const page = await openBuilder({ width: 820, height: 1100 });
  try {
    const slip = await page.locator('.trade-cc__slip').boundingBox();
    const market = await page.locator('.trade-cc__market').boundingBox();
    assert.ok(slip && market && slip.y + slip.height <= market.y, 'slip above the market');
    assert.equal(await page.locator('.trade-cc__roster-rank').first().evaluate((el) => el.checkVisibility()), false);
    assert.equal(await page.locator('.trade-cc__roster-slot').first().evaluate((el) => el.checkVisibility()), true);
  } finally {
    await page.close();
  }
});
