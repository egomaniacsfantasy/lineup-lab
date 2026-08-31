import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
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

test('the loading churn can never be read as a real probability', async () => {
  /**
   * The risk this design carries, stated plainly.
   *
   * The waiting state puts moving figures in the exact slots the real playoff
   * probabilities will occupy. That is the effect asked for and it is the
   * right one — a probability engine should look like it is searching — but a
   * fabricated number sitting still in that slot is precisely what this
   * widget must never render. Its own doc comment says a fork with invented
   * branches is worse than no fork.
   *
   * Two properties keep it honest, and both are exercised against the real
   * thing rather than a copy of it: no figure is ever handed to assistive
   * technology, and none holds still across consecutive ticks.
   */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  /* ?slowForks holds the fixture back so the waiting state is actually on
     screen; without it the design scene answers instantly and this would be
     asserting against a state it never reached. */
  await page.goto(`${baseUrl}/design/league?view=this-week&slowForks=4000`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.week-fork--loading .week-fork__churn');

  const rendered = await page.evaluate(() => {
    const figures = [...document.querySelectorAll('.week-fork__churn')];
    return {
      count: figures.length,
      allHidden: figures.every((node) => node.getAttribute('aria-hidden') === 'true'),
      /* Nothing on screen may claim to be a measurement. */
      anyPercent: figures.some((node) => node.textContent.includes('%')),
      widths: [...new Set(figures.map((node) => node.textContent.trim().length))],
      legs: document.querySelectorAll('.week-fork--loading .week-fork__ghost-leg').length,
    };
  });

  await page.close();

  assert.ok(rendered.count > 0, 'the waiting state rendered no churning figures');
  assert.ok(rendered.allHidden, 'a churning figure is read aloud as a probability');
  assert.equal(rendered.anyPercent, false, 'a churning figure is dressed as a percentage');
  assert.deepEqual(rendered.widths, [2], 'the churn changes width, which makes the strip twitch');
  assert.ok(rendered.legs > 0, 'the swaying bars are gone');

  /* And the generator itself: consecutive ticks must never repeat, or a
     figure holds still long enough to be read off the screen. */
  const { churn } = await import('../src/utils/forkRows.ts');
  for (const seed of [0, 3, 11, 97]) {
    const values = Array.from({ length: 200 }, (_, tick) => churn(tick, seed));
    assert.ok(
      values.every((value) => String(value).length === 2),
      `churn(seed ${seed}) produced a value that is not two digits`,
    );
    const stuck = values.findIndex((value, index) => index > 0 && value === values[index - 1]);
    assert.equal(
      stuck,
      -1,
      `churn(seed ${seed}) repeated ${values[stuck]} across ticks ${stuck - 1} and ${stuck}`,
    );
  }
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

/* ──────────────────────────────────────────────────────────────────────────
   The Predictor's waiting state, on the same page and the same dev server.

   Andre found this in a real league: RECORD and PF were live while PLAYOFFS
   and TITLE shimmered, so the board looked ready and the two columns anyone
   is actually there for were missing. His words were that he would rather a
   spinning wheel than a surface that looks usable and is not.

   It went unnoticed for so long because it could not be reached: the
   conditioned fetch did not consult the design fixtures, so every pick in a
   fixture league answered 500 and the waiting state never appeared at all.
   ────────────────────────────────────────────────────────────────────────── */

async function callFirstGame(page) {
  await page.goto(`${baseUrl}/design/league?view=predictor&slowPredictor=1`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('button.predictor__side');
  await page.locator('button.predictor__side').first().click();
  return page;
}

test('a pick puts the whole board into one waiting state, not a half-filled table', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await callFirstGame(page);
    await page.waitForSelector('.predictor__busy');

    const waiting = await page.evaluate(() => ({
      busy: document.querySelectorAll('.predictor__busy').length,
      /* The rows go entirely. A table with its two simulated columns blanked
         and everything else live is the thing being fixed. */
      rows: document.querySelectorAll('.predictor__row').length,
      height: document.querySelector('.predictor__busy').getBoundingClientRect().height,
      /* And it says what it is doing. */
      says: document.querySelector('.predictor__busy').textContent.trim().length > 0,
    }));

    assert.equal(waiting.busy, 1, 'a pick did not put the board into a waiting state');
    assert.equal(waiting.rows, 0, 'the board is still showing rows it cannot fill');
    assert.ok(waiting.says, 'the waiting state says nothing about what it is waiting for');
    /* Held to the height of the table it replaces, or the column collapses
       and snaps back on every single pick. */
    assert.ok(waiting.height > 180, `the waiting panel is only ${waiting.height}px tall`);
  } finally {
    await page.close();
  }
});

test('the wait ends in a board that has moved, and says by how much', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await callFirstGame(page);
    await page.waitForSelector('.predictor__row', { timeout: 20_000 });

    const settled = await page.evaluate(() => ({
      busy: document.querySelectorAll('.predictor__busy').length,
      rows: document.querySelectorAll('.predictor__row').length,
      /* The payoff. Calling a game is supposed to move the board, and a board
         that comes back identical has not answered anything. */
      deltas: [...document.querySelectorAll('.predictor__delta')].map((node) => node.textContent),
    }));

    assert.equal(settled.busy, 0, 'the board is still waiting after it answered');
    assert.ok(settled.rows > 0, 'the board came back empty');
    assert.ok(settled.deltas.length > 0, 'nothing on the board moved when a game was called');
    /* Signed, so it reads as a movement rather than a second number. */
    assert.ok(
      settled.deltas.every((delta) => /^[+\u2212-]/.test(delta)),
      `a delta is unsigned: ${settled.deltas.join(', ')}`,
    );
  } finally {
    await page.close();
  }
});

