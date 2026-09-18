import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The per-player game tag on the Hub's lineup board, rendered.
 *
 * The defect: during games a row showed a projection and a small "X now" in the
 * same face, and nothing on the row said whether the player's game was on, over
 * or yet to start. Now a live row leads with points and carries the clock, a
 * finished row says FINAL, and a row whose game has not started keeps its
 * projection with no tag.
 *
 * ?liveGames gives the design league a fixed scoreboard (see useNflGameState):
 * MIN live in the 3rd, DET in OT, WAS at half, BAL and ATL final. Without the
 * flag a design scene must never request the real scoreboard, because a fixture
 * that reads it fails whenever a real game involving its players happens to be on.
 */

const cwd = process.cwd();
const port = 4211;
const baseUrl = `http://127.0.0.1:${port}`;

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

/* Every lineup card, by player name: its tag, and which number leads. */
const READ_ROWS = () =>
  Object.fromEntries(
    [...document.querySelectorAll('.matchup-page__module--slot-board .matchup-page__slot-card')]
      .map((card) => {
        const name = card.querySelector('.matchup-page__row-name')?.textContent;
        if (!name) return null;
        const tag = card.querySelector('.matchup-page__meta-full .matchup-page__game-tag');
        return [name, {
          tag: tag?.textContent ?? null,
          tagPhase: tag ? [...tag.classList].find((c) => c.startsWith('matchup-page__game-tag--') && !c.endsWith('--flush')) : null,
          leadsWithScore: Boolean(card.querySelector('.matchup-page__slot-scored')),
          leadsWithProjection: Boolean(card.querySelector('.matchup-page__slot-projection')),
          projLabel: card.querySelector('.matchup-page__slot-proj-label')?.textContent ?? null,
          outlined: card.classList.contains('matchup-page__slot-card--live'),
        }];
      })
      .filter(Boolean),
  );

async function rowsAt(path) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.matchup-page__module--slot-board .matchup-page__slot-card').first().waitFor();
    return await page.evaluate(READ_ROWS);
  } finally {
    await page.close();
  }
}

test('a live player leads with points and carries the quarter and clock', async () => {
  const rows = await rowsAt('/design/matchup?liveGames');
  const jefferson = rows['J. Jefferson'];
  assert.ok(jefferson, 'the design lineup has no J. Jefferson');
  assert.equal(jefferson.tagPhase, 'matchup-page__game-tag--live');
  assert.equal(jefferson.tag, 'Q3 4:12');
  assert.equal(jefferson.leadsWithScore, true, 'a live row must lead with points scored');
  assert.match(jefferson.projLabel ?? '', /^proj /, 'the projection must sit beneath it, labelled');

  assert.equal(rows['J. Gibbs']?.tag, 'OT 2:00');
  assert.equal(rows['T. McLaurin']?.tag, 'Half');
});

test('only rows whose game is live are outlined', async () => {
  /* The outline is how the eye finds the moving rows before reading a tag, so
     it must mark exactly those rows: a final or unplayed row outlined as live
     is a false alarm on the one screen people watch on a Sunday. */
  const rows = await rowsAt('/design/matchup?liveGames');
  const outlined = Object.entries(rows).filter(([, row]) => row.outlined).map(([name]) => name).sort();
  const live = Object.entries(rows)
    .filter(([, row]) => row.tagPhase === 'matchup-page__game-tag--live')
    .map(([name]) => name)
    .sort();
  assert.ok(live.length > 0, 'the ?liveGames fixture has no live rows to check');
  assert.deepEqual(outlined, live);
  assert.equal(rows['D. Henry']?.outlined, false, 'a final row must not be outlined');
});

test('a finished player says FINAL', async () => {
  const rows = await rowsAt('/design/matchup?liveGames');
  const henry = rows['D. Henry'];
  assert.ok(henry, 'the design lineup has no D. Henry');
  assert.equal(henry.tagPhase, 'matchup-page__game-tag--final');
  assert.equal(henry.tag, 'Final');
  assert.equal(henry.leadsWithScore, true);
});

test('design scenes never read the real scoreboard', async () => {
  /* Asserted on the REQUEST, not on the rendered tags. Reading tags raced the
     first poll: with the guard removed this test still passed, because the rows
     were read before the real scoreboard answered. A design scene must not ask
     at all, and a request is visible the moment it is made. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  const asked = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/nfl/game-state')) asked.push(request.url());
  });
  try {
    await page.goto(`${baseUrl}/design/matchup`, { waitUntil: 'domcontentloaded' });
    await page.locator('.matchup-page__module--slot-board .matchup-page__slot-card').first().waitFor();
    /* The hook polls on mount, so a request would already be out by now. The
       wait covers a slow first render, not the poll interval. */
    await page.waitForTimeout(1500);
    assert.deepEqual(asked, [], 'a design scene requested the real NFL scoreboard');
  } finally {
    await page.close();
  }
});
