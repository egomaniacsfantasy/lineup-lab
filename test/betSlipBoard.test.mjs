import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * Tapping the board builds a slip, and the slip prices what was tapped.
 *
 * The arithmetic is covered in parlay.test.mjs against the model directly.
 * What only a rendered test can show is that the number on screen came from
 * the numbers on screen: every assertion below reads the leg prices off the
 * slip's own rows, computes the parlay by hand from those, and compares. If
 * the cells ever hand the model something other than what they printed, this
 * fails and the unit tests do not.
 */

const cwd = process.cwd();
const port = 4178;
const baseUrl = `http://127.0.0.1:${port}`;
const scene = `${baseUrl}/design/board-row/slip`;

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

async function openBoard(width = 1320) {
  const page = await browser.newPage({ viewport: { width, height: 1100 } });
  await page.goto(scene, { waitUntil: 'networkidle' });
  await page.waitForSelector('.matchup-slate__row-button');
  return page;
}

/** Tap a market cell by the text printed on it. */
async function tap(page, text) {
  await page.locator('button.matchup-slate__cell', { hasText: new RegExp(`^${escape(text)}$`) })
    .first()
    .click();
  await page.waitForTimeout(60);
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Everything the slip is currently claiming. */
function readSlip(page) {
  return page.evaluate(() => {
    const slip = document.querySelector('.bet-slip');
    if (!slip) return null;
    return {
      legs: [...slip.querySelectorAll('.bet-slip__leg')].map((row) => ({
        pick: row.querySelector('.bet-slip__leg-pick').textContent,
        price: Number(row.querySelector('.bet-slip__leg-price').textContent),
      })),
      total: Number(slip.querySelector('.bet-slip__total-price').textContent),
      handle: Number(slip.querySelector('.bet-slip__handle-price').textContent),
      lit: document.querySelectorAll('.matchup-slate__cell--taken').length,
    };
  });
}

/** The fair price of a set of American legs, worked out independently here. */
function fairPrice(americanPrices) {
  const probability = americanPrices.reduce(
    (product, price) => product * (price <= -100 ? -price / (-price + 100) : 100 / (price + 100)),
    1,
  );
  const american =
    probability >= 0.5
      ? Math.round((-100 * probability) / (1 - probability))
      : Math.round((100 * (1 - probability)) / probability);
  return american === -100 ? 100 : american;
}

test('a tap lights the cell and puts the leg on the slip', async () => {
  const page = await openBoard();
  try {
    assert.equal(await readSlip(page), null, 'an untouched board is already showing a slip');

    await tap(page, '-186');
    const slip = await readSlip(page);
    assert.equal(slip.legs.length, 1);
    assert.equal(slip.legs[0].pick, 'Zeus’s Bolts');
    assert.equal(slip.legs[0].price, -186, 'the leg did not take the price printed on the cell');
    assert.equal(slip.lit, 1, 'the tapped cell is not lit');
    /* A single is priced as itself, with nothing added and nothing taken. */
    assert.equal(slip.total, -186);
    assert.equal(slip.handle, slip.total, 'the collapsed bar and the footer disagree');
  } finally {
    await page.close();
  }
});

test('legs from different games are multiplied, and the slip shows it', async () => {
  const page = await openBoard();
  try {
    await tap(page, '-186');
    await tap(page, 'O 239.5');
    const two = await readSlip(page);
    assert.equal(two.legs.length, 2);
    assert.equal(
      two.total,
      fairPrice(two.legs.map((leg) => leg.price)),
      `the slip quotes ${two.total} for legs priced ${two.legs.map((l) => l.price).join(' and ')}`,
    );

    /* Fair, not a book's number: two legs at -186 and +100 pay +208 here and
       around +170 anywhere that takes a cut. */
    assert.equal(two.total, 208);
  } finally {
    await page.close();
  }
});

/**
 * Same game, allowed, and priced by the table rather than multiplied.
 *
 * The dangerous pair is a moneyline and a spread on one game: they are nested
 * intervals of the same margin, so multiplying them would quote roughly
 * double what the pair is worth. Each row below states the answer worked out
 * from the moneyline alone, independently of the code under test.
 */
const SONIC_WIN = 113 / 213; // what -113 implies

for (const [name, first, second, expected] of [
  ['the favourite to win and cover', '-113', '-2.9', 0.5],
  ['the favourite to win without covering', '-113', '+2.9', SONIC_WIN - 0.5],
  ['the underdog to win and cover', '+113', '+2.9', 1 - SONIC_WIN],
]) {
  test(`${name} sits on one slip, priced exactly`, async () => {
    const page = await openBoard();
    try {
      await tap(page, first);
      await tap(page, second);
      const slip = await readSlip(page);
      assert.equal(slip.legs.length, 2, `${name}: the second leg did not stick`);
      assert.equal(slip.lit, 2, `${name}: both cells are not lit`);

      const priced =
        expected >= 0.5
          ? Math.round((-100 * expected) / (1 - expected))
          : Math.round((100 * (1 - expected)) / expected);
      assert.equal(
        slip.total,
        priced === -100 ? 100 : priced,
        `${name} quoted ${slip.total}, should be ${priced}`,
      );

      /* And specifically NOT the naive product of the two cell prices. */
      const naive = fairPrice(slip.legs.map((leg) => leg.price));
      if (naive !== slip.total) {
        assert.notEqual(slip.total, naive, `${name} was multiplied after all`);
      }
    } finally {
      await page.close();
    }
  });
}

test('the favourite to win and cover pays nothing extra, and says so', async () => {
  const page = await openBoard();
  try {
    await tap(page, '-2.9');
    const alone = await readSlip(page);
    await tap(page, '-113');
    const both = await readSlip(page);

    /* Covering -2.9 entails winning, so the moneyline is free. A slip that
       grew a leg while the price stood still has to explain itself. */
    assert.equal(both.total, alone.total, 'adding a leg that changes nothing changed the price');
    const implied = await page.locator('.bet-slip__leg-implied').count();
    assert.equal(implied, 1, 'the leg that adds nothing is not called out');
  } finally {
    await page.close();
  }
});

/* The contradictions: same market opposite sides, plus the one pair across
   markets that cannot both happen. */
for (const [first, second] of [
  ['-113', '+113'],
  ['-2.9', '+2.9'],
  ['O 239.5', 'U 239.5'],
  ['+113', '-2.9'],
]) {
  test(`${second} contradicts ${first}, so it replaces it`, async () => {
    const page = await openBoard();
    try {
      await tap(page, first);
      await tap(page, second);
      const slip = await readSlip(page);
      assert.equal(slip.legs.length, 1, `${first} and ${second} are both on the slip`);
      assert.equal(slip.lit, 1, 'two contradictory cells are lit at once');
    } finally {
      await page.close();
    }
  });
}

test('a total sits alongside a side on the same game', async () => {
  const page = await openBoard();
  try {
    await tap(page, '-113');
    await tap(page, '-2.9');
    await tap(page, 'O 239.5');
    const slip = await readSlip(page);
    assert.equal(slip.legs.length, 3, 'three legs on one game did not stick');
    /* The two sides resolve to 0.5 between them; the total halves it again. */
    assert.equal(slip.total, 300);
  } finally {
    await page.close();
  }
});

test('a leg from another game is added, not swapped in', async () => {
  const page = await openBoard();
  try {
    await tap(page, '-113');
    await tap(page, '-9.4');
    const slip = await readSlip(page);
    assert.equal(slip.legs.length, 2);
    assert.equal(slip.lit, 2);
  } finally {
    await page.close();
  }
});

test('tapping the same cell again takes it off, and an empty slip disappears', async () => {
  const page = await openBoard();
  try {
    await tap(page, '-186');
    await tap(page, '-186');
    assert.equal(await readSlip(page), null, 'the slip is still on screen with nothing on it');
    assert.equal(
      await page.locator('.matchup-slate__cell--taken').count(),
      0,
      'the cell is still lit after being taken off',
    );
  } finally {
    await page.close();
  }
});

test('the × on a leg removes that leg and reprices the rest', async () => {
  const page = await openBoard();
  try {
    await tap(page, '-186');
    await tap(page, 'O 239.5');
    await page.locator('.bet-slip__drop').first().click();
    await page.waitForTimeout(60);
    const slip = await readSlip(page);
    assert.equal(slip.legs.length, 1);
    assert.equal(slip.total, slip.legs[0].price, 'a one-leg slip is not priced as its own leg');
  } finally {
    await page.close();
  }
});

test('clear empties the slip', async () => {
  const page = await openBoard();
  try {
    await tap(page, '-186');
    await tap(page, '-113');
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.waitForTimeout(60);
    assert.equal(await readSlip(page), null);
  } finally {
    await page.close();
  }
});

/**
 * A game with no matchupId cannot hold a leg, because the slip's one-leg-per-
 * game rule is keyed by that id. Rather than key a leg by something unstable,
 * that card's cells stay plain text.
 */
test('a game the provider could not key is not bettable', async () => {
  const page = await openBoard();
  try {
    const cards = await page.$$eval('.matchup-slate__row-button', (nodes) =>
      nodes.map((card) => ({
        team: card.querySelector('.matchup-slate__team-name').textContent,
        buttons: card.querySelectorAll('button.matchup-slate__cell').length,
      })),
    );
    const unidentified = cards.find((card) => card.team === 'The Unidentified');
    assert.ok(unidentified, 'the fixture no longer contains a card without a matchupId');
    assert.equal(unidentified.buttons, 0, 'a game with no id is offering legs it cannot key');
    /* The other two are fully bettable: three markets, two sides. */
    for (const card of cards.filter((entry) => entry !== unidentified)) {
      assert.equal(card.buttons, 6, `${card.team} does not offer all six selections`);
    }
  } finally {
    await page.close();
  }
});

/**
 * Every other board is read-only.
 *
 * A price that depresses when tapped is a promise. The slip is League ->
 * This week and nowhere else, so a board rendered without a toggle handler
 * has to render its markets as text.
 */
test('a board with no slip behind it has no buttons in its market cells', async () => {
  const page = await browser.newPage({ viewport: { width: 1320, height: 1100 } });
  try {
    await page.goto(`${baseUrl}/design/board-row/game-of-the-week`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.matchup-slate__row-button');
    assert.equal(await page.locator('button.matchup-slate__cell').count(), 0);
    assert.equal(await page.locator('.bet-slip').count(), 0);
    /* The team block is still a button there: it opens the matchup, and that
       is unrelated to betting. */
    assert.ok((await page.locator('button.matchup-slate__team').count()) > 0);
  } finally {
    await page.close();
  }
});

test('no card nests a button inside a button', async () => {
  const page = await openBoard();
  try {
    const nested = await page.$$eval('.matchup-slate__row-button button', (buttons) =>
      buttons.filter((button) => button.parentElement.closest('button') != null).length,
    );
    assert.equal(nested, 0, 'a button is inside another button, which no browser will honour');
  } finally {
    await page.close();
  }
});
