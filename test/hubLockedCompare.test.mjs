import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * "Who do I start?" only asks about players you can still move.
 *
 * A kickoff locks a player into or out of the lineup. The Hub drew that on
 * every row (a live tag, a finished row fading) and then let you tap the row
 * anyway: pick a starter whose game was over, pick a bench player whose game
 * was also over, and the sheet opened with a verdict on projection about two
 * settled scores. Eligibility was by position alone.
 *
 * `/design/matchup?pregame&liveGames` is a Sunday afternoon: no points on the
 * board, and the fixed design scoreboard (see useNflGameState) has MIN live in
 * the 3rd, DET in OT and WAS at half, with BAL, ATL and PHI final. So some of
 * your players are locked and some are still to play, which is the only state
 * where the rule has anything to decide.
 */

const cwd = process.cwd();
const port = 4229;
const baseUrl = `http://127.0.0.1:${port}`;
const SUNDAY = `${baseUrl}/design/matchup?pregame&liveGames`;
const BEFORE_KICKOFF = `${baseUrl}/design/matchup?pregame`;

/* Written out from the fixture rather than read off the page, so the lock is
   judged against whose games have started and not against the rendering under
   test. Starters on BAL, ATL, MIN and WAS; bench players on PHI. */
const LOCKED_STARTERS = ['D. Henry', 'B. Robinson', 'J. Jefferson', 'T. McLaurin'];
const OPEN_STARTERS = ['P. Mahomes', 'C. Lamb', 'T. Kelce', 'B. Aubrey', '49ers'];
const LOCKED_BENCH = ['S. Barkley', 'D. Smith', 'Eagles'];
const OPEN_BENCH = ['T. McBride', 'K. Fairbairn'];

const STARTER_CARDS = '.matchup-page__slot-board-grid > button.matchup-page__slot-card';
const BENCH_BUTTONS = '.matchup-page__lineup-list--bench button.matchup-page__lineup-hitbox';

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
  await waitForUrl(`${baseUrl}/design/matchup`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

async function open(url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator(STARTER_CARDS).first().waitFor();
  return page;
}

const starter = (page, name) =>
  page.locator(STARTER_CARDS).filter({ has: page.locator('.matchup-page__row-name', { hasText: name }) });
const bench = (page, name) => page.locator(BENCH_BUTTONS).filter({ hasText: name });

/** Every starter and bench player, and whether the tap can reach them. */
async function pickable(page) {
  return page.evaluate(({ starters, bench: benchSelector }) => {
    const read = (nodes, nameOf) =>
      Object.fromEntries([...document.querySelectorAll(nodes)].map((node) => [nameOf(node), !node.disabled]));
    return {
      starters: read(starters, (node) => node.querySelector('.matchup-page__row-name')?.textContent),
      bench: read(benchSelector, (node) => node.querySelector('.matchup-page__row-name')?.textContent),
    };
  }, { starters: STARTER_CARDS, bench: BENCH_BUTTONS });
}

/* Clicked through the DOM rather than by Playwright, which would refuse to
   press a disabled button and wait. A real tap on one lands exactly here. */
const tap = (locator) => locator.evaluate((node) => node.click());

test('a player whose game has kicked off cannot be picked, on the board or the bench', async () => {
  const page = await open(SUNDAY);
  try {
    const { starters, bench: benchRows } = await pickable(page);
    for (const name of LOCKED_STARTERS) assert.equal(starters[name], false, `${name}'s game has started and he is still pickable`);
    for (const name of OPEN_STARTERS) assert.equal(starters[name], true, `${name} has not played and cannot be picked`);
    for (const name of LOCKED_BENCH) assert.equal(benchRows[name], false, `${name}'s game is over and he is still pickable`);
    for (const name of OPEN_BENCH) assert.equal(benchRows[name], true, `${name} has not played and cannot be picked`);

    /* The reported case: a finished starter, then a finished bench player.
       Nothing is picked and no sheet opens. */
    await tap(starter(page, 'D. Henry'));
    await tap(bench(page, 'S. Barkley'));
    await page.waitForTimeout(300);
    assert.equal(await starter(page, 'D. Henry').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.matchup-page__compare-sheet').count(), 0, 'the sheet opened for two finished players');
  } finally {
    await page.close();
  }
});

test('two players still to play can still be weighed', async () => {
  const page = await open(SUNDAY);
  try {
    await starter(page, 'T. Kelce').click();
    await bench(page, 'T. McBride').click();
    await page.locator('.matchup-page__compare-sheet').waitFor();
    assert.match(await page.locator('.matchup-page__compare-sheet').textContent(), /Who do I start\?/);
  } finally {
    await page.close();
  }
});

test('with every other candidate locked, the pick says nobody can take the slot', async () => {
  /* Lamb's slot takes a receiver. Every other receiver is locked: Jefferson
     and McLaurin are live, Smith on the bench is final. Counting them, the
     hint sent you to pick players who could not be picked. */
  const page = await open(SUNDAY);
  try {
    await starter(page, 'C. Lamb').click();
    assert.match(
      await page.locator('.matchup-page__lineup-hint').textContent(),
      /Nobody else can take C\. Lamb's slot/,
    );
  } finally {
    await page.close();
  }
});

test('a locked player keeps his look during a pick; only a player of the wrong position dims', async () => {
  /* Live players are meant to stand out once finished ones fade, so a lock
     takes the tap away and nothing else. Dimming stays what it was: a player
     the pick cannot be weighed against by position. */
  const page = await open(SUNDAY);
  try {
    await starter(page, 'C. Lamb').click();
    const read = (name) =>
      starter(page, name).evaluate((node) => ({
        disabled: node.disabled,
        muted: node.classList.contains('matchup-page__slot-card--muted'),
        opacity: getComputedStyle(node).opacity,
      }));
    assert.deepEqual(await read('J. Jefferson'), { disabled: true, muted: false, opacity: '1' });
    assert.equal((await read('T. Kelce')).muted, true, 'a tight end against a receiver slot no longer dims');
  } finally {
    await page.close();
  }
});

test('a card you cannot press does not lift under the pointer', async () => {
  const page = await open(SUNDAY);
  try {
    const lift = async (name) => {
      const card = starter(page, name);
      await card.hover();
      await page.waitForTimeout(250);
      return card.evaluate((node) => getComputedStyle(node).transform);
    };
    assert.equal(await lift('J. Jefferson'), 'none', 'a locked card still lifts like a button');
    assert.notEqual(await lift('P. Mahomes'), 'none', 'an open card stopped lifting');
  } finally {
    await page.close();
  }
});

test('before anything kicks off, nobody is locked', async () => {
  /* The rule must not reach forward: with no game started, every one of your
     players is a start/sit question. */
  const page = await open(BEFORE_KICKOFF);
  try {
    const { starters, bench: benchRows } = await pickable(page);
    for (const [name, open] of Object.entries({ ...starters, ...benchRows })) {
      assert.equal(open, true, `${name} is locked before any game has started`);
    }
  } finally {
    await page.close();
  }
});
