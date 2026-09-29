import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * What the Hub offers a manager who is not one of us.
 *
 * The autopilots - set my ESPN lineup, send my trades - are hidden from
 * everybody but the three collaborator accounts while they settle. The
 * objection is to a stranger's Hub offering to act on their league on its own,
 * which is a placement question rather than a verdict: the endpoints, the
 * background scan and the saved per-manager settings are all untouched and
 * still run for the accounts that have them switched on.
 *
 * The other half of this file is the rail those panels had pushed aside. A
 * design scene is signed out, so it is the non-admin view by construction.
 */

const cwd = process.cwd();
const port = 4219;
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

async function hubRail(page) {
  await page.goto(scene, { waitUntil: 'domcontentloaded' });
  await page.locator('.matchup-page__rail').waitFor();
  /* The panels mount after their own fetches; a rail read too early would pass
     whatever happened. */
  await page.waitForTimeout(1500);
  return page.locator('.matchup-page__rail').innerText();
}

test('the Hub does not offer to act on a stranger\'s league', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
  try {
    const rail = await hubRail(page);
    assert.doesNotMatch(rail, /set optimal lineup/i, 'the ESPN lineup write is on a non-admin Hub');
    assert.doesNotMatch(rail, /autopilot/i, 'an autopilot switch is on a non-admin Hub');
    assert.doesNotMatch(rail, /trade sender/i, 'the trade sender is on a non-admin Hub');
  } finally {
    await page.close();
  }
});

test('and it still carries the widgets that belong to everybody', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
  try {
    const rail = await hubRail(page);
    assert.match(rail, /title odds/i, 'the title odds table is missing');
    assert.match(rail, /line movement/i, 'the line-movement chart is missing');
    assert.match(rail, /lineup|start/i, 'the start/sit call is missing');

    /* And nothing is left standing as an empty box where a hidden panel was. */
    const empties = await page.locator('.matchup-page__rail > .matchup-page__module').evaluateAll(
      (els) => els.filter((el) => (el.innerText ?? '').trim() === '').length,
    );
    assert.equal(empties, 0, 'an empty module is holding the space of a hidden panel');
  } finally {
    await page.close();
  }
});

test('the advice does not name a button this reader cannot see', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
  try {
    const rail = await hubRail(page);
    if (!/sit .* start/i.test(rail)) return; // no multi-move call in this fixture state
    assert.doesNotMatch(
      rail,
      /"Set optimal lineup" button/i,
      'the start/sit note points at the hidden button',
    );
  } finally {
    await page.close();
  }
});
