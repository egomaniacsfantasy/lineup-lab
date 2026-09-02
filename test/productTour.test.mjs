import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

import { TOUR_STEPS } from '../src/components/onboarding/tourSteps.ts';

/**
 * The tour, driven the way somebody actually drives it.
 *
 * The load-bearing guard is the first one. Steps anchor by CSS selector, so
 * a class rename in a page component would orphan a stop with nothing on
 * screen to say so - the tour would just quietly get shorter. This resolves
 * every selector against the real Hub, so that rename fails here instead.
 */

const cwd = process.cwd();
const port = 4193;
const baseUrl = `http://127.0.0.1:${port}`;
const scene = `${baseUrl}/design/matchup?tour=1`;
const plain = `${baseUrl}/design/matchup`;

const GREEN = 'rgb(52, 210, 123)';
const RED = 'rgb(255, 92, 77)';

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

async function waitForUrl(url, timeoutMs = 60_000) {
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
  await waitForUrl(plain);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

async function openTour(width = 1440, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(scene, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tour__card');
  await page.evaluate(() => document.fonts.ready);
  return page;
}

/** Let the ring's move transition land before measuring where it is. */
async function settle(page) {
  await page.waitForTimeout(320);
}

test('every stop still has something on the Hub to point at', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(plain, { waitUntil: 'networkidle' });
    await page.waitForSelector('.matchup-page__module--hero');

    const missing = [];
    for (const step of TOUR_STEPS) {
      const found = await page.evaluate((selector) => {
        const node = document.querySelector(selector);
        return node != null && node.checkVisibility();
      }, step.selector);
      if (!found) missing.push(`${step.id} -> ${step.selector}`);
    }

    assert.deepEqual(
      missing,
      [],
      'a tour stop points at a selector that no longer resolves on the Hub, so that stop would silently vanish',
    );
  } finally {
    await page.close();
  }
});

test('the tour runs every stop, in order, and ends', async () => {
  const page = await openTour();
  try {
    const seen = [];
    for (let step = 0; step < TOUR_STEPS.length; step += 1) {
      await settle(page);
      seen.push(await page.$eval('.tour__count', (node) => node.textContent));
      const label = await page.$eval('.tour__next', (node) => node.textContent);
      assert.equal(
        label,
        step === TOUR_STEPS.length - 1 ? 'Start using it' : 'Next',
        `the last stop should not still say Next (stop ${step + 1})`,
      );
      await page.click('.tour__next');
    }

    assert.deepEqual(
      seen,
      TOUR_STEPS.map((_, index) => `${index + 1} of ${TOUR_STEPS.length}`),
    );
    assert.equal(await page.$('.tour__card'), null, 'the tour did not close on its last step');
  } finally {
    await page.close();
  }
});

test('the ring lands on the element the stop names, every time', async () => {
  const page = await openTour();
  try {
    for (const step of TOUR_STEPS) {
      await settle(page);
      const overlap = await page.evaluate((selector) => {
        const target = document.querySelector(selector).getBoundingClientRect();
        const ring = document.querySelector('.tour__ring').getBoundingClientRect();
        /* The ring is the target plus a little padding, so the target's
           centre has to be inside it. A ring left behind on the previous
           stop still looks like a ring. */
        const cx = target.left + target.width / 2;
        const cy = target.top + target.height / 2;
        return {
          insideX: cx >= ring.left && cx <= ring.right,
          insideY: cy >= ring.top && cy <= ring.bottom,
        };
      }, step.selector);

      assert.deepEqual(
        overlap,
        { insideX: true, insideY: true },
        `the ring is not on ${step.id}`,
      );
      await page.click('.tour__next');
    }
  } finally {
    await page.close();
  }
});

test('the card is fully on screen at every stop, including the oversized one', async () => {
  /* 900 tall and 720 tall. The lineup board is taller than either, which is
     the case that put the card off the bottom of the window. */
  for (const height of [900, 720]) {
    const page = await openTour(1440, height);
    try {
      for (const step of TOUR_STEPS) {
        await settle(page);
        const box = await page.$eval('.tour__card', (node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
        });
        assert.ok(box.top >= 0, `${step.id}: card is off the top at ${height}px (${box.top})`);
        assert.ok(
          box.bottom <= height,
          `${step.id}: card runs off the bottom at ${height}px (${box.bottom} > ${height})`,
        );
        assert.ok(box.left >= 0, `${step.id}: card is off the left edge`);
        assert.ok(box.right <= 1440, `${step.id}: card runs off the right edge`);
        await page.click('.tour__next');
      }
    } finally {
      await page.close();
    }
  }
});

