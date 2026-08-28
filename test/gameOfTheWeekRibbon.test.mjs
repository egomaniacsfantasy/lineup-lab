import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The game of the week wears a ribbon, and only the right card wears it.
 *
 * The label used to be a sentence above the fork strip that had to name both
 * teams to say which game it meant. It says it on the game now, so what has
 * to hold is about the card: exactly one card carries it, it is the top edge
 * of that card rather than a pill floating in the padding, and it says what
 * the engine actually measures.
 *
 * Shares the dev server on 4175 with the other rendered board tests rather
 * than starting a fourth Vite.
 */

const cwd = process.cwd();
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const scene = `${baseUrl}/design/board-row/game-of-the-week`;

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

/** The fixture renders the board twice: with the sim's answer, then without. */
async function openScene(width, height = 1200) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(scene, { waitUntil: 'networkidle' });
  await page.waitForSelector('.matchup-slate__gotw');
  return page;
}

test('exactly one card is crowned, and nothing is crowned before the sim answers', async () => {
  const page = await openScene(1320);
  try {
    const perSlate = await page.$$eval('.matchup-slate__rows', (slates) =>
      slates.map((slate) => ({
        cards: slate.querySelectorAll('.matchup-slate__row-button').length,
        ribbons: slate.querySelectorAll('.matchup-slate__gotw').length,
      })),
    );

    assert.equal(perSlate.length, 2, 'the fixture no longer renders both states');
    assert.deepEqual(perSlate[0], { cards: 3, ribbons: 1 }, 'the answered board did not crown exactly one game');

    /* The second board has the same three cards and no answer yet. One of
       those cards carries no matchupId at all, so a null answer that is
       compared loosely would crown it. */
    assert.deepEqual(
      perSlate[1],
      { cards: 3, ribbons: 0 },
      'a board with no game of the week yet is showing a ribbon, which means an unidentified card matched a null answer',
    );

    const crowned = await page.$eval('.matchup-slate__rows .matchup-slate__gotw', (ribbon) => {
      const card = ribbon.closest('.matchup-slate__row-button');
      return [...card.querySelectorAll('.matchup-slate__team-name')].map((node) => node.textContent);
    });
    assert.deepEqual(crowned, ['Sonic and Knuckles', "Adam's Astounding Team"]);
  } finally {
    await page.close();
  }
});

/* Both a two-across desktop and a phone. The card changes its padding at
   720px and the ribbon has to change with it, which is the drift this catches. */
for (const width of [1320, 375]) {
  test(`the ribbon is the card's top edge, corner to corner, at ${width}px`, async () => {
    const page = await openScene(width);
    try {
      const box = await page.$eval('.matchup-slate__rows .matchup-slate__gotw', (ribbon) => {
        const card = ribbon.closest('.matchup-slate__row-button');
        const rb = ribbon.getBoundingClientRect();
        const cb = card.getBoundingClientRect();
        const cols = card.querySelector('.matchup-slate__card-cols').getBoundingClientRect();
        const firstTeam = card.querySelector('.matchup-slate__team-name').getBoundingClientRect();
        return {
          border: parseFloat(getComputedStyle(card).borderLeftWidth),
          leftGap: rb.left - cb.left,
          rightGap: cb.right - rb.right,
          topGap: rb.top - cb.top,
          aboveLabels: rb.bottom <= cols.top,
          aboveTeams: rb.bottom <= firstTeam.top,
          height: rb.height,
        };
      });

      /* Full bleed: the only thing between the ribbon and the outside world
         is the card's own border. A pill inside the padding, or a ribbon that
         took one column of the card grid instead of all of them, fails here. */
      assert.ok(
        Math.abs(box.leftGap - box.border) < 0.5 && Math.abs(box.rightGap - box.border) < 0.5,
        `the ribbon is inset from the card: ${box.leftGap.toFixed(2)}px and ${box.rightGap.toFixed(2)}px against a ${box.border}px border`,
      );
      assert.ok(
        Math.abs(box.topGap - box.border) < 0.5,
        `the ribbon is not riding the top edge: ${box.topGap.toFixed(2)}px down from it`,
      );
      assert.ok(box.aboveLabels && box.aboveTeams, 'the ribbon is not above the column labels and the teams');
      assert.ok(box.height > 14 && box.height < 40, `the ribbon is ${box.height}px tall`);
    } finally {
      await page.close();
    }
  });
}

/**
 * The band between a phone and a maximised window.
 *
 * Three breakpoints left over from the old one-row-per-game layout kept
 * re-columning the card between 640px and 1099px, which laid the card's
 * markup across five tracks. It was invisible at 375px and at 1320px, so
 * both widths are checked above and this one checks the band they hid.
 */
test('a card is still a stack at the widths nobody screenshots', async () => {
  for (const width of [660, 900, 1080]) {
    const page = await openScene(width);
    try {
      const rows = await page.$eval('.matchup-slate__rows .matchup-slate__row-button', (card) => {
        const [first, second] = card.querySelectorAll('.matchup-slate__side');
        return { firstBottom: first.getBoundingClientRect().bottom, secondTop: second.getBoundingClientRect().top };
      });
      assert.ok(
        rows.firstBottom <= rows.secondTop + 0.5,
        `at ${width}px the two sides of a card are side by side, not stacked`,
      );
    } finally {
      await page.close();
    }
  }
});

test('the ribbon explains itself, in the terms the engine computes', async () => {
  const page = await openScene(1320);
  try {
    const ribbon = await page.$eval('.matchup-slate__rows .matchup-slate__gotw', (node) => ({
      title: node.getAttribute('title') ?? '',
      cursor: getComputedStyle(node).cursor,
      /* The label alone, without the screen-reader copy behind it. */
      label: node.firstChild.textContent.trim(),
    }));

    assert.equal(ribbon.label, 'Game of the week');
    /* cursor: help is the only hint a title attribute gets that it is there. */
    assert.equal(ribbon.cursor, 'help');

    /* leagueSwing in server/engine/leverage.js sums championship and playoff
       probability moved across EVERY team. All three of those are load-bearing:
       drop any one and the sentence describes a different statistic. */
    for (const word of ['championship', 'playoff', 'league']) {
      assert.match(ribbon.title.toLowerCase(), new RegExp(word), `the tooltip never says "${word}"`);
    }
    /* Not the closest game and not the best teams, which is what everyone
       assumes a game of the week is. */
    assert.doesNotMatch(ribbon.title.toLowerCase(), /closest|best teams/);
  } finally {
    await page.close();
  }
});

test('the fork strip no longer writes the same fact out as a sentence', async () => {
  const [tsx, css] = await Promise.all([
    fs.readFile(path.resolve('src/components/league/WeekFork.tsx'), 'utf8'),
    fs.readFile(path.resolve('src/components/league/WeekFork.css'), 'utf8'),
  ]);

  assert.doesNotMatch(tsx, /Most influential game/, 'the caption is back above the strip');
  assert.doesNotMatch(tsx, /week-fork__caption/);
  assert.doesNotMatch(css, /\.week-fork__caption/, 'the caption still has styles');

  /* The faint lift on the column stays: it is the same game marked in the
     other view of it, and the ribbon is what explains it. */
  assert.match(tsx, /week-fork__game--key/);
  assert.match(css, /\.week-fork__game--key/);
});
