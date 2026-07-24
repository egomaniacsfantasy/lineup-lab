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

  await waitForUrl(`${baseUrl}/design/board-rating`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

test('board search keeps every typed character under realistic typing speed', async () => {
  const page = await browser.newPage({ viewport: { width: 1512, height: 1200 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/board-rating`, { waitUntil: 'domcontentloaded' });
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

test('board rating slider keeps the committed value through rerenders', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/board-rating`, { waitUntil: 'domcontentloaded' });
    const slider = page.locator('.board-card__slider');
    await slider.waitFor({ state: 'visible' });
    await slider.evaluate((element) => {
      element.value = '80';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.waitForTimeout(280);
    assert.equal(await page.locator('.board-card__rating-chip').textContent(), '80');
    assert.match(
      (await page.locator('.board-card__save-note--ok').textContent()) ?? '',
      /Saved: 80\./,
    );
  } finally {
    await page.close();
  }
});
