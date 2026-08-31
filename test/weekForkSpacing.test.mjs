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
/* This used to adopt the dev server on 4181 whenever it happened to be up,
   to save starting a second one.
   
   4181 belongs to mobileNoHorizontalScroll, which is a DIFFERENT test file and
   therefore a different process. The runner starts files concurrently, so that
   file finishes whenever it finishes and takes its server with it. Adopting it
   meant this file's remaining navigations died with ECONNREFUSED, and which
   tests died depended entirely on the relative speed of two unrelated files.
   Adding a test anywhere in the suite could move the boundary.
   
   That is the flake that has been blamed twice on "one Vite server too many".
   The count was a correlate: more load pushed the neighbour over the line
   sooner. The cause was borrowing a resource owned by a process that can exit.
   
   So it owns its own, always. A second Vite is cheaper than a suite whose
   failures move around when you touch an unrelated file. */
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
  if (!(await isPortOpen(OWN_PORT))) {
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
   THE SHELL'S NOTICE STRIP

   Two claims that keep coming apart: the strip has to be RENDERED, and it has
   to be VISIBLE. The predicate behind it was correct from the day it shipped
   and nobody could read a word of it, twice, for two different reasons.

   First it was a flex child of the shell, rendering at y=0 underneath a fixed
   80px header. Then it was sticky at the header's height, which double-counts
   the header because the scrollport already starts below it: the strip
   reserved its slot at the top of the content and painted itself 80px lower,
   behind the page's own sticky season band, which has the same z-index and
   comes later in the document. What the user saw was an empty gap and no
   message.

   So these ask the page what is actually painted at the strip's own centre,
   not whether the component exists.

   Here rather than in its own file because every rendered test in this repo
   runs its own Vite, and one more pushes this machine far enough that the
   fork tests above time out waiting for their server.
   ────────────────────────────────────────────────────────────────────────── */

/** Whatever the shell is currently saying, and whether it can be read. */
async function noticeState(page) {
  return page.evaluate(() => {
    const notice = document.querySelector('.shell-notice');
    if (!notice) return { present: false };
    const rect = notice.getBoundingClientRect();
    const header = document.querySelector('.app-header')?.getBoundingClientRect();
    const atCentre = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const firstContent = document.querySelector('.app-content > *:not(.shell-notices)');
    return {
      present: true,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      headerBottom: header ? header.bottom : 0,
      /* The thing every previous version failed: what is painted at the
         strip's own middle has to BE the strip. */
      onTop: notice.contains(atCentre) || atCentre === notice,
      /* Opaque, or the page scrolls through a fixed warning. */
      opaque: !/rgba\([^)]*,\s*0?\.\d+\)/.test(getComputedStyle(notice).backgroundColor),
      /* And nothing may be hiding underneath it. */
      contentTop: firstContent ? firstContent.getBoundingClientRect().top : null,
      says: notice.textContent,
      tone: notice.className,
    };
  });
}

