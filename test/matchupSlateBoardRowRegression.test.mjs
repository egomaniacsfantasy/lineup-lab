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

test('your-game row keeps the avatar outside the fixed rail even after the pill is removed', async () => {
  for (const width of [1512, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    try {
      await page.goto(`${baseUrl}/design/board-row/collision`, { waitUntil: 'networkidle' });
      const layout = await page.evaluate(() => {
        const avatar = document.querySelector('.matchup-slate__team--right .team-avatar');
        const tag = document.querySelector('.matchup-slate__tag');
        const move = document.querySelector('.matchup-slate__rail .matchup-slate__move');
        const rail = document.querySelector('.matchup-slate__rail');
        const rightName = document.querySelector('.matchup-slate__team--right .matchup-slate__team-name');
        const rightMeta = document.querySelector('.matchup-slate__team--right .matchup-slate__team-meta');
        const rect = (element) => {
          if (!element) return null;
          const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
          return { top, right, bottom, left, width, height };
        };
        return {
          avatar: rect(avatar),
          tag: rect(tag),
          move: rect(move),
          rail: rect(rail),
          rightName: rect(rightName),
          rightMeta: rightMeta
            ? {
                clientWidth: rightMeta.clientWidth,
                scrollWidth: rightMeta.scrollWidth,
                text: rightMeta.textContent,
              }
            : null,
        };
      });

      assert.ok(layout.avatar, `missing right avatar at ${width}px`);
      assert.equal(layout.tag, null, `unexpected YOUR GAME pill still rendered at ${width}px`);
      assert.ok(layout.move, `missing movement chip at ${width}px`);
      assert.ok(layout.rail, `missing chip rail at ${width}px`);
      assert.ok(layout.rightName, `missing right team name at ${width}px`);
      assert.ok(layout.rightMeta, `missing right team meta at ${width}px`);
      assert.equal(overlaps(layout.avatar, layout.move), false, `avatar overlaps movement chip at ${width}px`);
      assert.equal(overlaps(layout.avatar, layout.rightName), false, `avatar overlaps right team name at ${width}px`);
      assert.ok(layout.avatar.right <= layout.rail.left, `avatar bleeds into chip rail at ${width}px`);
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
      await page.goto(`${baseUrl}/design/board-row/truncation`, { waitUntil: 'networkidle' });
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
