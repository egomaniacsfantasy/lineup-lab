import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const cwd = process.cwd();
const port = 4175;
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

function overlaps(left, right) {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

let vite = null;
let browser = null;
let ownsVite = false;

test.before(async () => {
  if (!(await isPortOpen(port))) {
    vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd,
      env: process.env,
      stdio: 'ignore',
    });
    ownsVite = true;
  }

  await waitForUrl(`${baseUrl}/design/board-row/collision`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

/**
 * Each team's movement figure sits on the INSIDE of its own lockup.
 *
 * It used to be one figure in a rail column off the end of the row, which
 * cost twice: both team lockups stopped short of the edges they should sit
 * against, and the figure never said which of the two teams it described.
 *
 * So the invariants are positional, not just "it rendered": the chip is
 * between the name and the middle of the row on both sides, and the crest is
 * the outermost thing in the row on both sides.
 */
test('the movement figure sits inside each lockup, and the crests stay on the edges', async () => {
  for (const width of [1512, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    try {
      await page.goto(`${baseUrl}/design/board-row/collision`, { waitUntil: 'domcontentloaded' });
      await page.locator('.matchup-slate__row-button').first().waitFor({ state: 'visible' });
      const layout = await page.evaluate(() => {
        const rect = (element) => {
          if (!element) return null;
          const { top, right, bottom, left, width: w, height } = element.getBoundingClientRect();
          return { top, right, bottom, left, width: w, height };
        };
        const row = document.querySelector('.matchup-slate__row-button');
        const leftBlock = document.querySelector('.matchup-slate__team:not(.matchup-slate__team--right)');
        const rightBlock = document.querySelector('.matchup-slate__team--right');
        const rightMeta = document.querySelector('.matchup-slate__team--right .matchup-slate__team-meta');
        return {
          row: rect(row),
          tag: rect(document.querySelector('.matchup-slate__tag')),
          rail: document.querySelector('.matchup-slate__rail') != null,
          leftAvatar: rect(leftBlock?.querySelector('.team-avatar')),
          leftName: rect(leftBlock?.querySelector('.matchup-slate__team-name')),
          leftMove: rect(leftBlock?.querySelector('.matchup-slate__team-move')),
          rightAvatar: rect(rightBlock?.querySelector('.team-avatar')),
          rightName: rect(rightBlock?.querySelector('.matchup-slate__team-name')),
          rightMove: rect(rightBlock?.querySelector('.matchup-slate__team-move')),
          rightMeta: rightMeta
            ? {
                clientWidth: rightMeta.clientWidth,
                scrollWidth: rightMeta.scrollWidth,
                text: rightMeta.textContent,
              }
            : null,
        };
      });

      assert.equal(layout.rail, false, `the movement rail is back at ${width}px`);
      assert.equal(layout.tag, null, `unexpected YOUR GAME pill still rendered at ${width}px`);

      for (const key of ['leftAvatar', 'leftName', 'leftMove', 'rightAvatar', 'rightName', 'rightMove']) {
        assert.ok(layout[key], `missing ${key} at ${width}px`);
      }

      /* Each side gets its own figure, so neither is inferred from the other. */
      assert.equal(
        overlaps(layout.leftMove, layout.leftName),
        false,
        `left movement chip overlaps its team name at ${width}px`,
      );
      assert.equal(
        overlaps(layout.rightMove, layout.rightName),
        false,
        `right movement chip overlaps its team name at ${width}px`,
      );

      /* Inside: the chip is between its own name and the middle of the row. */
      assert.ok(
        layout.leftMove.left >= layout.leftName.right - 1,
        `left movement chip is outside its name rather than inside at ${width}px`,
      );
      assert.ok(
        layout.rightMove.right <= layout.rightName.left + 1,
        `right movement chip is outside its name rather than inside at ${width}px`,
      );

      /* Outside: the crest is the outermost thing on its side of the row.
         Nothing may sit beyond it, which is what the rail used to do. */
      assert.ok(
        layout.leftAvatar.left <= layout.leftName.left,
        `left crest is not the outermost element at ${width}px`,
      );
      assert.ok(
        layout.rightAvatar.right >= layout.rightMove.right &&
          layout.rightAvatar.right >= layout.rightName.right,
        `right crest is not the outermost element at ${width}px`,
      );

      assert.equal(
        overlaps(layout.rightAvatar, layout.rightName),
        false,
        `avatar overlaps right team name at ${width}px`,
      );
      assert.ok(
        layout.rightMeta.scrollWidth <= layout.rightMeta.clientWidth,
        `right handle line clips before the grid runs out of space at ${width}px`,
      );
    } finally {
      await page.close();
    }
  }
});

test('left and right lockups share width and the right-side stress name fits before ellipsis', async () => {
  for (const width of [1512, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    try {
      await page.goto(`${baseUrl}/design/board-row/truncation`, { waitUntil: 'domcontentloaded' });
      await page.locator('.matchup-slate__row-button').first().waitFor({ state: 'visible' });
      const layout = await page.evaluate(() => {
        const leftLockup = document.querySelector('.matchup-slate__team--left');
        const rightLockup = document.querySelector('.matchup-slate__team--right');
        const leftName = document.querySelector('.matchup-slate__team--left .matchup-slate__team-name');
        const rightName = document.querySelector('.matchup-slate__team--right .matchup-slate__team-name');
        const rect = (element) => {
          if (!element) return null;
          const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
          return { top, right, bottom, left, width, height };
        };
        return {
          leftLockup: rect(leftLockup),
          rightLockup: rect(rightLockup),
          leftName: leftName
            ? {
                clientWidth: leftName.clientWidth,
                scrollWidth: leftName.scrollWidth,
                title: leftName.getAttribute('title'),
              }
            : null,
          rightName: rightName
            ? {
                clientWidth: rightName.clientWidth,
                scrollWidth: rightName.scrollWidth,
                title: rightName.getAttribute('title'),
              }
            : null,
        };
      });

      assert.ok(layout.leftLockup && layout.rightLockup, `missing lockups at ${width}px`);
      assert.ok(layout.leftName && layout.rightName, `missing team names at ${width}px`);
      assert.ok(
        Math.abs(layout.leftLockup.width - layout.rightLockup.width) <= 1,
        `lockup widths diverged at ${width}px: ${layout.leftLockup.width} vs ${layout.rightLockup.width}`,
      );
      assert.ok(
        layout.rightName.scrollWidth <= layout.rightName.clientWidth,
        `right team name ellipsized with space still available at ${width}px`,
      );
      assert.equal(layout.rightName.title, "FantasyGodCasta's Team");
      assert.equal(layout.leftName.title, "lukewilliams340's Team");
    } finally {
      await page.close();
    }
  }
});
