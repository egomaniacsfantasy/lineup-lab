import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

import { TOURS } from '../src/components/onboarding/tourSteps.ts';

/**
 * The tours, driven the way somebody actually drives them.
 *
 * The load-bearing guards are selector resolution, ring geometry and ring
 * freshness.
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
 *
 * Freshness, because the Hub keeps assembling after the tour opens. A season
 * band landing above the hero pushed the price down by its own height, and
 * the ring, measured once, stayed where the price had been: a box around the
 * team name, and a card over the number the stop was about.
 */

const cwd = process.cwd();
const port = 4193;
const baseUrl = `http://127.0.0.1:${port}`;

/** Which design scene renders each tab, since the fixtures live under /design. */
const SCENE = { hub: 'matchup', league: 'league', market: 'market', board: 'board' };

/* A ring bigger than this is not pointing at anything; it is a box drawn
   around the page. The largest honest target in the product is a trade
   ticket at about a fifth of the screen. */
const MAX_RING_FRACTION = 0.35;

/* Mirrors PAD in the overlay: the air between a target and its ring. */
const PAD = 8;

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

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

/** Open a scene and get past the intro card, onto the first stop. */
async function openWalk(page, tourId) {
  await openScene(page, tourId);
  const start = await page.$('.tour__start');
  if (start) {
    await start.click();
    await page.waitForSelector('.tour__ring', { timeout: 10_000 });
  }
}

/** Let the card's fade land before measuring where anything is. */
async function settle(page) {
  await page.waitForTimeout(340);
}