/* Two widths. 1440 is a comfortable desktop; 1220 is the narrowest window
   where the body is still two columns, so the board is at its tightest while
   sharing the page. That is where a five-column grid with a zero floor
   squeezed every team name out of existence, and it is invisible at 1440. */
for (const width of [1440, 1220]) {
test(`the board reads as a shape, not twelve numbers to compare by hand, at ${width}px`, async () => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await callFirstGame(page);
    await page.waitForSelector('.predictor__row', { timeout: 20_000 });

    const board = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.predictor__row')];
      return {
        rows: rows.length,
        /* A meter per row, and its fill proportional to the number beside it.
           A column of right-aligned percentages is twelve figures you hold in
           your head to compare; a bar is a shape you read at once. */
        meters: rows.map((row) => {
          const meter = row.querySelector('.predictor__meter');
          const value = row.querySelector('.predictor__meter-value');
          return {
            fill: meter ? parseFloat(getComputedStyle(meter).width) : null,
            track: meter ? parseFloat(getComputedStyle(meter.parentElement).width) : null,
            hasValue: Boolean(value && value.textContent.trim()),
          };
        }),
        /* The team column must never collapse: a five-column grid with a zero
           floor squeezed every name out of the board on a narrow panel. */
        names: rows.map((row) => row.querySelector('.predictor__row-name').getBoundingClientRect().width),
      };
    });

    assert.ok(board.rows > 0, 'the board rendered no rows');
    assert.ok(board.meters.every((m) => m.fill != null), 'a row has no meter');
    assert.ok(board.meters.every((m) => m.hasValue), 'a meter carries no number');
    assert.ok(
      board.meters.every((m) => m.fill <= m.track + 1),
      'a meter overflows its track',
    );
    /* Not every bar the same length, or it is decoration rather than data. */
    assert.ok(
      new Set(board.meters.map((m) => Math.round(m.fill))).size > 1,
      'every meter is the same width, so it is not showing anything',
    );
    assert.ok(
      board.names.every((width) => width > 20),
      `a team name column collapsed: ${board.names.map((w) => Math.round(w)).join(', ')}`,
    );
  } finally {
    await page.close();
  }
});
}

