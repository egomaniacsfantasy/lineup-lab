import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * Clicking a game on the board opens it.
 *
 * The board posts a price; this is the thing behind the price, and the whole
 * value of it is that the two lineups can be read against each other. So the
 * guards are about the pairing holding up on screen: the right players under
 * the right team, one row per slot, the over/under posted once rather than
 * twice, and nothing spilling out of a column at any width.
 *
 * It also holds the colour rule. Green and red mean money in this product.
 * A player projecting more than the man opposite him is not money, and if
 * this panel starts colouring slots those two colours stop meaning anything.
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
  await waitForUrl(scene);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

async function openScene(width = 1320, height = 1400) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(scene, { waitUntil: 'networkidle' });
  await page.waitForSelector('.matchup-detail__row');
  await page.evaluate(() => document.fonts.ready);
  return page;
}

test('the open game shows both lineups, slot for slot, under the right teams', async () => {
  const page = await openScene();
  try {
    const panels = await page.$$('.matchup-detail');
    assert.equal(panels.length, 1, 'the board opened more than one game at once');

    const rows = await page.$$eval('.matchup-detail__row', (nodes) =>
      nodes.map((row) => ({
        slot: row.querySelector('.matchup-detail__slot').textContent,
        left: row.querySelector('.matchup-detail__player--left .matchup-detail__player-name')?.textContent ?? '',
        right: row.querySelector('.matchup-detail__player--right .matchup-detail__player-name')?.textContent ?? '',
        points: [...row.querySelectorAll('.matchup-detail__points')].map((n) => n.textContent),
      })),
    );

    assert.equal(rows.length, 9, 'the panel is not showing one row per starting slot');
    assert.deepEqual(
      rows.map((row) => row.slot),
      ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'],
      'the slot column no longer reads down the league roster positions',
    );

    /* The seat, not the letter. The user's team is on the left of its own
       game, so its quarterback has to be the left quarterback. */
    const names = await page.$$eval('.matchup-detail__side-name', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.deepEqual(names, ["Andre's Death Dealers", 'Gridiron Heretics']);
    assert.equal(rows[0].left, 'J. Hurts');
    assert.equal(rows[0].right, 'J. Allen');
    assert.deepEqual(rows[0].points, ['22.4', '23.7']);

    /* An unset starting slot. Nothing invents a number for it. */
    const flex = rows[6];
    assert.equal(flex.right, 'Empty');
    assert.equal(
      flex.points[1],
      '—',
      'an empty starting slot is showing a projection, which is a number nobody produced',
    );
  } finally {
    await page.close();
  }
});

test('the over/under is posted once, and each side carries its own three numbers', async () => {
  const page = await openScene();
  try {
    const totals = await page.$$eval('.matchup-detail__total', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.deepEqual(totals, ['259.3'], 'the game total is posted more than once, which reads as two totals');

    const sides = await page.$$eval('.matchup-detail__side', (nodes) =>
      nodes.map((side) =>
        Object.fromEntries(
          [...side.querySelectorAll('.matchup-detail__market')].map((market) => [
            market.querySelector('dt').textContent,
            market.querySelector('dd').textContent,
          ]),
        ),
      ),
    );

    assert.equal(sides.length, 2);
    assert.deepEqual(sides[0], { Spread: '+4.5', Win: '46%', Proj: '127.4', Price: '+118' });
    assert.deepEqual(sides[1], { Spread: '-4.5', Win: '54%', Proj: '131.9', Price: '-142' });

    /* The two win probabilities are one game, so they add to a hundred.
       A panel that prints two favourites is the defect opponentLineFrom
       exists to prevent, restated where a reader can see it. */
    const percents = sides.map((side) => Number.parseInt(side.Win, 10));
    assert.equal(percents[0] + percents[1], 100);
  } finally {
    await page.close();
  }
});

test('clicking another game opens that game', async () => {
  const page = await openScene();
  try {
    const cards = await page.$$('.matchup-slate__row-button');
    assert.equal(cards.length, 2, 'the fixture no longer has a second game to click');

    await cards[1].click();
    await page.waitForFunction(
      () => document.querySelector('.matchup-detail__side-name')?.textContent === 'Waiver Wire Wizards',
      null,
      { timeout: 5_000 },
    );

    /* This game's favourite is team B, so the board swaps the seats. Every
       number already follows a team across that swap; the lineups have to
       as well, or the panel puts one team's players under the other team's
       name - and it would still look entirely plausible while doing it. */
    const names = await page.$$eval('.matchup-detail__side-name', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.deepEqual(names, ['Waiver Wire Wizards', 'Sunday Scaries']);

    const seated = await page.$eval('.matchup-detail__row', (row) =>
      [...row.querySelectorAll('.matchup-detail__player-name')].map((node) => node.textContent),
    );
    assert.deepEqual(
      seated,
      ['J. Hurts', 'J. Allen'],
      "the lineups did not follow their teams across the seating swap",
    );
  } finally {
    await page.close();
  }
});

test('no slot is coloured like money', async () => {
  const page = await openScene();
  try {
    const colours = await page.$$eval('.matchup-detail *', (nodes) =>
      nodes.map((node) => getComputedStyle(node).color),
    );
    const money = colours.filter((colour) => colour === GREEN || colour === RED);
    assert.deepEqual(
      money,
      [],
      'the detail panel is using green or red, which mean money everywhere else in the product',
    );
  } finally {
    await page.close();
  }
});

for (const width of [1320, 1024, 768, 390, 375]) {
  test(`nothing spills out of the panel at ${width}px`, async () => {
    const page = await openScene(width);
    try {
      const overflow = await page.$$eval('.matchup-detail, .matchup-detail *', (nodes) =>
        nodes
          .filter((node) => node.checkVisibility())
          .filter((node) => node.scrollWidth > node.clientWidth + 1)
          .map((node) => ({
            className: node.className,
            text: (node.textContent ?? '').slice(0, 40),
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
          })),
      );
      assert.deepEqual(overflow, [], `content overflows its box at ${width}px`);

      const bodyScrolls = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      assert.equal(bodyScrolls, false, `the page scrolls sideways at ${width}px`);
    } finally {
      await page.close();
    }
  });
}
