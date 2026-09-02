import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * Opening a game from the board.
 *
 * It is a dialog over a blurred board, not a panel under it: the board is a
 * grid of cards two and three across, so an expanding block below pushed the
 * rest of the week down the page and moved the card you had just pressed off
 * screen.
 *
 * Inside, it is the Hub's own head-to-head card and slot board - the same
 * components and the same class names, so that "the same view for anyone
 * else's game" is literally true rather than approximately.
 */

const cwd = process.cwd();
const port = 4187;
const baseUrl = `http://127.0.0.1:${port}`;
const scene = `${baseUrl}/design/board-row/detail`;

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
  await waitForUrl(scene);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

async function openBoard(width = 1440, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(scene, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.matchup-slate__row-button', { timeout: 45_000 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function openGame(page, index = 0) {
  await page.$$eval(
    '.matchup-slate__row-button',
    (cards, i) => cards[i].click(),
    index,
  );
  await page.waitForSelector('.matchup-modal__panel');
  await page.waitForTimeout(260); // the panel's entry animation
}

test('the board opens no game until one is pressed', async () => {
  const page = await openBoard();
  try {
    assert.equal(
      await page.$('.matchup-modal'),
      null,
      'the board arrives with a game already open over it, which nobody asked for',
    );
  } finally {
    await page.close();
  }
});

test('pressing a card opens it over a blurred board', async () => {
  const page = await openBoard();
  try {
    await openGame(page);

    const blur = await page.$eval('.matchup-modal__scrim', (node) =>
      getComputedStyle(node).backdropFilter || getComputedStyle(node).webkitBackdropFilter,
    );
    assert.match(blur, /blur\(/, 'the board behind the dialog is not blurred');

    /* Over the board, not under it: the panel has to be inside the viewport
       rather than pushed down the page by the cards above it. */
    const box = await page.$eval('.matchup-modal__panel', (node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    });
    assert.ok(box.top >= 0 && box.bottom <= 900 + 1, 'the dialog is not on screen');
  } finally {
    await page.close();
  }
});

test('it is the hub card, at full height, not a squashed copy of it', async () => {
  const page = await openBoard();
  try {
    await openGame(page);

    /* The regression this exists for: as a height-constrained grid the scroll
       container compressed its own rows, and the head-to-head card - which
       clips its overflow for the glow - collapsed from 280px to 70px and
       rendered as a sliver with both teams cut in half. Nothing errored. */
    const hero = await page.$eval(
      '.matchup-modal__scroll .matchup-page__module--hero',
      (node) => node.getBoundingClientRect().height,
    );
    assert.ok(
      hero > 200,
      `the head-to-head card is ${Math.round(hero)}px tall, so it is being compressed rather than shown`,
    );

    /* And it is the Hub's card: same crest, same faceoff, same win bar. */
    for (const selector of [
      '.matchup-modal__scroll .matchup-page__faceoff',
      '.matchup-modal__scroll .matchup-page__winbar',
      '.matchup-modal__scroll .matchup-page__hero-number',
      '.matchup-modal__scroll .olympus-crest',
      '.matchup-modal__scroll .matchup-page__slot-board-grid',
    ]) {
      assert.ok(await page.$(selector), `the dialog is missing ${selector}, so it is not the Hub's card`);
    }
  } finally {
    await page.close();
  }
});

test('both lineups render, slot by slot, with headshots on each side', async () => {
  const page = await openBoard();
  try {
    await openGame(page);

    const rows = await page.$$eval('.matchup-modal__scroll .matchup-page__slot-center', (nodes) =>
      nodes.map((node) => node.querySelector('.matchup-page__slot-slot-label')?.textContent),
    );
    assert.deepEqual(
      rows,
      ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'],
      'the slot column no longer reads down the league roster positions',
    );

    const cards = await page.$$eval('.matchup-modal__scroll .matchup-page__slot-card', (nodes) =>
      nodes.map((node) => ({
        name: node.querySelector('.matchup-page__row-name')?.textContent ?? '',
        projection: node.querySelector('.matchup-page__slot-projection')?.textContent ?? '',
        headshot: Boolean(node.querySelector('.player-headshot, .matchup-page__slot-headshot')),
        opponent: node.className.includes('--opponent'),
      })),
    );

    assert.equal(cards.length, 18, 'nine slots on two sides is eighteen cards');

    /* The user's team is seated left in its own game, so its quarterback is
       the left quarterback. Every number already followed its team across the
       board's favourite-on-the-left swap; the lineups have to as well. */
    const [firstLeft, firstRight] = cards;
    assert.equal(firstLeft.opponent, false);
    assert.equal(firstLeft.name, 'J. Hurts');
    assert.equal(firstLeft.projection, '22.4');
    assert.equal(firstRight.opponent, true);
    assert.equal(firstRight.name, 'J. Allen');
    assert.equal(firstRight.projection, '23.7');

    const withHeadshots = cards.filter((card) => card.headshot).length;
    assert.ok(
      withHeadshots >= 16,
      `only ${withHeadshots} of 18 cards drew a headshot, so the dialog is not the Hub's row`,
    );

    /* An unset starting slot says so rather than printing a number nobody
       produced. */
    const empty = await page.$$eval('.matchup-modal__scroll .matchup-page__slot-empty', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.deepEqual(empty, ['Empty slot']);
  } finally {
    await page.close();
  }
});

test('each side carries its own price, and the two add up to one game', async () => {
  const page = await openBoard();
  try {
    await openGame(page);

    const labels = await page.$$eval('.matchup-modal__scroll .matchup-page__winbar-label', (nodes) =>
      nodes.map((node) => Number.parseFloat(node.textContent)),
    );
    assert.equal(labels.length, 2);
    assert.equal(
      Math.round(labels[0] + labels[1]),
      100,
      'the two win probabilities do not add to one game',
    );

    const prices = await page.$$eval('.matchup-modal__scroll .matchup-page__hero-number', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.deepEqual(prices, ['+118', '-142']);

    const meta = await page.$$eval('.matchup-modal__scroll .matchup-page__hero-meta-row .matchup-page__inline-number', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.deepEqual(meta, ['+4.5', '259.3'], 'the spread or the total is wrong');
  } finally {
    await page.close();
  }
});

test('it closes on Escape, on the close button, and on the scrim', async () => {
  const page = await openBoard();
  try {
    await openGame(page);
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.matchup-modal'), null, 'Escape did not close it');

    await openGame(page);
    await page.click('.matchup-modal__close');
    assert.equal(await page.$('.matchup-modal'), null, 'the close button did not close it');

    await openGame(page);
    /* A press that begins AND ends on the scrim. A plain click handler here
       closed the dialog on the tail of the press that opened it, and would
       still close it on a text selection dragged out of the panel. */
    await page.mouse.click(20, 20);
    assert.equal(await page.$('.matchup-modal'), null, 'the scrim did not close it');
  } finally {
    await page.close();
  }
});

test('a press that starts inside the panel does not dismiss it', async () => {
  const page = await openBoard();
  try {
    await openGame(page);
    const box = await page.$eval('.matchup-modal__panel', (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });

    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(20, 20); // drag out onto the scrim
    await page.mouse.up();

    assert.ok(
      await page.$('.matchup-modal'),
      'dragging out of the panel closed it, which is how selecting text dismisses your own dialog',
    );
  } finally {
    await page.close();
  }
});

test('the board behind cannot scroll while a game is open', async () => {
  const page = await openBoard();
  try {
    await openGame(page);
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    assert.equal(overflow, 'hidden', 'the page scrolls behind the dialog, so closing it lands somewhere else');

    await page.keyboard.press('Escape');
    const restored = await page.evaluate(() => getComputedStyle(document.body).overflow);
    assert.notEqual(restored, 'hidden', 'closing the dialog left the page unable to scroll');
  } finally {
    await page.close();
  }
});

test('pressing a different card opens that game', async () => {
  const page = await openBoard();
  try {
    await openGame(page, 1);
    /* The second game seats the same two lineups the other way round, so a
       dialog that kept the first game's players would still look right. */
    const names = await page.$$eval('.matchup-modal__scroll .matchup-page__team-name', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.deepEqual(names, ['Waiver Wire Wizards', 'Sunday Scaries']);

    const first = await page.$eval(
      '.matchup-modal__scroll .matchup-page__slot-card .matchup-page__row-name',
      (node) => node.textContent,
    );
    assert.equal(first, 'J. Hurts', 'the lineups did not follow their teams across the seating swap');
  } finally {
    await page.close();
  }
});

test('nothing in the dialog chrome is coloured like money', async () => {
  const page = await openBoard();
  try {
    await openGame(page);
    const colours = await page.$$eval(
      '.matchup-modal__panel, .matchup-modal__close, .matchup-modal__scroll > *',
      (nodes) => nodes.map((node) => getComputedStyle(node).color),
    );
    const money = colours.filter((colour) => colour === GREEN || colour === RED);
    assert.deepEqual(money, [], 'the dialog chrome uses green or red, which mean money everywhere else');
  } finally {
    await page.close();
  }
});

for (const [width, height] of [[1440, 900], [1024, 800], [390, 844]]) {
  test(`the dialog fits, and nothing spills out of it, at ${width}px`, async () => {
    const page = await openBoard(width, height);
    try {
      await openGame(page);

      const fits = await page.$eval('.matchup-modal__panel', (node) => {
        const rect = node.getBoundingClientRect();
        return {
          onScreen: rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
          width: rect.width,
          vw: window.innerWidth,
        };
      });
      assert.ok(fits.onScreen, `the dialog runs off screen at ${width}px`);
      assert.ok(fits.width <= fits.vw + 1, `the dialog is wider than the screen at ${width}px`);

      const bodyScrolls = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      assert.equal(bodyScrolls, false, `the page scrolls sideways at ${width}px`);
    } finally {
      await page.close();
    }
  });
}
