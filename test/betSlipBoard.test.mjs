import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
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

/* Vite serves the module from the page's registry, so a new page is not a new
   module graph. Without this, editing the card and rerunning the guard
   measures the previous build. */
let nonce = 0;
const nextNonce = () => `${process.pid}-${(nonce += 1)}`;

/** A slip of `count` legs, cycling through all three markets. */
function slip(count) {
  return Array.from({ length: count }, (_, index) => {
    const market = ['moneyline', 'spread', 'total'][index % 3];
    return {
      matchupId: index,
      market,
      selection: market === 'total' ? 'over' : 'a',
      probability: 0.5,
      /* Deliberately long: a real league is full of names like this, and the
         card has to shrink them rather than run them under the price. */
      label: market === 'total' ? 'Over' : `Team Number ${index + 1} With A Very Long Name`,
      line: market === 'moneyline' ? '' : market === 'spread' ? '-4.5' : '231.5',
      price: index % 2 ? -142 : 118,
      matchupLabel: `Team ${index + 1} vs Team ${index + 40}`,
      opponent: market === 'total' ? undefined : `Opponent ${index + 1}`,
      avatarUrl: null,
    };
  });
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

/**
 * The whole card selects, and taking a price does not.
 *
 * Both halves shipped wrong. Only the team block selected the matchup, which
 * is invisible as a rule: a card looks like one object you can press, and
 * four fifths of this one did nothing. And once the card became clickable,
 * the market cells sit inside it, so a tap on a price would have selected the
 * game as well as taking the leg unless it stops the click.
 */
test('clicking anywhere on a card selects that matchup', async () => {
  const page = await openBoard();
  try {
    const selected = () =>
      page.$eval('.matchup-slate__detail-head strong', (node) => node.textContent);
    const before = await selected();

    /* The separator between the two teams: as dead as dead space gets, and
       squarely inside the card. */
    await page.locator('.matchup-slate__row-button').nth(1).locator('.matchup-slate__at').click();
    await page.waitForTimeout(120);
    const after = await selected();
    assert.notEqual(after, before, 'clicking inside a card did not select it');

    /* And it is the ring, not just the rail, that says so. */
    const ringed = await page.$$eval('.matchup-slate__row-button--selected', (cards) => cards.length);
    assert.equal(ringed, 1, `${ringed} cards are marked selected`);
  } finally {
    await page.close();
  }
});

test('taking a price does not drag the selection onto that game', async () => {
  const page = await openBoard();
  try {
    const selected = () =>
      page.$eval('.matchup-slate__detail-head strong', (node) => node.textContent);

    /* Select the second card, then take a leg on the FIRST one. */
    await page.locator('.matchup-slate__row-button').nth(1).locator('.matchup-slate__at').click();
    await page.waitForTimeout(120);
    const parked = await selected();

    await page
      .locator('.matchup-slate__row-button')
      .nth(0)
      .locator('button.matchup-slate__cell')
      .first()
      .click();
    await page.waitForTimeout(120);

    assert.equal(await selected(), parked, 'taking a price moved the detail rail off the game being read');
    assert.equal(
      await page.locator('.matchup-slate__cell--taken').count(),
      1,
      'the price did not go on the slip',
    );
  } finally {
    await page.close();
  }
});

/**
 * A selected card has to be obvious at a glance.
 *
 * It was a 62% amber border against a hover state that is already 42% amber:
 * a difference you had to look for, on the one card the whole right-hand rail
 * is describing.
 */
test('the selected card is in a different class from hover, not a shade along it', async () => {
  const page = await openBoard();
  try {
    const style = await page.$eval('.matchup-slate__row-button--selected', (card) => {
      const computed = getComputedStyle(card);
      return { border: computed.borderTopColor, shadow: computed.boxShadow };
    });

    /* Full-strength amber, not a wash of it. */
    assert.match(style.border, /rgb\(232,\s*84,\s*29\)/, `selected border is ${style.border}`);
    /* And a ring outside the edge, which is what carries at a glance. */
    assert.notEqual(style.shadow, 'none', 'the selected card has no ring');
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

/* ──────────────────────────────────────────────────────────────────────────
   The share card: the same slip, as a picture.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Draw the card and measure it row by row.
 *
 * Each row is compared against its own leftmost pixel rather than one global
 * background sample: the card paints a gradient wash behind its top third, so
 * a single corner sample makes every hero row look painted.
 */
async function profile(legs) {
  const page = await browser.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    return await page.evaluate(
      async ({ legs, nonce }) => {
        const mod = await import(`/src/utils/parlayCard.ts?guard=${nonce}`);
        /* No art: the logo and the crests are network-dependent and this is a
           measurement of layout, not of asset loading. */
        const canvas = await mod.drawParlayCard(
          {
            eyebrow: 'Week 8',
            leagueName: 'Mount Olympus',
            you: 'Zeus’s Bolts',
            legs,
            price: '+184920',
          },
          { withArt: false },
        );
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const { data: px } = ctx.getImageData(0, 0, W, H);
        const at = (x, y) => {
          const i = (y * W + x) * 4;
          return [px[i], px[i + 1], px[i + 2]];
        };
        const differs = (a, b) =>
          Math.abs(a[0] - b[0]) > 10 || Math.abs(a[1] - b[1]) > 10 || Math.abs(a[2] - b[2]) > 10;

        const PAD = 88;
        /* The gutter is never drawn into, so x=2 is this row's background. */
        const painted = [];
        for (let y = 0; y < H; y += 1) {
          const reference = at(2, y);
          let hits = 0;
          for (let x = PAD; x < W - PAD; x += 2) {
            if (differs(at(x, y), reference)) hits += 1;
          }
          painted.push(hits);
        }

        /* Full bleed means the paint reaches the edges, so look at the edges. */
        const plain = at(2, H - 130);
        const barEdges = [];
        for (let y = H - 100; y < H - 4; y += 1) {
          barEdges.push(differs(at(0, y), plain) && differs(at(W - 1, y), plain));
        }

        return {
        width: W,
        height: H,
        painted,
        barEdges,
        expected: mod.parlayCardHeight(legs.length),
        /* One leg's worth of card, measured rather than hardcoded, so the
           panel checks below follow the layout when it is retuned. */
        row: mod.parlayCardHeight(2) - mod.parlayCardHeight(1),
      };
      },
      { legs, nonce: nextNonce() },
    );
  } finally {
    await page.close();
  }
}

/** Runs of consecutive rows with at least `floor` painted samples. */
function bands(painted, from, to, floor) {
  const found = [];
  let start = null;
  for (let y = from; y < to; y += 1) {
    if (painted[y] >= floor) {
      if (start == null) start = y;
    } else if (start != null) {
      found.push({ top: start, bottom: y, height: y - start });
      start = null;
    }
  }
  if (start != null) found.push({ top: start, bottom: to, height: to - start });
  return found;
}

/* One leg, a normal slip, and a slip nobody should build but somebody will. */
for (const count of [1, 3, 20]) {
  test(`a ${count}-leg card is exactly as tall as ${count} legs need`, async () => {
    const card = await profile(slip(count));
    assert.equal(card.width, 1080, 'the card is no longer the width of every other card');
    assert.equal(card.height, card.expected, 'the canvas and parlayCardHeight disagree');

    /* Each leg panel is a filled surface spanning the card, so panels read as
       wide painted bands and the gaps between them read as background. That
       is the count: if a leg is dropped or two overlap, this is not 20. */
    const panels = bands(card.painted, 440, card.height - 108, 380);
    assert.equal(panels.length, count, `${panels.length} leg panels were painted, not ${count}`);

    for (const panel of panels) {
      assert.ok(
        panel.height < card.row - 8,
        `a leg panel is ${panel.height}px of a ${card.row}px row, so two rows have run together`,
      );
    }

    /* And nothing bleeds OUT of a panel, which is what a name too long for
       its row does. Measured at the middle of each gap: seven pixels clear of
       the panels' rounded corners, and pure background unless something has
       spilled into it. The panel-height check above cannot see this, because
       text is far too sparse to reach the fill's threshold. */
    for (let i = 0; i + 1 < panels.length; i += 1) {
      const middle = Math.round((panels[i].bottom + panels[i + 1].top) / 2);
      assert.equal(
        card.painted[middle],
        0,
        `a leg is painting into the gap under it at y=${middle}`,
      );
    }
  });
}

test('the card grows by exactly one row per leg', async () => {
  const [one, two, twenty] = await Promise.all([
    profile(slip(1)),
    profile(slip(2)),
    profile(slip(20)),
  ]);
  const row = two.height - one.height;
  assert.ok(row > 80, `a leg adds only ${row}px, which is not a row`);
  assert.equal(
    twenty.height - one.height,
    row * 19,
    'height stops being linear in the number of legs somewhere between 2 and 20',
  );
});

test('the plug is full bleed and pinned to the bottom, at any length', async () => {
  for (const count of [1, 20]) {
    const card = await profile(slip(count));
    assert.ok(
      card.barEdges.every(Boolean),
      `a ${count}-leg card's plug bar does not reach both edges`,
    );

    /* And there is no hole above it. The hub card once left a chart-sized gap
       between its last row and the plug; on a card whose height is computed,
       that failure mode is a constant that stopped matching. */
    const lastPaint = card.painted.slice(0, card.height - 108).reduce(
      (last, hits, y) => (hits > 0 ? y : last),
      0,
    );
    const hole = card.height - 108 - lastPaint;
    assert.ok(hole < 60, `a ${count}-leg card leaves a ${hole}px hole above the plug`);
  }
});

/**
 * The price is the reason anyone shares this.
 *
 * Measured rather than asserted from the font string: what matters is how
 * tall the number actually paints, against the tallest thing in any leg row.
 */
test('the price is set far larger than anything else on the card', async () => {
  const card = await profile(slip(3));

  const hero = bands(card.painted, 240, 460, 8);
  const tallest = hero.reduce((max, band) => Math.max(max, band.height), 0);
  assert.ok(tallest >= 110, `the price paints only ${tallest}px tall`);

  /* A leg's text sits inside a 100px panel, so nothing down there can rival
     it. Compare against the panel rather than the text to keep the assertion
     independent of how the row is laid out. */
  assert.ok(tallest > 100, 'the price is no taller than a whole leg row');
});

test('no money anywhere on the card', async () => {
  const source = await fs.readFile(path.resolve('src/utils/parlayCard.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(source.includes('/*'), 'the file has no comments, so this check proves nothing');
  assert.doesNotMatch(code, /\/\*/, 'comments were not stripped');

  /* Same guard the slip carries. A card is the thing that leaves the app, so
     it is the last place a stake could appear and the worst place. */
  for (const pattern of [/\$(?!\{)/, /\bwager\b/i, /\bstake\b/i, /\bpayout\b/i, /\bto win\b/i]) {
    assert.doesNotMatch(code, pattern, `the card mentions money: ${pattern}`);
  }
  /* And no result: this card is made before the games, not after them. */
  assert.doesNotMatch(code, /\bcashed out\b|\bwon\b|\blost\b|\bfinal\b/i);
});
