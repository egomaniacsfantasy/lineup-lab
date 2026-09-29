import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The week at a glance stops reading a game once it kicks off.
 *
 * Reported mid Monday night: the glance's biggest favourite was a team that
 * had already won, printed as a check where a price goes, and its closest line
 * was -313. Both numbers were true of the board, which is live. The glance is
 * a summary of the market, so a game that has started counts at its closing
 * line. utils/weekGlance.ts has the rule and its own tests; this is the wiring
 * drawn by the real component: the kickoff times and the clock reaching the
 * rule, the closing numbers reaching the cards, and the header saying which
 * lines it is reading.
 *
 * The fixture is that Monday. See DesignBoardRowPage's kickoff scene.
 */

const cwd = process.cwd();
const port = 4223;
const baseUrl = `http://127.0.0.1:${port}`;
const scene = `${baseUrl}/design/board-row/kickoff`;

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

/** Every glance on the page, as the reader sees it. */
async function readGlances(url) {
  const page = await browser.newPage({ viewport: { width: 1320, height: 1400 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.matchup-slate__glance-card');
  const glances = await page.$$eval('.matchup-slate__glance', (sections) =>
    sections.map((section) => {
      const state = section.querySelector('.matchup-slate__glance-state');
      return {
        state: state?.firstChild?.textContent ?? null,
        why: state?.getAttribute('title') ?? null,
        cards: [...section.querySelectorAll('.matchup-slate__glance-card')].map((card) => ({
          label: card.querySelector('.matchup-slate__glance-label')?.textContent ?? null,
          value: card.querySelector('.matchup-slate__glance-value')?.firstChild?.textContent ?? null,
          unit: card.querySelector('.matchup-slate__glance-unit')?.textContent ?? null,
          separator: card.querySelector('.matchup-slate__glance-sep')?.textContent ?? null,
          teams: [...card.querySelectorAll('.matchup-slate__glance-team-name')].map((name) => name.textContent),
        })),
      };
    }),
  );
  return { page, glances };
}

const card = (glance, label) => glance.cards.find((entry) => entry.label === label);

/* The same four answers on both boards: the Monday game's close is the price
   it still shows, so nothing moves when it kicks off. */
function assertClosingRead(glance, which) {
  const favorite = card(glance, 'Biggest favorite');
  assert.equal(favorite?.value, '-251', `${which}: the biggest favourite is not the Monday game's -251`);
  assert.deepEqual(favorite?.teams, ['Mount Olympians', 'Underworld United']);
  assert.equal(favorite?.separator, 'over');

  /* Closed at 51.2%, which is -105. On the board it is -313. */
  const closest = card(glance, 'Closest line');
  assert.equal(closest?.value, '-105', `${which}: the closest line is not the closing -105`);
  assert.deepEqual(closest?.teams, ['Zeus’s Bolts', 'Waiver Wire Warriors']);

  /* 130.1 + 118.0 as posted before kickoff; the board's biggest total is
     Sunday's scoring, 268.5. */
  const total = card(glance, 'Highest total');
  assert.equal(total?.value, '248.1', `${which}: the highest total is not the posted 248.1`);
  assert.equal(total?.unit, 'pts');
  assert.deepEqual(total?.teams, ['Sonic and Knuckles', "Adam's Astounding Team"]);

  /* 58 to 64 before the game. Measured to the latest snapshot instead, it
     reads 41.9: the afternoon, not the market. */
  const move = card(glance, 'Biggest move');
  assert.equal(move?.value, '▲6.0', `${which}: the biggest move ran on past kickoff`);
  assert.equal(move?.unit, 'pp');
  assert.deepEqual(move?.teams, ['Sonic and Knuckles', "Adam's Astounding Team"]);

  /* Nothing the scoreboard produced reaches the glance. */
  const shown = glance.cards.map((entry) => entry.value);
  for (const live of ['✓', '-313', '268.5', '▲41.9']) {
    assert.ok(!shown.includes(live), `${which}: the glance is showing the live ${live}`);
  }
}

test('a started game is read at its close, and the header says so', async () => {
  const { page, glances } = await readGlances(scene);
  try {
    assert.equal(glances.length, 2, 'the kickoff scene draws the board twice');
    const [mondayToPlay, allStarted] = glances;

    assertClosingRead(mondayToPlay, 'Monday game to play');
    assertClosingRead(allStarted, 'every game started');

    /* Three of four started: every number is a pregame one, some of them
       still live. Four of four: every number is a close. */
    assert.equal(mondayToPlay.state, ' · pregame lines');
    assert.equal(allStarted.state, ' · closing lines');
    for (const glance of glances) {
      assert.match(glance.why ?? '', /closing line/, 'the header does not say what it is reading');
    }
  } finally {
    await page.close();
  }
});

test('the board itself stays live', async () => {
  const { page } = await readGlances(scene);
  try {
    /* The glance freezing must not freeze the cards: a game in progress
       still quotes the game in progress. */
    const prices = await page.$$eval('.matchup-slate__rows', (boards) =>
      [...boards[0].querySelectorAll('.matchup-slate__cell--price')].map((cell) => cell.textContent),
    );
    assert.ok(prices.includes('✓'), `the decided game no longer reads decided: ${prices.join(' ')}`);
    assert.ok(prices.includes('-313'), `the blowout is no longer quoted live: ${prices.join(' ')}`);
  } finally {
    await page.close();
  }
});

test('before anything kicks off the glance reads the board, with no qualifier', async () => {
  /* No kickoffs, no scores, no history: the game-of-the-week scene is a
     board on a Wednesday. The glance must read exactly what it always did. */
  const { page, glances } = await readGlances(`${baseUrl}/design/board-row/game-of-the-week`);
  try {
    assert.ok(glances.length > 0);
    for (const glance of glances) {
      assert.equal(glance.state, null, 'a qualifier appeared before the week started');
      assert.equal(card(glance, 'Biggest favorite')?.value, '-186');
      assert.deepEqual(card(glance, 'Biggest favorite')?.teams, ['Zeus’s Bolts', 'Waiver Wire Warriors']);
      assert.equal(card(glance, 'Highest total')?.value, '260.4');
    }
  } finally {
    await page.close();
  }
});
