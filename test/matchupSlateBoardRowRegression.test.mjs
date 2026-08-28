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
 * A card's three markets line up across both sides.
 *
 * The board used to be one wide row per game with the two teams pushed to
 * opposite ends, and the invariant then was about a movement rail and which
 * edge each crest sat against. Stacked into a card those questions dissolve:
 * the crest is always leftmost and each side owns its own figure because
 * there is no shared rail to put one in.
 *
 * What matters now is the thing that makes a book's board readable at all.
 * The spread, the total and the price have to occupy the same columns on both
 * sides and under the labels above them. Lose that and the card is two rows
 * of loose numbers that happen to be near each other.
 */
test('the markets line up across both sides of a card', async () => {
  for (const width of [1512, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    try {
      await page.goto(`${baseUrl}/design/board-row/collision`, { waitUntil: 'domcontentloaded' });
      await page.locator('.matchup-slate__row-button').first().waitFor({ state: 'visible' });
      const layout = await page.evaluate(() => {
        const card = document.querySelector('.matchup-slate__row-button');
        const sides = [...card.querySelectorAll('.matchup-slate__side')];
        const centres = (root) =>
          [...root.querySelectorAll('.matchup-slate__cell')].map((cell) => {
            const rect = cell.getBoundingClientRect();
            return Math.round(rect.left + rect.width / 2);
          });
        const labels = [...card.querySelectorAll('.matchup-slate__card-cols > *')]
          .slice(1)
          .map((label) => {
            const rect = label.getBoundingClientRect();
            return Math.round(rect.left + rect.width / 2);
          });
        return {
          sides: sides.length,
          rail: document.querySelector('.matchup-slate__rail') != null,
          top: centres(sides[0]),
          bottom: centres(sides[1]),
          labels,
          moves: card.querySelectorAll('.matchup-slate__team-move').length,
          crestFirst: sides.every((side) => {
            const crest = side.querySelector('.team-avatar');
            const name = side.querySelector('.matchup-slate__team-name');
            if (!crest || !name) return false;
            return crest.getBoundingClientRect().left <= name.getBoundingClientRect().left;
          }),
        };
      });

      assert.equal(layout.rail, false, `the movement rail is back at ${width}px`);
      assert.equal(layout.sides, 2, `a card did not render two sides at ${width}px`);
      assert.equal(layout.top.length, 3, `expected three markets per side at ${width}px`);

      /* Both sides, and the labels above them, in the same three columns. */
      assert.deepEqual(
        layout.bottom,
        layout.top,
        `the two sides of a card disagree on where the markets sit at ${width}px`,
      );
      assert.deepEqual(
        layout.labels,
        layout.top,
        `the column labels do not sit over their own markets at ${width}px`,
      );

      assert.ok(layout.crestFirst, `a crest is not the leftmost thing on its side at ${width}px`);
    } finally {
      await page.close();
    }
  }
});

test('both team blocks share a width and a long name is not clipped early', async () => {
  for (const width of [1512, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    try {
      await page.goto(`${baseUrl}/design/board-row/truncation`, { waitUntil: 'domcontentloaded' });
      await page.locator('.matchup-slate__row-button').first().waitFor({ state: 'visible' });
      const layout = await page.evaluate(() => {
        /* Stacked, so there is no left and right any more: the two sides of
           one card, top and bottom. */
        const card = document.querySelector('.matchup-slate__row-button');
        const blocks = [...card.querySelectorAll('.matchup-slate__team')];
        const leftLockup = blocks[0] ?? null;
        const rightLockup = blocks[1] ?? null;
        const names = [...card.querySelectorAll('.matchup-slate__team-name')];
        const leftName = names[0] ?? null;
        const rightName = names[1] ?? null;
        const rect = (element) => {
          if (!element) return null;
          const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
          return { top, right, bottom, left, width, height };
        };
        return {
          leftLockup: rect(leftLockup),
          rightLockup: rect(rightLockup),
          /* Height, not width: the name wraps to two lines in a card, so the
             question is whether all of it is showing, not whether it fits on
             one line. */
          leftName: leftName
            ? {
                clientHeight: leftName.clientHeight,
                scrollHeight: leftName.scrollHeight,
                title: leftName.getAttribute('title'),
              }
            : null,
          rightName: rightName
            ? {
                clientHeight: rightName.clientHeight,
                scrollHeight: rightName.scrollHeight,
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
      for (const [label, name] of [['top', layout.leftName], ['bottom', layout.rightName]]) {
        assert.ok(
          name.scrollHeight <= name.clientHeight + 1,
          `${label} team name is clipped at ${width}px`,
        );
        /* And the full name stays reachable however it is drawn. */
        assert.ok(name.title, `${label} team name lost its title attribute at ${width}px`);
      }
      assert.equal(layout.rightName.title, "FantasyGodCasta's Team");
      assert.equal(layout.leftName.title, "lukewilliams340's Team");
    } finally {
      await page.close();
    }
  }
});