test('a league that has rolled over is moved forward by itself', async () => {
  /* This used to be a button. It should never have been: we know what season
     it is, the chain is public, and nobody wants to be looking at last year.
     Asking someone to confirm the repair is asking them to approve a fault
     they did not cause. */
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  try {
    await page.goto(`${baseUrl}/design/league?staleSeason=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.shell-notice', { timeout: 15_000 });

    const seen = await noticeState(page);

    /* It says what it did, and which season it landed on. A board that
       silently changes to different teams is indistinguishable from a bug. */
    assert.match(seen.says, /Moved you to 2026/i, `the strip says "${seen.says}"`);
    assert.match(seen.says, /Odds Gods Design Replay/, 'the receipt does not name the league');
    /* Amber, not red. Being put on the right season is not an alarm. */
    assert.match(seen.tone, /shell-notice--note/, 'a successful repair is dressed as a warning');

    /* And the connection really moved, rather than the strip merely claiming
       it did. */
    const connected = await page.evaluate(
      () => JSON.parse(localStorage.getItem('og.olympus.connected-league') || '{}').leagueId,
    );
    assert.match(connected, /-2026$/, `still connected to ${connected}`);
  } finally {
    await page.close();
  }
});

test('the notice strip is readable, and nothing is hidden underneath it', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  try {
    await page.goto(`${baseUrl}/design/league?staleSeason=1&notRolledOver=1`, {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.shell-notice', { timeout: 15_000 });

    const seen = await noticeState(page);

    assert.ok(seen.height > 20, `the strip is ${seen.height}px tall`);
    assert.ok(
      seen.top >= seen.headerBottom - 1,
      `the strip starts at ${seen.top} with the header ending at ${seen.headerBottom}, so it is underneath it`,
    );
    assert.ok(seen.onTop, 'something is painted over the middle of the strip');
    assert.ok(seen.opaque, 'the fixed strip is translucent, so the page reads through it');
    /* The strip is fixed, so the shell has to pad the content by its height.
       Without that the first thing on every page starts underneath it, which
       is a different way of hiding the same message. */
    assert.ok(
      seen.contentTop >= seen.bottom - 1,
      `content starts at ${seen.contentTop} with the strip ending at ${seen.bottom}`,
    );
  } finally {
    await page.close();
  }
});

test('a league nobody has rolled over yet says so, and stays put', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  try {
    await page.goto(`${baseUrl}/design/league?staleSeason=1&notRolledOver=1`, {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.shell-notice', { timeout: 15_000 });
    await page.waitForTimeout(900);

    const seen = await noticeState(page);

    assert.match(seen.says, /nothing to move you to/i, `the strip says "${seen.says}"`);
    /* Both years, because "your data is old" without saying how old is not
       actionable. */
    assert.match(seen.says, /2025/);
    assert.match(seen.says, /2026/);
    /* Red, and only here: this is the one case where every number below
       really is a year out of date. */
    assert.match(seen.tone, /shell-notice--alert/, 'the one real warning is not dressed as one');

    const connected = await page.evaluate(
      () => JSON.parse(localStorage.getItem('og.olympus.connected-league') || '{}').leagueId,
    );
    assert.ok(
      !connected.endsWith('-2026'),
      'it switched to a league that does not exist',
    );
  } finally {
    await page.close();
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   WHAT THIS PRODUCT IS NOT, YET, IN A DYNASTY LEAGUE

   Trades are hidden in these leagues and that call is right: the engine
   simulates a rest-of-season, and half of what changes hands in dynasty is
   picks and players valued for years the sim does not run. But hiding a tab
   explains nothing. Somebody whose league is a dynasty league saw a product
   with a piece missing and no account of why, and filled the gap in for
   themselves.
   ────────────────────────────────────────────────────────────────────────── */

test('a dynasty league is told what is missing and why', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  try {
    await page.goto(`${baseUrl}/design/matchup?dynasty=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.shell-notice', { timeout: 15_000 });

    const seen = await page.evaluate(() => {
      const notice = document.querySelector('.shell-notice');
      return {
        says: notice.textContent,
        tone: notice.className,
        dismissible: Boolean(notice.querySelector('.shell-notice__dismiss')),
        /* The tab really is gone, so the note is describing the product
           rather than contradicting it. */
        tabs: [...document.querySelectorAll('.app-header a')].map((a) => a.textContent.trim()),
      };
    });

    /* Both halves of the claim, because they are different limitations and a
       user hits them on different screens. */
    assert.match(seen.says, /trade pricing is off/i, `the note says "${seen.says}"`);
    assert.match(seen.says, /this season alone/i, 'it does not scope the player values');
    /* Amber. A healthy league on a supported path is not an alarm, and an
       alarm that fires on one teaches people to stop reading alarms. */
    assert.match(seen.tone, /shell-notice--note/, 'a scope note is dressed as a warning');
    assert.ok(seen.dismissible, 'the note cannot be put away');
    assert.ok(
      !seen.tabs.some((label) => /trade/i.test(label)),
      `the note says trades are off but the tab is still there: ${JSON.stringify(seen.tabs)}`,
    );
  } finally {
    await page.close();
  }
});

test('a redraft league is not told any of that', async () => {
  /* The note must be specific to the leagues it is about. A scope warning on
     a league it does not apply to is just noise at the top of the product. */
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  try {
    await page.goto(`${baseUrl}/design/matchup`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.matchup-page', { timeout: 15_000 });
    await page.waitForTimeout(900);

    const seen = await page.evaluate(() => ({
      notices: document.querySelectorAll('.shell-notice').length,
      noticeHeight: getComputedStyle(document.documentElement)
        .getPropertyValue('--shell-notice-height')
        .trim(),
    }));

    assert.equal(seen.notices, 0, 'a redraft league is being shown a dynasty note');
    /* And the shell takes back the room, or every page keeps a strip of empty
       space where a notice is not. */
    assert.match(seen.noticeHeight, /^0px$/, `the shell still reserves ${seen.noticeHeight}`);
  } finally {
    await page.close();
  }
});