test('a called side is amber on both halves of the card', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${baseUrl}/design/league?view=predictor`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.predictor__game');

    /* One pick on the LEFT of one game and one on the RIGHT of another,
       because a duplicate --picked rule four hundred lines below the real one
       used to win on source order for left-hand picks only: the --home
       variant carries two classes and outranked it. One called game came out
       green and the next amber, on the same board. */
    const games = page.locator('.predictor__game');
    await games.first().locator('button.predictor__side').first().click();
    await games.last().locator('button.predictor__side').last().click();
    await page.waitForFunction(
      () => document.querySelectorAll('.predictor__side--picked').length === 2,
      undefined,
      { timeout: 10_000 },
    );

    const fills = await page.$$eval('.predictor__side--picked', (nodes) =>
      nodes.map((node) => ({
        home: node.classList.contains('predictor__side--home'),
        fill: getComputedStyle(node).backgroundImage,
      })),
    );

    assert.equal(fills.length, 2, 'both picks did not stick');
    /* And one of each, or this proves nothing about the specificity clash. */
    assert.equal(new Set(fills.map((f) => f.home)).size, 2, 'both picks are on the same side');
    for (const { fill, home } of fills) {
      assert.match(fill, /232, 84, 29/, `a called ${home ? 'right' : 'left'} side is not amber: ${fill}`);
      assert.doesNotMatch(fill, /210, 123|58, 210/, `a called ${home ? 'right' : 'left'} side is green`);
    }
  } finally {
    await page.close();
  }
});

/**
 * The season strip has to look like a season.
 *
 * The heat ramp mapped 0-100 across its whole range, and a fantasy schedule
 * never leaves the 40-62 band, so the softest week of a year came out 23% of
 * the way from neutral to green. Seventeen genuinely different weeks rendered
 * as seventeen identical dark boxes, which is a chart that has stopped
 * charting. This measures the paint, because that was the failure.
 *
 * What it measures is HUE, not vividness. The bug was that the ramp did not
 * resolve the range weeks fall in, so every chip came out the same colour
 * whatever its number; that is a property, and it is the one asserted here.
 * How strongly the hue is mixed into the chip is a taste dial, and dialling
 * it down does not fail these tests. That is deliberate: inventing a
 * brightness threshold would dress a preference up as a correctness check.
 */
test('a favoured week and a hard one are visibly different colours', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${baseUrl}/design/league?view=season`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.schedule-grid__heat-cell');

    /* Unplayed weeks only. A finished week is painted by its RESULT, full
       green for a win and full red for a loss, on purpose: it is a scoreboard
       and not a price. Comparing that paint against the probability in its
       title compares two different numbers. */
    const chips = await page.$$eval('.schedule-grid__heat-cell', (nodes) =>
      nodes
        .filter(
          (node) =>
            !node.classList.contains('schedule-grid__heat-cell--win') &&
            !node.classList.contains('schedule-grid__heat-cell--loss'),
        )
        .map((node) => {
          const title = node.getAttribute('title') ?? '';
          const match = title.match(/:\s*([\d.]+)%/);
          const rgb = getComputedStyle(node)
            .backgroundColor.match(/[\d.]+/g)
            ?.map(Number) ?? [];
          return match ? { prob: Number(match[1]), rgb } : null;
        })
        .filter(Boolean),
    );

    assert.ok(chips.length >= 3, `only ${chips.length} priced weeks to compare`);

    /* Colour channels are what the eye reads, so that is what is asserted.
       A week you are favoured in must be greener than it is red, and a week
       you are not must be the other way round. Normalised so the check does
       not care about the absolute mix, only which way it leans. */
    const lean = (rgb) => {
      const [r, g] = rgb;
      /* Divide by the pair's own sum, not by a floor of 1: Chromium reports
         this as color(srgb 0..1), so a floor of 1 silently turned every lean
         into a raw difference and flattened the whole comparison. */
      return (g - r) / Math.max(1e-6, g + r);
    };

    for (const chip of chips) {
      if (chip.prob >= 55) {
        assert.ok(
          lean(chip.rgb) > 0.1,
          `week at ${chip.prob}% is not green: rgb(${chip.rgb.join(', ')})`,
        );
      }
      if (chip.prob <= 45) {
        assert.ok(
          lean(chip.rgb) < -0.1,
          `week at ${chip.prob}% is not red: rgb(${chip.rgb.join(', ')})`,
        );
      }
    }

    /* And the two ends of the season must be far apart. This is the assertion
       that would have caught the original: every chip leaning the right way
       is worth nothing if they all lean by two percent. */
    const best = chips.reduce((a, b) => (b.prob > a.prob ? b : a));
    const worst = chips.reduce((a, b) => (b.prob < a.prob ? b : a));
    if (best.prob - worst.prob >= 8) {
      assert.ok(
        lean(best.rgb) - lean(worst.rgb) > 0.35,
        `the softest week (${best.prob}%) and the toughest (${worst.prob}%) are painted almost the same: leans ${lean(best.rgb).toFixed(2)} and ${lean(worst.rgb).toFixed(2)}`,
      );
    }
  } finally {
    await page.close();
  }
});