/** Where everything is on the current stop, measured in the page. */
function shoot(page, step) {
  return page.evaluate(({ selector, fit }) => {
    /* The first VISIBLE match, as the overlay resolves it. */
    const node = Array.from(document.querySelectorAll(selector)).find((candidate) => candidate.checkVisibility());
    let target = node.getBoundingClientRect();
    if (fit === 'text') {
      const range = document.createRange();
      range.selectNodeContents(node);
      target = range.getBoundingClientRect();
    }
    const ring = document.querySelector('.tour__ring').getBoundingClientRect();
    const card = document.querySelector('.tour__card');
    const cardBox = card.getBoundingClientRect();
    const caret = document.querySelector('.tour__caret')?.getBoundingClientRect() ?? null;
    const header = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
    return {
      target: { left: target.left, top: target.top, width: target.width, height: target.height },
      ring: { top: ring.top, left: ring.left, bottom: ring.bottom, right: ring.right, width: ring.width },
      card: { top: cardBox.top, bottom: cardBox.bottom, left: cardBox.left, right: cardBox.right },
      side: card.dataset.side ?? null,
      caret: caret ? { x: caret.left + caret.width / 2, y: caret.top + caret.height / 2 } : null,
      header,
      fraction: (ring.width * ring.height) / (window.innerWidth * window.innerHeight),
      /* The target's centre, clamped to the visible part of it, has to sit
         inside the ring. A ring left behind on the previous stop still
         looks like a ring. */
      centreX: target.left + target.width / 2,
      centreY:
        Math.max(0, Math.min(window.innerHeight, target.top))
        + Math.min(target.height, window.innerHeight - Math.max(0, target.top)) / 2,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }, { selector: step.selector, fit: step.fit ?? 'box' });
}

/* The Board fixture has no projection rows locally, so its stops legitimately
   resolve to nothing. Excluded from the walk-through guards and covered by
   the "nothing to point at" case instead. */
const WALKABLE = TOURS.filter((tour) => tour.id !== 'board');

for (const tour of WALKABLE) {
  test(`every stop in the ${tour.id} tour still has something to point at`, async () => {
    const page = await browser.newPage({ viewport: DESKTOP });
    try {
      await openWalk(page, tour.id);
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

  test(`the ${tour.id} tour rings the right element, tightly, on screen, with the card beside it`, async () => {
    const page = await browser.newPage({ viewport: DESKTOP });
    try {
      await openWalk(page, tour.id);
      for (const step of tour.steps) {
        await settle(page);
        const shot = await shoot(page, step);
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
        if (step.fit === 'text') {
          assert.ok(
            shot.ring.width <= shot.target.width + PAD * 2 + 4,
            `${where}: the ring is ${Math.round(shot.ring.width)}px wide around ${Math.round(shot.target.width)}px of text, so it rings the column rather than the number`,
          );
        }
        assert.ok(
          shot.card.top >= 0 && shot.card.bottom <= shot.vh + 1,
          `${where}: the card is off screen (${Math.round(shot.card.top)} to ${Math.round(shot.card.bottom)} of ${shot.vh})`,
        );
        /* The card and the ring are never on top of each other. A card over
           its own target is the thing a coach mark must not do. */
        const overlaps =
          shot.card.left < shot.ring.right
          && shot.card.right > shot.ring.left
          && shot.card.top < shot.ring.bottom
          && shot.card.bottom > shot.ring.top;
        assert.ok(!overlaps, `${where}: the card covers the thing it is pointing at`);

        /* The caret sits on the card edge that faces the ring, and points
           at it: between the two, not off to one side. */
        assert.ok(shot.side && shot.caret, `${where}: the card found nowhere to sit, so it has no caret`);
        const between = (value, a, b) => value >= Math.min(a, b) - 1 && value <= Math.max(a, b) + 1;
        if (shot.side === 'bottom' || shot.side === 'top') {
          const edge = shot.side === 'bottom' ? shot.card.top : shot.card.bottom;
          assert.ok(Math.abs(shot.caret.y - edge) <= 2, `${where}: the caret is not on the card's ${shot.side === 'bottom' ? 'top' : 'bottom'} edge`);
          assert.ok(between(shot.caret.x, shot.card.left, shot.card.right), `${where}: the caret has left the card`);
          assert.ok(between(shot.caret.y, shot.ring.top, shot.card.bottom) || between(shot.caret.y, shot.card.top, shot.ring.bottom), `${where}: the caret is not between the card and the ring`);
        } else {
          const edge = shot.side === 'right' ? shot.card.left : shot.card.right;
          assert.ok(Math.abs(shot.caret.x - edge) <= 2, `${where}: the caret is not on the card's ${shot.side === 'right' ? 'left' : 'right'} edge`);
          assert.ok(between(shot.caret.y, shot.card.top, shot.card.bottom), `${where}: the caret has left the card`);
        }

        await page.click('.tour__next');
      }
      assert.equal(await page.$('.tour__card'), null, `the ${tour.id} tour did not close on its last step`);
    } finally {
      await page.close();
    }
  });

  test(`the ${tour.id} tour leaves its targets unclickable except where it asks`, async () => {
    const page = await browser.newPage({ viewport: DESKTOP });
    try {
      await openWalk(page, tour.id);
      for (const step of tour.steps) {
        await settle(page);
        /* What the browser says is on top at the target. On a live stop that
           is the control itself; everywhere else it must be one of the
           tour's own panels, or a stray click navigates out of the tour. */
        const topmost = await page.evaluate(({ selector, fit }) => {
          const node = Array.from(document.querySelectorAll(selector)).find((candidate) => candidate.checkVisibility());
          let rect = node.getBoundingClientRect();
          if (fit === 'text') {
            const range = document.createRange();
            range.selectNodeContents(node);
            rect = range.getBoundingClientRect();
          }
          const hit = document.elementFromPoint(
            Math.min(window.innerWidth - 2, rect.left + rect.width / 2),
            Math.min(window.innerHeight - 2, Math.max(2, rect.top + Math.min(rect.height / 2, 20))),
          );
          return hit?.getAttribute('class') ?? '';
        }, { selector: step.selector, fit: step.fit ?? 'box' });

        const where = `${tour.id}/${step.id}`;
        if (step.interactive) {
          assert.ok(
            !topmost.includes('tour__'),
            `${where} asks the user to press the control but the tour is covering it (${topmost})`,
          );
        } else {
          assert.ok(
            topmost.includes('tour__'),
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

test('the Hub asks first, and "Not now" is an answer it remembers', async () => {
  const page = await browser.newPage({ viewport: DESKTOP });
  try {
    await openScene(page, 'hub');
    await settle(page);
    assert.ok(await page.$('.tour__card--intro'), 'the Hub tour opened on a ring instead of asking first');
    assert.equal(await page.$('.tour__ring'), null, 'the intro card is spotlighting something');
    assert.equal(await page.$eval('.tour__count', (n) => n.textContent), '4 stops');

    await page.click('.tour__back'); // "Not now"
    assert.equal(await page.$('.tour__card'), null, '"Not now" did not close the tour');
    const stored = await page.evaluate(() => window.localStorage.getItem('og.tour.state.v2'));
    const state = JSON.parse(stored);
    assert.ok(state.seen.hub.skippedAt > 0, 'declining the intro recorded nothing, so the tour will ask again tomorrow');
  } finally {
    await page.close();
  }
});

test('the ring follows its target when the page moves underneath it', async () => {
  /* The real Hub does this on its own: the season band lands after the tour
     has opened and pushes the hero down by its own height, with no scroll or
     resize event to say so. Done here by hand, by growing a block above the
     hero. */
  const page = await browser.newPage({ viewport: DESKTOP });
  try {
    await openWalk(page, 'hub');
    await settle(page);
    const before = await shoot(page, TOURS[0].steps[0]);

    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.id = 'tour-test-spacer';
      spacer.style.height = '140px';
      document.querySelector('.matchup-page__frame').prepend(spacer);
    });
    await page.waitForTimeout(200);

    const after = await shoot(page, TOURS[0].steps[0]);
    assert.ok(
      after.target.top - before.target.top > 100,
      'the spacer did not move the hero, so this test is not testing anything',
    );
    assert.ok(
      after.centreY >= after.ring.top && after.centreY <= after.ring.bottom,
      `the ring stayed at ${Math.round(before.ring.top)} while its target moved to ${Math.round(after.target.top)}: a box around whatever is there now`,
    );
    assert.ok(
      after.card.top >= 0 && after.card.bottom <= after.vh + 1,
      'the card did not follow the target back on screen',
    );
  } finally {
    await page.close();
  }
});

test('a stop that lands late joins the walk', async () => {
  /* The season band hidden by a stylesheet until the tour has given up
     waiting for it: the Hub then honestly has three stops. Once it is back,
     the next press should count four, with nothing renumbered behind. */
  const page = await browser.newPage({ viewport: DESKTOP });
  try {
    await page.goto(`${baseUrl}/design/matchup?tour=hub`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: '.matchup-page__season--band { display: none !important; }' });
    await page.waitForSelector('.tour__card', { timeout: 60_000 });
    assert.equal(await page.$eval('.tour__count', (n) => n.textContent), '3 stops');
    await page.click('.tour__start');
    await settle(page);
    assert.equal(await page.$eval('.tour__count', (n) => n.textContent), '1 of 3');

    await page.evaluate(() => {
      for (const sheet of document.querySelectorAll('style')) {
        if (sheet.textContent.includes('season--band')) sheet.remove();
      }
    });
    await page.click('.tour__next');
    await settle(page);
    assert.equal(
      await page.$eval('.tour__count', (n) => n.textContent),
      '2 of 4',
      'the season band came back and the walk did not pick it up',
    );
  } finally {
    await page.close();
  }
});

test('pressing the spotlit toggle rewrites the app and leaves the tour standing', async () => {
  const page = await browser.newPage({ viewport: DESKTOP });
  try {
    await openWalk(page, 'hub');
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

test('on a phone the card docks under the target, never over it', async () => {
  const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true });
  try {
    for (const tourId of ['hub', 'league']) {
      await openWalk(page, tourId);
      const tour = TOURS.find((candidate) => candidate.id === tourId);
      for (;;) {
        await settle(page);
        const count = await page.$eval('.tour__count', (n) => n.textContent);
        const index = Number(count.split(' ')[0]) - 1;
        /* Which stop this is, by title, since a phone drops the stops it
           cannot show (the header toggle is not on a phone). */
        const title = await page.$eval('.tour__title', (n) => n.textContent);
        const step = tour.steps.find((candidate) => candidate.title === title);
        const shot = await shoot(page, step);
        const where = `${tourId}/${step.id} on a phone`;
        assert.ok(shot.card.top >= shot.ring.bottom + 8, `${where}: the sheet overlaps the ring`);
        assert.ok(shot.card.bottom <= shot.vh + 1, `${where}: the sheet runs off the bottom`);
        assert.ok(shot.card.right - shot.card.left >= shot.vw - 30, `${where}: the sheet is not full width`);
        assert.ok(
          shot.ring.top >= shot.header - 1,
          `${where}: the target was scrolled under the header (${Math.round(shot.ring.top)} < ${Math.round(shot.header)})`,
        );
        assert.ok(
          shot.centreY >= shot.ring.top && shot.centreY <= shot.ring.bottom,
          `${where}: the ring is not on its target`,
        );
        const isLast = await page.$eval('.tour__next', (n) => n.textContent === 'Done');
        await page.click('.tour__next');
        if (isLast) break;
        assert.ok(index >= 0, `${where}: the count does not parse`);
      }
      assert.equal(await page.$('.tour__card'), null, `the ${tourId} tour did not close on a phone`);
    }
  } finally {
    await page.close();
  }
});

test('skip closes it, and records only that tab', async () => {
  const page = await browser.newPage({ viewport: DESKTOP });
  try {
    await openWalk(page, 'league');
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
  const page = await browser.newPage({ viewport: DESKTOP });
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
  const page = await browser.newPage({ viewport: DESKTOP });
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
  const page = await browser.newPage({ viewport: DESKTOP });
  try {
    await openWalk(page, 'hub');
    await settle(page);
    const colours = await page.$$eval('.tour, .tour *', (nodes) =>
      nodes.flatMap((node) => {
        const style = getComputedStyle(node);
        return [style.color, style.backgroundColor, style.borderTopColor, style.fill];
      }),
    );
    const money = colours.filter((colour) => colour === GREEN || colour === RED);
    assert.deepEqual(money, [], 'the tour uses green or red, which mean money everywhere else');
  } finally {
    await page.close();
  }
});
