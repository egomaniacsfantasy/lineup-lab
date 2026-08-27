import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The bars in the week strip are evenly spaced.
 *
 * They were not. Each game carried more outer padding than the gap between
 * its own two bars, on the theory that the extra space would group each pair
 * by proximity. Measured, that produced gaps alternating 96px and 116px
 * across the strip — a difference too small to read as grouping and too large
 * to read as alignment, so twelve carefully drawn bars looked carelessly
 * placed. Andre spotted it on sight in his own twelve-team league.
 *
 * The fix ties both numbers to one token: the grid gap inside a game, and
 * half of it as the game's outer padding. This measures the result rather
 * than the CSS, because the property that matters is the rendered rhythm and
 * there are several ways to break it that all still look plausible in a
 * stylesheet.
 */

const cwd = process.cwd();
/* Reuse the dev server the other browser test brings up when it happens to be
   there already, and only fall back to our own. Two Vite servers plus two
   Chromiums on one machine is enough contention to make a neighbouring
   pixel-sampling test fail once in a while, and a suite that fails somewhere
   else when you add a test here is worse than the test is good. */
const SHARED_PORT = 4181;
const OWN_PORT = 4182;
let port = OWN_PORT;
let baseUrl = `http://127.0.0.1:${OWN_PORT}`;
const API_PORT = 8799;

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
  if (await isPortOpen(SHARED_PORT)) {
    port = SHARED_PORT;
  } else if (!(await isPortOpen(OWN_PORT))) {
    vite = spawn(
      'npm',
      ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(OWN_PORT), '--strictPort'],
      { cwd, env: process.env, stdio: 'ignore' },
    );
    ownsVite = true;
  }
  baseUrl = `http://127.0.0.1:${port}`;
  await waitForUrl(`${baseUrl}/design/league`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
  if (api && ownsApi) api.kill('SIGTERM');
});

/* Centres of every bar, and of every chip, left to right. */
function readStrip() {
  const centreX = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.left + rect.width / 2;
  };
  const bars = [...document.querySelectorAll('.week-fork__track')].map(centreX);
  const chips = [...document.querySelectorAll('.week-fork__team')].map(centreX);
  return { bars, chips };
}

const cache = new Map();

async function stripAt(width, cloneToSixGames) {
  /* Cached per shape: the chip-alignment check wants the same rendered strip
     the twelve-team spacing check already measured, and loading the page
     twice to ask two questions about one layout is pure contention. */
  const key = `${width}:${cloneToSixGames}`;
  if (cache.has(key)) return cache.get(key);

  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${baseUrl}/design/league?view=this-week`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.week-fork__track');

  if (cloneToSixGames) {
    /* The design fixture is a six-team league. A real one is twelve, and the
       alternating-gap bug got worse the more games there were, so the check
       runs against both shapes. */
    await page.evaluate(() => {
      const row = document.querySelector('.week-fork__games');
      const games = [...document.querySelectorAll('.week-fork__game')];
      for (let index = 0; index < 3; index += 1) {
        const clone = games[index].cloneNode(true);
        clone.classList.remove('week-fork__game--you');
        row.appendChild(clone);
      }
    });
  }

  const strip = await page.evaluate(readStrip);
  await page.close();
  cache.set(key, strip);
  return strip;
}

for (const [label, games, width] of [
  ['a six-team league', false, 1440],
  ['a twelve-team league', true, 1440],
  ['a narrow laptop', true, 1180],
]) {
  test(`the bars are evenly spaced in ${label}`, async () => {
    const { bars } = await stripAt(width, games);
    assert.ok(bars.length >= 6, `expected a drawn strip, got ${bars.length} bars`);

    const gaps = bars.slice(1).map((centre, index) => centre - bars[index]);
    const spread = Math.max(...gaps) - Math.min(...gaps);

    /* One pixel of slack for subpixel layout, nothing like the twenty the bug
       produced. */
    assert.ok(
      spread <= 1,
      `bar spacing varies by ${spread.toFixed(1)}px: ${gaps.map((gap) => gap.toFixed(1)).join(', ')}`,
    );
  });
}

test('the skeleton is the same height as the strip it stands in for', async () => {
  /* The point of having one at all. This strip is the first thing on the tab
     and the slowest thing on it — every bar is a conditioned sim of both
     branches of a game — so before there was a loading state the strip simply
     appeared and shoved the board down the page, which reads as a glitch
     rather than as a wait. A skeleton of the wrong height would do the same
     thing, just more politely. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/design/league?view=this-week`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.week-fork__track');

  const loaded = await page.evaluate(
    () => document.querySelector('.week-fork').getBoundingClientRect().height,
  );

  /* Re-render the same component in its loading branch by emptying the data
     it was given, which is exactly the state it is in before the sim answers. */
  const skeleton = await page.evaluate(() => {
    const strip = document.querySelector('.week-fork');
    const games = strip.querySelectorAll('.week-fork__game').length;
    strip.classList.add('week-fork--loading');
    strip.querySelectorAll('.week-fork__cap, .week-fork__leg').forEach((node) => node.remove());
    strip.querySelectorAll('.week-fork__team-name > span').forEach((node) => {
      node.replaceWith(
        Object.assign(document.createElement('span'), {
          className: 'week-fork__ghost week-fork__ghost--name',
        }),
      );
    });
    return { height: strip.getBoundingClientRect().height, games };
  });

  await page.close();

  assert.ok(
    Math.abs(loaded - skeleton.height) <= 1,
    `strip is ${loaded}px loaded and ${skeleton.height}px waiting: the board would jump`,
  );
  assert.ok(skeleton.games > 0, 'the skeleton drew no games');
});

test('every chip sits under its own bar', async () => {
  const { bars, chips } = await stripAt(1440, true);
  assert.equal(bars.length, chips.length, 'a bar without a chip, or the reverse');

  const drift = bars.map((bar, index) => Math.abs(bar - chips[index]));
  assert.ok(
    Math.max(...drift) <= 1,
    `crest drifted from its bar by ${Math.max(...drift).toFixed(1)}px`,
  );
});
