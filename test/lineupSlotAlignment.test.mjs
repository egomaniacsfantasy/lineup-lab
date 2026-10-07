import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The lineup board when a slot is empty.
 *
 * Reported from a real league: a manager's quarterback was on bye, so he
 * started nobody there, and his running back appeared in the QB row with every
 * row below it shifted up one and a "no starter" row stranded at the bottom
 * under the kicker.
 *
 * Both providers drop a slot nobody filled - Sleeper strips the '0' out of
 * `starters`, ESPN has no entry for it - so the app received eight players for
 * nine slots and labelled them by counting. Two things follow, and this file
 * guards both: a starter's slot comes from what he plays, and the two lineups
 * are paired slot against slot rather than row against row, because one side
 * being a player short otherwise puts the whole board out of step.
 *
 * ?byeQb is that lineup: the design league's user starts no quarterback.
 */

const cwd = process.cwd();
const port = 4221;
const baseUrl = `http://127.0.0.1:${port}`;
const scene = `${baseUrl}/design/matchup?pregame&byeQb`;

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

/* The board, read as rows: the slot in the middle column, and what each side
   has in it. */
const READ_BOARD = () => {
  const cells = [...document.querySelectorAll('.matchup-page__slot-board-grid > *')]
    .filter((el) => !el.className.includes('slot-board-head'));
  const rows = [];
  for (let i = 0; i + 2 < cells.length + 1; i += 3) {
    const [left, middle, right] = [cells[i], cells[i + 1], cells[i + 2]];
    if (!left || !middle || !right) break;
    rows.push({
      slot: middle.querySelector('.matchup-page__slot-slot-label')?.textContent?.trim() ?? '',
      yours: left.querySelector('.matchup-page__row-name')?.textContent?.trim()
        ?? left.innerText.trim(),
      theirs: right.querySelector('.matchup-page__row-name')?.textContent?.trim()
        ?? right.innerText.trim(),
    });
  }
  return rows;
};

async function board(page) {
  await page.goto(scene, { waitUntil: 'domcontentloaded' });
  await page.locator('.matchup-page__module--slot-board').waitFor();
  await page.locator('.matchup-page__slot-board-grid > *').first().waitFor();
  return page.evaluate(READ_BOARD);
}

test('the empty slot is the one the manager left empty', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    const rows = await board(page);
    assert.equal(rows[0].slot, 'QB', 'the board does not start at quarterback');
    assert.match(rows[0].yours, /no starter/i, 'something was promoted into the empty QB slot');
    assert.ok(rows[0].theirs.length > 0, "the opponent's quarterback went missing too");
  } finally {
    await page.close();
  }
});

test('nothing below the gap moves up', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    const rows = await board(page);
    const henry = rows.find((row) => /Henry/.test(row.yours));
    assert.ok(henry, 'the running back is not on the board at all');
    assert.equal(henry.slot, 'RB', `the running back is sitting in the ${henry.slot} row`);

    const kicker = rows.find((row) => row.slot === 'K');
    assert.match(kicker.yours, /Aubrey/, 'the kicker row holds somebody else');
  } finally {
    await page.close();
  }
});

test('the board is still one row per slot, with nothing stranded at the end', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    const rows = await board(page);
    assert.deepEqual(
      rows.map((row) => row.slot),
      ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLX', 'K', 'DEF'],
      'the slots are not the league\'s own starting slots, in order',
    );
    /* The symptom that started this: an empty row left over under the kicker. */
    assert.doesNotMatch(rows.at(-1).yours, /no starter/i, 'an empty row is stranded at the bottom');
    assert.equal(rows.at(-1).slot, 'DEF');
  } finally {
    await page.close();
  }
});

test('the two sides stay paired slot against slot', async () => {
  /* One side a player short is exactly what knocked the rows out of step. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    const rows = await board(page);
    const theirs = rows.map((row) => row.theirs);
    assert.ok(theirs.every((name) => name.length > 0), 'the opponent has a hole he did not leave');
    assert.match(rows.find((row) => row.slot === 'DEF').theirs, /Vikings/, "the opponent's board slid");
  } finally {
    await page.close();
  }
});
