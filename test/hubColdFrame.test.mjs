import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The Hub's loading state has to be the Hub, one frame earlier.
 *
 * Switching leagues clears bootstrap outright, so every switch passes through
 * this screen. That makes it a layout question rather than a decoration one:
 * whatever the skeleton draws is where the reader's eye is when the real page
 * lands, and anything that moves between the two reads as the page breaking
 * and reassembling itself.
 *
 * It had drifted twice over, in the two ways this file now asks about.
 *
 * GEOMETRY. The cold state carried a two-column root grid of its own, at
 * 1024px and 400px, against the loaded page's 1200px and 384px. Between those
 * breakpoints the skeleton drew a rail beside the hero that the real Hub
 * stacks below the main column, so the arriving league did not fill the
 * skeleton, it rearranged the page. Measured at the time: the rail moved 1265
 * pixels down the page when the data landed.
 *
 * VOCABULARY. The skeleton's own card was "Your lineup", a module the Hub
 * stopped having when the lineup became "Lineup vs lineup" in the main
 * column. A placeholder for a surface that is not coming is worse than no
 * placeholder, because the wait is spent learning the wrong shape.
 *
 * Both are invisible to a reviewer looking at either state on its own, which
 * is why they survived: you have to hold the two side by side to see them.
 */

const cwd = process.cwd();
const port = 4194;
const baseUrl = `http://127.0.0.1:${port}`;
const scene = `${baseUrl}/design/matchup-cold`;

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

/* What has to survive the league landing. Read from the frame and its two
   columns, because those are what every module inside them is positioned
   against: if these hold, nothing above the fold can jump sideways. */
const MEASURE = () => {
  const round = (n) => Math.round(n);
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: round(rect.x), width: round(rect.width) };
  };
  const frame = document.querySelector('.matchup-page__frame');
  return {
    columns: frame ? getComputedStyle(frame).gridTemplateColumns : null,
    main: box('.matchup-page__main'),
    rail: box('.matchup-page__rail'),
    titles: [...document.querySelectorAll('.matchup-page__module-title')].map(
      (node) => node.textContent.trim(),
    ),
  };
};

/**
 * Both states of one page load.
 *
 * The scene answers on a delay on purpose, so the skeleton is reachable by
 * navigating and measuring before it resolves. The page is warmed first
 * because a cold Vite compile can outlast that delay, which would leave the
 * test measuring the loaded page twice and quietly asserting nothing.
 */
async function bothStates(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.goto(scene, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.matchup-page__slot-card', { timeout: 30_000 });

    await page.goto(scene, { waitUntil: 'domcontentloaded' });
    /* The skeleton, before the fixture answers. */
    await page.waitForSelector('.matchup-page--cold', { timeout: 5_000 });
    const cold = await page.evaluate(MEASURE);

    /* Wait for a real slot card rather than for the network to go quiet: the
       Hub asks for a headshot per player and every one of them fails without
       an API server, so networkidle here is a coin flip. */
    await page.waitForSelector('.matchup-page__slot-card', { timeout: 30_000 });
    const loaded = await page.evaluate(MEASURE);

    assert.ok(cold.columns, 'the cold state has no frame, so it is not using the page layout at all');
    return { cold, loaded };
  } finally {
    await page.close();
  }
}

/* 1100 is the width the old bug was worst at: between the two breakpoints,
   where the skeleton was two columns and the page it precedes is one. 1440 is
   a normal desktop, where the columns merely disagreed by a dozen pixels. */
for (const width of [1100, 1440]) {
  test(`the loading Hub and the loaded Hub share one frame at ${width}px`, async () => {
    const { cold, loaded } = await bothStates(width);

    assert.equal(
      cold.columns,
      loaded.columns,
      `the skeleton and the page disagree about the frame's columns at ${width}px, so the league landing moves every module sideways`,
    );
    assert.deepEqual(
      cold.main,
      loaded.main,
      'the main column changes position or width when the league lands',
    );
    assert.deepEqual(
      cold.rail,
      loaded.rail,
      'the rail changes position or width when the league lands',
    );
  });
}

test('the skeleton only names modules the Hub actually delivers', async () => {
  const { cold, loaded } = await bothStates(1440);

  assert.ok(cold.titles.length > 0, 'the skeleton names nothing, so this proves nothing');
  for (const title of cold.titles) {
    assert.ok(
      loaded.titles.includes(title),
      `the skeleton promises a "${title}" module that the loaded Hub does not have`,
    );
  }
});

test('the wait is stated once', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(scene, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.matchup-page--cold', { timeout: 30_000 });

    /* The shell's own SYNCING chip is a separate surface and is allowed to
       speak. This counts what the page itself says, which was three things
       at once: a chip styled like a live price, and a caption repeating it. */
    const said = await page.$$eval('.matchup-page--cold *', (nodes) =>
      nodes
        .filter((node) => [...node.children].length === 0)
        .map((node) => node.textContent.trim())
        .filter((text) => /pricing your league/i.test(text)).length,
    );
    assert.equal(said, 1, 'the loading Hub says it is pricing more than once');
  } finally {
    await page.close();
  }
});