test('the strip says how many weeks you are favoured in, and counts them right', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${baseUrl}/design/league?view=season`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.schedule-grid__heat-cell');

    const { claim, probs } = await page.evaluate(() => {
      const strip = document.querySelector('.schedule-grid__heat-cell').closest('section, div');
      return {
        claim: (strip.textContent.match(/Favored in (\d+) of (\d+) weeks/) ?? []).slice(1).map(Number),
        probs: [...document.querySelectorAll('.schedule-grid__heat-cell')]
          .filter(
            (node) =>
              !node.classList.contains('schedule-grid__heat-cell--win') &&
              !node.classList.contains('schedule-grid__heat-cell--loss'),
          )
          .map((node) => (node.getAttribute('title') ?? '').match(/:\s*([\d.]+)%/))
          .filter(Boolean)
          .map((match) => Number(match[1])),
      };
    });

    assert.equal(claim.length, 2, 'the strip does not say how many weeks you are favoured in');
    const [favored, total] = claim;
    /* Counted independently here, off the chips' own titles, so the sentence
       has to agree with the strip it sits under rather than with itself. */
    assert.equal(total, probs.length, `the claim counts ${total} weeks, the strip shows ${probs.length}`);
    assert.equal(
      favored,
      probs.filter((prob) => prob > 50).length,
      `the claim says ${favored} favoured weeks, the chips show ${probs.filter((p) => p > 50).length}`,
    );
  } finally {
    await page.close();
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   The stale-season warning has to be VISIBLE, which is a different claim
   from being rendered.

   The predicate behind it was right from the day it shipped and the banner
   was still useless: as a flex child of the shell it rendered at y=0,
   underneath a position:fixed header 80px tall at z-index 21. Six pixels of
   it showed. A test that only asks whether the component is in the DOM
   passes happily while nobody can read a word of it, so this one asks the
   page what is actually painted at the banner's own centre.

   Here rather than in its own file because every rendered test in this repo
   runs its own Vite, and a ninth one pushes this machine far enough that the
   fork tests above time out waiting for their server.
   ────────────────────────────────────────────────────────────────────────── */

test('a stale-season warning is on top of the page, not under the header', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  try {
    /* ?staleSeason makes the design league answer as last year's, which is
       the only way to reach this state without a real rolled-over league. */
    await page.goto(`${baseUrl}/design/league?staleSeason=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.stale-season', { timeout: 15_000 });

    const seen = await page.evaluate(() => {
      const notice = document.querySelector('.stale-season');
      const rect = notice.getBoundingClientRect();
      const header = document.querySelector('.app-header')?.getBoundingClientRect();
      const atCentre = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        height: rect.height,
        top: rect.top,
        headerBottom: header ? header.bottom : 0,
        /* The thing the old version failed: whatever is painted at the
           banner's own middle has to BE the banner. */
        onTop: notice.contains(atCentre) || atCentre === notice,
        /* Opaque, or the page scrolls through a sticky warning. */
        opaque: !/rgba\([^)]*,\s*0?\.\d+\)/.test(getComputedStyle(notice).backgroundColor),
        says: notice.textContent,
      };
    });

    assert.ok(seen.height > 20, `the banner is ${seen.height}px tall`);
    assert.ok(
      seen.top >= seen.headerBottom - 1,
      `the banner starts at ${seen.top} with the header ending at ${seen.headerBottom}, so it is underneath it`,
    );
    assert.ok(seen.onTop, 'something is painted over the middle of the banner');
    assert.ok(seen.opaque, 'the sticky banner is translucent, so the page reads through it');
    /* It names both years, because "your data is old" without saying how old
       is not actionable. */
    assert.match(seen.says, /2025/);
    assert.match(seen.says, /2026/);
  } finally {
    await page.close();
  }
});

/**
 * And it offers the league that replaced this one.
 *
 * Saying "the year is wrong, go to Connect" leaves someone to work out which
 * of their leagues is the right one, in a product where the whole problem is
 * that two of them look identical. The server walks previous_league_id the
 * other way, so the fix is one button.
 *
 * The two ways of finding nothing need different things said. A league whose
 * commissioner has not rolled it over yet is not a mistake the user made, and
 * offering to reconnect would send them looking for a league that does not
 * exist.
 */
test('the stale banner offers this season\'s league by name', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  try {
    await page.goto(`${baseUrl}/design/league?staleSeason=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.stale-season__action', { timeout: 15_000 });

    const seen = await page.evaluate(() => {
      const notice = document.querySelector('.stale-season');
      const action = notice.querySelector('.stale-season__action');
      return { text: notice.textContent, action: action.textContent.trim(), tag: action.tagName };
    });

    /* Named, not "your other league": the name is how someone recognises it. */
    assert.match(seen.text, /Odds Gods Design Replay is your 2026 league/);
    /* A control, not a link to go and hunt. */
    assert.equal(seen.tag, 'BUTTON');
    assert.match(seen.action, /2026/);
  } finally {
    await page.close();
  }
});

test('a league nobody has rolled over yet is not offered a switch', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  try {
    await page.goto(`${baseUrl}/design/league?staleSeason=1&notRolledOver=1`, {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.stale-season', { timeout: 15_000 });
    await page.waitForTimeout(900);

    const seen = await page.evaluate(() => {
      const notice = document.querySelector('.stale-season');
      return {
        text: notice.textContent,
        actions: notice.querySelectorAll('.stale-season__action').length,
      };
    });

    assert.match(seen.text, /nothing to switch to/i);
    /* No button and no link: there is genuinely nowhere to send them. */
    assert.equal(seen.actions, 0, 'offering a switch to a league that does not exist');
  } finally {
    await page.close();
  }
});

