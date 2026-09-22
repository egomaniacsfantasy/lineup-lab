import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * IR and taxi players, on the Hub.
 *
 * They used to arrive as ordinary bench players printed at 0.0, which said two
 * untrue things at once: that they are an option this week, and that the engine
 * projects them to score nothing. Neither is a thing anybody asked. A player who
 * cannot be started from where he sits is not bench depth, so he is not in the
 * bench count, not in the start/sit comparison, and carries a dash rather than a
 * number.
 *
 * The design league puts one QB on IR per side (Burrow and Allen).
 */

const cwd = process.cwd();
const port = 4215;
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

async function openBench(page) {
  await page.goto(scene, { waitUntil: 'domcontentloaded' });
  await page.locator('.matchup-page__bench-summary').waitFor();
  await page.locator('.matchup-page__bench-summary').click();
  await page.locator('.matchup-page__reserve').waitFor();
}

test('an IR player is in the reserve group, not on the bench', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  try {
    await openBench(page);
    const reserve = await page.locator('.matchup-page__reserve').innerText();
    assert.match(reserve, /Burrow/, 'the IR player is not in the reserve group');
    assert.match(reserve, /Allen/, "the opponent's IR player is not in the reserve group");

    /* The bench columns above the group must not also carry him. */
    const benchLists = page.locator('.matchup-page__bench-columns').first();
    const benchNames = await benchLists.locator('.matchup-page__row-name').allInnerTexts();
    assert.ok(benchNames.length > 0, 'the bench is empty, so this test proves nothing');
    assert.ok(
      !benchNames.some((name) => /Burrow/.test(name)),
      `an IR player is still listed as bench depth: ${benchNames.join(', ')}`,
    );
  } finally {
    await page.close();
  }
});

test('he carries his slot and a dash, never a projection of 0.0', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  try {
    await openBench(page);
    const row = page.locator('.matchup-page__reserve .matchup-page__lineup-row').first();
    assert.equal((await row.locator('.matchup-page__reserve-tag').innerText()).trim(), 'IR');
    const projection = (await row.locator('.matchup-page__projection').innerText()).trim();
    assert.equal(projection, '—', `a player who cannot be started was given a number: ${projection}`);
  } finally {
    await page.close();
  }
});

test('the bench count is the bench, not the roster', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  try {
    await page.goto(scene, { waitUntil: 'domcontentloaded' });
    const summary = await page.locator('.matchup-page__bench-summary').innerText();
    const [, mine, theirs] = summary.match(/(\d+)\s*vs\s*(\d+)/i) ?? [];
    assert.ok(mine && theirs, `the bench count is not in the summary: ${summary}`);

    await page.locator('.matchup-page__bench-summary').click();
    await page.locator('.matchup-page__reserve').waitFor();
    const columns = page.locator('.matchup-page__bench-columns').first();
    const mineRows = await columns.locator('.matchup-page__lineup-list').first()
      .locator('.matchup-page__lineup-row').count();
    assert.equal(Number(mine), mineRows, 'the count and the rows disagree about the bench');
  } finally {
    await page.close();
  }
});
