import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The Predictor, late in a week and looking ahead.
 *
 * Three things a matchup card has to get right, each of which was wrong or
 * missing: a game that is already settled is shown and never asked for; the
 * number beside a team says it is a projection; and a week where a team is
 * missing starters names them.
 *
 * Rendered against the design league, which answers ?decided with one of
 * this week's three games priced 100.0 against 0.0.
 */

/* Its own Vite on its own port. Adopting another file's server inherits that
   file's lifetime. The design scenes need no API server. */
const PORT = 4195;
const baseUrl = `http://127.0.0.1:${PORT}`;

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

test.before(async () => {
  vite = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: process.cwd(), stdio: 'ignore' },
  );
  await waitForUrl(`${baseUrl}/design/league`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite) vite.kill('SIGTERM');
});

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(`${baseUrl}/design/league?view=predictor${query}`);
  /* A selector, not network idle: the projections arrive after first paint
     and the label is what several of these read. */
  await page.waitForSelector('.predictor__side-prob');
  return page;
}

const weekCount = (page) => page.locator('.predictor__weekcount').innerText();

test('a decided game is shown, locked, and not counted as a call to make', async () => {
  const page = await open('&decided');
  try {
    await page.waitForSelector('.predictor__game--decided');
    const card = page.locator('.predictor__game--decided');
    assert.equal(await card.count(), 1, 'exactly one of the three games is settled');

    const sides = card.locator('button.predictor__side');
    assert.deepEqual(
      await sides.evaluateAll((nodes) => nodes.map((node) => node.disabled)),
      [true, true],
      'a settled game still offers a pick',
    );
    assert.match(await card.locator('.predictor__side--won').innerText(), /Apollo Archers/);
    assert.match(await card.locator('.predictor__side--beaten').innerText(), /Athena Owls/);
    assert.match(await card.innerText(), /already decided/i);

    /* Forced past the disabled state, the way a stray handler would be. */
    await sides.first().click({ force: true });
    await sides.last().click({ force: true });
    assert.equal(await page.locator('.predictor__side--picked').count(), 0);

    assert.match(await weekCount(page), /0 of 2 called/);
    assert.match(await weekCount(page), /1 decided/);

    /* Calling one open game: the season total leaves the settled game out,
       so three weeks of three is eight to call rather than nine. */
    await page.locator('.predictor__game:not(.predictor__game--decided) button.predictor__side').first().click();
    await page.waitForSelector('.predictor__side--picked');
    assert.match(await page.locator('.predictor__sub').innerText(), /1 of 8 games called/);
    assert.match(await weekCount(page), /1 of 2 called/);
  } finally {
    await page.close();
  }
});

test('with nothing settled every game is open', async () => {
  const page = await open('');
  try {
    assert.equal(await page.locator('.predictor__game--decided').count(), 0);
    assert.equal(await page.locator('button.predictor__side:disabled').count(), 0);
    assert.match(await weekCount(page), /0 of 3 called/);
    assert.doesNotMatch(await weekCount(page), /decided/);
  } finally {
    await page.close();
  }
});

test('every number on a matchup says it is a projection', async () => {
  const page = await open('');
  try {
    for (const week of ['w8', 'w9']) {
      await page.selectOption('#predictor-week', week);
      const figures = await page.locator('.predictor__side-prob').allInnerTexts();
      assert.equal(figures.length, 6, `${week}: a side has no figure`);
      for (const figure of figures) {
        assert.match(figure, /^proj\s+\d+\.\d$/i, `${week}: "${figure}" is a bare number`);
      }
    }
  } finally {
    await page.close();
  }
});

test('key players on bye sit under their own team', async () => {
  const page = await open('');
  try {
    /* This week nobody in the fixture is on bye, so no row at all. */
    assert.equal(await page.locator('.predictor__byes').count(), 0);

    await page.selectOption('#predictor-week', 'w9');
    const row = page.locator('.predictor__game', { hasText: "Zeus's Bolts" }).locator('.predictor__bye');
    const [away, home] = await row.allInnerTexts();
    assert.match(away, /on bye\s+Justin Jefferson, CeeDee Lamb$/i);
    assert.match(home, /on bye\s+Derrick Henry$/i);
    /* Under the right team, measured: each half of the row lies within the
       horizontal span of the side above it. */
    const spans = await page
      .locator('.predictor__game', { hasText: "Zeus's Bolts" })
      .evaluate((game) => {
        const box = (node) => {
          const rect = node.getBoundingClientRect();
          return [rect.left, rect.right];
        };
        return {
          sides: [...game.querySelectorAll('.predictor__side')].map(box),
          byes: [...game.querySelectorAll('.predictor__bye')].map(box),
        };
      });
    spans.byes.forEach(([left, right], index) => {
      const [sideLeft, sideRight] = spans.sides[index];
      assert.ok(left >= sideLeft - 1 && right <= sideRight + 1, `bye column ${index} strays from its team`);
    });
    /* A game with nobody missing carries no row. */
    assert.equal(
      await page.locator('.predictor__game', { hasText: 'Poseidon Waves' }).locator('.predictor__byes').count(),
      0,
    );

    /* Three missing: two names and a count, not a paragraph. */
    await page.selectOption('#predictor-week', 'w10');
    const crowded = await page.locator('.predictor__bye', { hasText: /on bye/i }).allInnerTexts();
    assert.equal(crowded.length, 1);
    assert.match(crowded[0], /^on bye\s+[^,]+, [^,]+ \+1$/i);
  } finally {
    await page.close();
  }
});
