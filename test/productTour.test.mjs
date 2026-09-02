import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

import { TOURS } from '../src/components/onboarding/tourSteps.ts';

/**
 * The tours, driven the way somebody actually drives them.
 *
 * The two load-bearing guards are selector resolution and ring geometry.
 *
 * Selectors, because stops anchor by CSS class: a rename in a page component
 * would orphan a stop with nothing on screen to say so, and the tour would
 * just quietly get shorter. That happened - the Hub opened at "1 of 4" when
 * it had five stops.
 *
 * Geometry, because a ring is only a highlight if it is smaller than the
 * screen and entirely on it. Rings used to be drawn around whole page
 * containers (843px of a 900px viewport) and at top -8, which was reported,
 * accurately, as "these rectangles do not properly encapsulate the elements".
 */

const cwd = process.cwd();
const port = 4193;
const baseUrl = `http://127.0.0.1:${port}`;

/** Which design scene renders each tab, since the fixtures live under /design. */
const SCENE = { hub: 'matchup', league: 'league', market: 'market', board: 'board' };

/* A ring bigger than this is not pointing at anything; it is a box drawn
   around the page. The largest honest target in the product is a trade deal
   row at about a fifth of the screen. */
const MAX_RING_FRACTION = 0.35;

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
  /* Owns its own port. Adopting another file's server means inheriting its
     lifetime, and that server dies when that file finishes. */
  if (!(await isPortOpen(port))) {
    vite = spawn(
      'npm',
      ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd, env: process.env, stdio: 'ignore' },
    );
    ownsVite = true;
  }
  await waitForUrl(`${baseUrl}/design/matchup`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

/**
 * Wait on the thing being tested, not on the network going quiet.
 *
 * The Hub asks for a headshot per player and every one of them 500s without
 * an API server, so retries keep the connection busy and `networkidle` is a
 * coin flip under load - which is how this passed on its own and then timed
 * out inside the pre-push hook.
 */
async function openScene(page, tourId, { withTour = true } = {}) {
  const query = withTour ? `?tour=${tourId}` : '';
  await page.goto(`${baseUrl}/design/${SCENE[tourId]}${query}`, { waitUntil: 'domcontentloaded' });
  if (withTour) await page.waitForSelector('.tour__card', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Let the card's fade land before measuring where anything is. */
async function settle(page) {
  await page.waitForTimeout(340);
}

/* The Board fixture has no projection rows locally, so its stops legitimately
   resolve to nothing. Excluded from the walk-through guards and covered by
   the "nothing to point at" case instead. */
const WALKABLE = TOURS.filter((tour) => tour.id !== 'board');

for (const tour of WALKABLE) {
  test(`every stop in the ${tour.id} tour still has something to point at`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await openScene(page, tour.id);
      await settle(page);
      const count = await page.$eval('.tour__count', (node) => node.textContent);
      assert.equal(
        count,
        `1 of ${tour.steps.length}`,
        `the ${tour.id} tour opened shorter than it is, which means a stop's selector no longer resolves`,
      );
    } finally {
      await page.close();
    }
  });

  test(`the ${tour.id} tour rings the right element, tightly, on screen`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await openScene(page, tour.id);
      for (const step of tour.steps) {
        await settle(page);
        const shot = await page.evaluate((selector) => {
          const target = document.querySelector(selector).getBoundingClientRect();
          const ring = document.querySelector('.tour__ring').getBoundingClientRect();
          const card = document.querySelector('.tour__card').getBoundingClientRect();
          return {
            ring: { top: ring.top, left: ring.left, bottom: ring.bottom, right: ring.right },
            card: { top: card.top, bottom: card.bottom, left: card.left, right: card.right },
            fraction: (ring.width * ring.height) / (window.innerWidth * window.innerHeight),
            /* The target's centre, clamped to the visible part of it, has to
               sit inside the ring. A ring left behind on the previous stop
               still looks like a ring. */
            centreX: target.left + target.width / 2,
            centreY:
              Math.max(0, Math.min(window.innerHeight, target.top))
              + Math.min(target.height, window.innerHeight - Math.max(0, target.top)) / 2,
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        }, step.selector);

        const where = `${tour.id}/${step.id}`;

        assert.ok(
          shot.ring.top >= 0 && shot.ring.left >= 0,
          `${where}: the ring runs off the top or left of the screen (${Math.round(shot.ring.top)}, ${Math.round(shot.ring.left)}), so it is a rectangle with a missing edge`,
        );
        assert.ok(
          shot.ring.bottom <= shot.vh + 1 && shot.ring.right <= shot.vw + 1,
          `${where}: the ring runs off the bottom or right of the screen`,
        );
        assert.ok(
          shot.fraction <= MAX_RING_FRACTION,
          `${where}: the ring covers ${Math.round(shot.fraction * 100)}% of the screen, which is a box drawn around the page rather than a highlight`,
        );
        assert.ok(
          shot.centreX >= shot.ring.left && shot.centreX <= shot.ring.right,
          `${where}: the ring is not horizontally on its target`,
        );
        assert.ok(
          shot.centreY >= shot.ring.top && shot.centreY <= shot.ring.bottom,
          `${where}: the ring is not vertically on its target`,
        );
        assert.ok(
          shot.card.top >= 0 && shot.card.bottom <= shot.vh + 1,
          `${where}: the card is off screen (${Math.round(shot.card.top)} to ${Math.round(shot.card.bottom)} of ${shot.vh})`,
        );

        await page.click('.tour__next');
      }
      assert.equal(await page.$('.tour__card'), null, `the ${tour.id} tour did not close on its last step`);
    } finally {
      await page.close();
    }
  });

  test(`the ${tour.id} tour leaves its targets unclickable except where it asks`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await openScene(page, tour.id);
      for (const step of tour.steps) {
        await settle(page);
        /* What the browser says is on top at the target. On a live stop that
           is the control itself; everywhere else it must be one of the
           tour's own panels, or a stray click navigates out of the tour. */
        const topmost = await page.evaluate((selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          const node = document.elementFromPoint(
            Math.min(window.innerWidth - 2, rect.left + rect.width / 2),
            Math.min(window.innerHeight - 2, Math.max(2, rect.top + Math.min(rect.height / 2, 20))),
          );
          return String(node?.className ?? '');
        }, step.selector);

        const where = `${tour.id}/${step.id}`;
        if (step.interactive) {
          assert.ok(
            !topmost.includes('tour__scrim'),
            `${where} asks the user to press the control but a scrim panel is covering it`,
          );
        } else {
          assert.ok(
            topmost.includes('tour__scrim') || topmost.includes('tour__card'),
            `${where} leaves its target clickable (${topmost}), so one press can navigate out of the tour`,
          );
        }
        await page.click('.tour__next');
      }
    } finally {
      await page.close();
    }
  });
}

