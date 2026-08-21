import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * Nothing may scroll horizontally on a phone.
 *
 * The document not overflowing is not enough on its own: an inner container
 * with overflow-x: auto scrolls sideways while the page reports a clean
 * scrollWidth. The Board's sheet view did exactly that — six columns measured
 * 417px against 339px, and 168px of the excess was cell padding rather than
 * data — and the page-level check that had been used until then said it was
 * fine.
 */

const cwd = process.cwd();
const port = 4181;
const baseUrl = `http://127.0.0.1:${port}`;
const PHONE = { width: 375, height: 812 };

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

/* Runs in the page: report every element that can actually scroll sideways. */
function collectScrollers() {
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const overflowX = getComputedStyle(el).overflowX;
    if (overflowX !== 'auto' && overflowX !== 'scroll') continue;
    if (el.clientWidth <= 0) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) {
      offenders.push({
        selector: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).join('.')}`,
        overBy: over,
      });
    }
  }
  return {
    offenders,
    documentOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
  };
}

let vite = null;
let api = null;
let browser = null;
let ownsVite = false;
let ownsApi = false;

/* The Board loads its projections through the dev proxy, which forwards /api
   to :8799. With nothing there the proxy answers 500, the Board renders "Could
   not load Board", and these tests time out after 30s looking exactly like a
   layout regression in whatever you last touched. That cost real time twice
   before this hook existed, so the suite now brings its own API up. */
const API_PORT = 8799;

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
  if (!(await isPortOpen(port))) {
    vite = spawn(
      'npm',
      ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd, env: process.env, stdio: 'ignore' },
    );
    ownsVite = true;
  }
  await waitForUrl(`${baseUrl}/design/board`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
  if (api && ownsApi) api.kill('SIGTERM');
});

for (const scene of ['matchup', 'board', 'market', 'league']) {
  test(`${scene} has nothing scrolling sideways at 375px`, async () => {
    const page = await browser.newPage({ viewport: PHONE, colorScheme: 'dark' });
    try {
      await page.goto(`${baseUrl}/design/${scene}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.app-content', { state: 'visible' });
      await page.waitForTimeout(600);
      const { offenders, documentOverflow } = await page.evaluate(collectScrollers);
      assert.equal(
        documentOverflow,
        0,
        `${scene}: the page itself overflows by ${documentOverflow}px`,
      );
      assert.deepEqual(
        offenders,
        [],
        `${scene}: these scroll horizontally on a phone:\n${offenders
          .map((o) => `  ${o.selector} (+${o.overBy}px)`)
          .join('\n')}`,
      );
    } finally {
      await page.close();
    }
  });
}

test('the board sheet view fits a phone with the longest real names', async () => {
  /* The sheet is the surface that broke the rule, and it only breaks with
     content in it — every cell is nowrap, so a long name used to widen the
     table. Fixed layout makes the columns a function of the table width, so
     this injects worst-case names and asserts the width does not move. */
  const page = await browser.newPage({ viewport: PHONE, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/board`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app-content', { state: 'visible' });
    /* The toggle is not exposed by accessible name, so match it the same way
       the surface itself does: the control whose label is exactly "Table". */
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button, a')].some((el) =>
          /^table$/i.test((el.textContent || '').trim()),
        ),
      { timeout: 15_000 },
    );
    await page.evaluate(() => {
      const toggle = [...document.querySelectorAll('button, a')].find((el) =>
        /^table$/i.test((el.textContent || '').trim()),
      );
      toggle.click();
    });
    await page.waitForSelector('.board-page__table-wrap', { state: 'visible' });

    const result = await page.evaluate(() => {
      const wrap = document.querySelector('.board-page__table-wrap');
      const body = wrap.querySelector('tbody') || wrap.querySelector('table');
      const names = ['Amon-Ra St. Brown', 'Christian McCaffrey', 'Jaxon Smith-Njigba'];
      const added = names.map((name, index) => {
        const row = document.createElement('tr');
        row.className = 'board-page__table-row';
        row.innerHTML =
          `<td class="board-page__td">${index + 1}</td>` +
          `<td class="board-page__td"><span class="board-page__table-name">${name}</span>` +
          `<span class="board-page__table-meta">SF · SF @ SEA · Sun 4:25</span></td>` +
          `<td class="board-page__td board-page__td--num">1288.8</td>` +
          `<td class="board-page__td board-page__td--num">288.85</td>` +
          `<td class="board-page__td board-page__td--num">188.11</td>` +
          `<td class="board-page__td board-page__td--num">388.99</td>`;
        body.appendChild(row);
        return row;
      });
      const overflow = wrap.scrollWidth - wrap.clientWidth;
      const columns = wrap.querySelectorAll('th').length;
      added.forEach((row) => row.remove());
      return { overflow, columns };
    });

    assert.equal(result.overflow, 0, 'the sheet scrolls sideways once real names are in it');
    assert.equal(result.columns, 6, 'the sheet should still show every column, not drop them to fit');
  } finally {
    await page.close();
  }
});
