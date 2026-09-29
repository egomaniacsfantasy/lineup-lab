import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const cwd = process.cwd();
const port = 4179;
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
let api = null;
let browser = null;
let ownsVite = false;
let ownsApi = false;

/* The Board loads its projections through the dev proxy, which forwards /api
   to :8799. Nothing in the design fixture answers /api/rankings, so with no
   API up the proxy answers 500, the Board renders "Could not load Board", and
   the search box this test waits for never appears. It used to pass only when
   mobileNoHorizontalScroll's API server happened to be alive at the same
   moment, which under load it was not. Same rule as that file: own it. */
const API_PORT = 8799;

test.before(async () => {
  if (!(await isPortOpen(API_PORT))) {
    api = spawn('node', ['server/index.js'], {
      cwd,
      env: { ...process.env, PORT: String(API_PORT) },
      stdio: 'ignore',
    });
    ownsApi = true;
    await waitForUrl(`http://127.0.0.1:${API_PORT}/api/health`);
  }
  if (!(await isPortOpen(port))) {
    vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd,
      env: process.env,
      stdio: 'ignore',
    });
    ownsVite = true;
  }

  await waitForUrl(`${baseUrl}/design/board`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
  if (api && ownsApi) api.kill('SIGTERM');
});

test('board search keeps every typed character under realistic typing speed', async () => {
  const page = await browser.newPage({ viewport: { width: 1512, height: 1200 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/board`, { waitUntil: 'domcontentloaded' });
    const search = page.locator('.board-page__search');
    await search.waitFor({ state: 'visible' });
    await search.click();
    await search.pressSequentially('saquonbarkley', { delay: 18 });
    await page.waitForTimeout(120);
    assert.equal(await search.inputValue(), 'saquonbarkley');
  } finally {
    await page.close();
  }
});