test('the spotlit control is live only where the stop asks you to press it', async () => {
  const page = await openTour();
  try {
    for (const step of TOUR_STEPS) {
      await settle(page);
      /* What the browser says is on top at the centre of the target. On a
         live stop that is the control itself; everywhere else it must be one
         of the tour's own panels, or a stray click navigates out of the tour. */
      const topmost = await page.evaluate((selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        const node = document.elementFromPoint(
          rect.left + rect.width / 2,
          Math.min(window.innerHeight - 2, rect.top + Math.min(rect.height / 2, 20)),
        );
        return node?.className ?? '';
      }, step.selector);

      if (step.interactive) {
        assert.ok(
          !String(topmost).includes('tour__scrim'),
          `${step.id} asks the user to press the control but a scrim panel is covering it`,
        );
      } else {
        assert.ok(
          String(topmost).includes('tour__scrim') || String(topmost).includes('tour__card'),
          `${step.id} leaves its target clickable (${topmost}), so one press can navigate out of the tour`,
        );
      }
      await page.click('.tour__next');
    }
  } finally {
    await page.close();
  }
});

test('pressing the spotlit toggle rewrites the app and leaves the tour standing', async () => {
  const page = await openTour();
  try {
    await settle(page);
    await page.click('.tour__next'); // onto the format stop
    await settle(page);
    assert.equal(await page.$eval('.tour__count', (n) => n.textContent), '2 of 5');

    const before = await page.$eval('.matchup-page__hero-number', (n) => n.textContent);
    await page.click('.app-header__odds-toggle');
    await page.waitForFunction(
      (previous) => document.querySelector('.matchup-page__hero-number')?.textContent !== previous,
      before,
      { timeout: 5_000 },
    );

    const after = await page.$eval('.matchup-page__hero-number', (n) => n.textContent);
    assert.match(after, /%/, `the toggle did not switch the hero to a percentage (${after})`);
    assert.ok(
      await page.$('.tour__card'),
      'pressing the highlighted control closed the tour, so the step that invites it is a trap',
    );
    assert.equal(await page.$eval('.tour__count', (n) => n.textContent), '2 of 5');
  } finally {
    await page.close();
  }
});

test('skip closes it, and it is not offered again', async () => {
  const page = await openTour();
  try {
    await settle(page);
    await page.click('.tour__skip');
    assert.equal(await page.$('.tour__card'), null, 'Skip did not close the tour');

    const stored = await page.evaluate(() => window.localStorage.getItem('og.tour.state.v1'));
    assert.ok(stored, 'skipping recorded nothing, so the tour will interrupt this person again');
    assert.ok(JSON.parse(stored).skippedAt > 0);
  } finally {
    await page.close();
  }
});

test('the plain Hub is not interrupted by a tour', async () => {
  /* The fixtures have no session, so nothing should open itself over them.
     This is also what keeps the rest of the rendered suite alive: a tour
     that opened here would cover every element those tests measure. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(plain, { waitUntil: 'networkidle' });
    await page.waitForSelector('.matchup-page__module--hero');
    await page.waitForTimeout(2_000); // longer than the tour's settle delay
    assert.equal(
      await page.$('.tour__card'),
      null,
      'the tour opened itself without a session, which would cover every fixture the suite measures',
    );
  } finally {
    await page.close();
  }
});

test('nothing in the tour is coloured like money', async () => {
  const page = await openTour();
  try {
    await settle(page);
    const colours = await page.$$eval('.tour, .tour *', (nodes) =>
      nodes.flatMap((node) => {
        const style = getComputedStyle(node);
        return [style.color, style.backgroundColor, style.borderTopColor];
      }),
    );
    const money = colours.filter((colour) => colour === GREEN || colour === RED);
    assert.deepEqual(money, [], 'the tour uses green or red, which mean money everywhere else');
  } finally {
    await page.close();
  }
});
