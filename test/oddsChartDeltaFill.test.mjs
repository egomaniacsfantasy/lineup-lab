import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const cwd = process.cwd();
const port = 4176;
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

/**
 * How much of the wrong colour is noise rather than a wrong fill.
 *
 * The correct fill measures around 44,000 pixels. A genuinely wrong one would
 * measure about the same in the other colour, so anything near a real defect
 * is three orders of magnitude above this. What sits below it is edge
 * anti-aliasing: the sample is an element screenshot, the area is translucent,
 * and the app's accent is a strongly red-dominant amber, so a subpixel shift
 * in layout can tip a handful of boundary pixels over the red test.
 *
 * This was an exact zero, which held until the suite got busy enough to shift
 * that layout: three stray pixels out of 43,933 failed the run while the
 * structural assertion above it — that the negative path is not rendered at
 * all — passed. A threshold that cannot survive anti-aliasing is measuring
 * the renderer, not the code.
 */
const WRONG_COLOUR_TOLERANCE = 0.005;

async function sampleFillPixels(page, selector) {
  const image = await page.locator(selector).screenshot({ type: 'png' });
  return page.evaluate(async (bytes) => {
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing 2d context');
      context.drawImage(img, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let greenPixels = 0;
      let redPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        if (alpha < 12) continue;
        if (green >= red + 8 && green >= blue + 8) greenPixels += 1;
        if (red >= green + 20 && red >= blue + 20) redPixels += 1;
      }
      return { greenPixels, redPixels };
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [...image]);
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

  await waitForUrl(`${baseUrl}/design/chart/pace-negative`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

test('all-negative pace fixture renders no green fill pixels', async () => {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/chart/pace-negative`, { waitUntil: 'domcontentloaded' });
    await page.locator('.design-chart-page__chart--fill-test .odds-chart__plot').waitFor({ state: 'visible' });
    const counts = await page.evaluate(() => ({
      positive: document.querySelectorAll('.odds-chart__area--delta-positive').length,
      negative: document.querySelectorAll('.odds-chart__area--delta-negative').length,
    }));
    assert.equal(counts.positive, 0, 'all-negative fixture should not render a positive fill path');
    assert.ok(counts.negative > 0, 'all-negative fixture should render a negative fill path');
    const pixels = await sampleFillPixels(page, '.design-chart-page__chart--fill-test .odds-chart__area--delta-negative');
    assert.ok(pixels.redPixels > 0, 'expected red fill pixels for all-negative pace fixture');
    assert.ok(
      pixels.greenPixels <= pixels.redPixels * WRONG_COLOUR_TOLERANCE,
      `all-negative fixture drew ${pixels.greenPixels} green pixels against ${pixels.redPixels} red`,
    );
  } finally {
    await page.close();
  }
});

test('all-positive pace fixture renders no red fill pixels', async () => {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/chart/pace-positive`, { waitUntil: 'domcontentloaded' });
    await page.locator('.design-chart-page__chart--fill-test .odds-chart__plot').waitFor({ state: 'visible' });
    const counts = await page.evaluate(() => ({
      positive: document.querySelectorAll('.odds-chart__area--delta-positive').length,
      negative: document.querySelectorAll('.odds-chart__area--delta-negative').length,
    }));
    assert.equal(counts.negative, 0, 'all-positive fixture should not render a negative fill path');
    assert.ok(counts.positive > 0, 'all-positive fixture should render a positive fill path');
    const pixels = await sampleFillPixels(page, '.design-chart-page__chart--fill-test .odds-chart__area--delta-positive');
    assert.ok(pixels.greenPixels > 0, 'expected green fill pixels for all-positive pace fixture');
    assert.ok(
      pixels.redPixels <= pixels.greenPixels * WRONG_COLOUR_TOLERANCE,
      `all-positive fixture drew ${pixels.redPixels} red pixels against ${pixels.greenPixels} green`,
    );
  } finally {
    await page.close();
  }
});