test('pressing the spotlit toggle rewrites the app and leaves the tour standing', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await openScene(page, 'hub');
    await settle(page);
    await page.click('.tour__next'); // onto the format stop
    await settle(page);
    assert.equal(await page.$eval('.tour__count', (n) => n.textContent), '2 of 4');

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
    assert.equal(await page.$eval('.tour__count', (n) => n.textContent), '2 of 4');
  } finally {
    await page.close();
  }
});

test('skip closes it, and records only that tab', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await openScene(page, 'league');
    await settle(page);
    await page.click('.tour__skip');
    assert.equal(await page.$('.tour__card'), null, 'Skip did not close the tour');

    const stored = await page.evaluate(() => window.localStorage.getItem('og.tour.state.v2'));
    assert.ok(stored, 'skipping recorded nothing, so the tour will interrupt this person again');
    const state = JSON.parse(stored);
    assert.ok(state.seen.league.skippedAt > 0);
    assert.equal(
      state.seen.hub,
      undefined,
      'skipping the League tour also marked the Hub tour seen, so that tab would never explain itself',
    );
  } finally {
    await page.close();
  }
});

test('a tab with nothing to point at is not interrupted', async () => {
  /* The Board fixture has no rows locally, so both of its stops resolve to
     nothing. An offered tour must say nothing at all in that case. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${baseUrl}/design/board`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
    assert.equal(
      await page.$('.tour__card'),
      null,
      'a tour with no resolvable stops interrupted the page to say it had nothing to show',
    );
  } finally {
    await page.close();
  }
});

test('a plain tab is not interrupted by a tour', async () => {
  /* The fixtures have no session, so nothing should open itself over them.
     This is also what keeps the rest of the rendered suite alive: a tour that
     opened here would cover every element those tests measure. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await openScene(page, 'hub', { withTour: false });
    await page.waitForSelector('.matchup-page__module--hero', { timeout: 45_000 });
    await page.waitForTimeout(2_500); // longer than the tour's settle delay
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await openScene(page, 'hub');
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
