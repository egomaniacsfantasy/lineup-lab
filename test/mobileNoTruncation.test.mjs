import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * Nothing on a phone gets cut off with an ellipsis.
 *
 * Truncation is not a layout strategy — it is the layout admitting it does not
 * fit and hoping nobody needs the rest. It hides exactly the thing the row
 * exists to say: "B. Ro..." for a waiver claim, "San Francisco 49ers" clipped
 * 8px short of its own name, a bench line that stopped before it got to which
 * slot the player would start in.
 *
 * This walks the Hub at the phone's real width and reports every element that
 * is actually overflowing an `ellipsis`. An element that carries
 * text-overflow but has room is fine; the assertion is about what is losing
 * characters right now, on real fixture content.
 */

const cwd = process.cwd();
const port = 4183;
const baseUrl = `http://127.0.0.1:${port}`;
/* Real phones, not round numbers, and not just the one plugged in. The
   smallest supported screen and the largest are where layouts actually break;
   testing only the device on the desk is how a layout ends up tailored to it.
   Insets are each device's real values. */
const DEVICES = [
  { name: 'iPhone SE', width: 320, height: 568, safeTop: 20, safeBottom: 0 },
  { name: 'iPhone 13 mini', width: 375, height: 812, safeTop: 50, safeBottom: 34 },
  { name: 'iPhone 17 Pro', width: 402, height: 874, safeTop: 62, safeBottom: 34 },
  { name: 'iPhone 17 Pro Max', width: 440, height: 956, safeTop: 62, safeBottom: 34 },
];

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

async function waitForUrl(url, timeoutMs = 40_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/* Runs in the page. */
function collectTruncated() {
  const out = [];
  for (const el of document.querySelectorAll('.app-content *')) {
    if (el.children.length > 0) continue; // only leaves hold the text
    const style = getComputedStyle(el);
    if (style.textOverflow !== 'ellipsis') continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) {
      out.push({
        cls: (el.className || '').toString().split(' ')[0],
        text: (el.textContent || '').trim().slice(0, 48),
        overBy: over,
      });
    }
  }
  return out;
}

/* The status bar is a native strip the page must not paint into. env() is 0 in
   a browser, so the native inset is stamped in the way the shell reads it. */
function measureTopBarrier() {
  const shell = document.querySelector('.app-shell');
  const band = document.querySelector('.matchup-page__season--mobile');
  const before = getComputedStyle(shell, '::before');
  return {
    shellPaddingTop: parseFloat(getComputedStyle(shell).paddingTop),
    contentTop: document.querySelector('.app-content').getBoundingClientRect().top,
    barrierHeight: parseFloat(before.height),
    barrierOpaque: before.backgroundColor !== 'rgba(0, 0, 0, 0)',
    bandTop: band ? band.getBoundingClientRect().top : null,
    bandHasBackground: band ? getComputedStyle(band).backgroundImage !== 'none' : null,
  };
}

/* Runs in the page: every text-entry control and the size iOS will see. */
function collectSmallInputs() {
  const out = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (['checkbox', 'radio', 'range', 'hidden', 'submit', 'button'].includes(type)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 16) {
      out.push({
        cls: (el.className || '').toString().split(' ')[0] || el.tagName.toLowerCase(),
        size,
      });
    }
  }
  return out;
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

async function openHub(scene, device) {
  const page = await browser.newPage({
    viewport: { width: device.width, height: device.height },
    colorScheme: 'dark',
  });
  await page.goto(`${baseUrl}/design/${scene}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-content', { state: 'visible' });
  /* env() is 0 in a browser, so the device's real insets are supplied the same
     way the native shell would supply them. */
  await page.evaluate(({ safeTop, safeBottom }) => {
    const root = document.documentElement.style;
    root.setProperty('--shell-safe-top', `${safeTop}px`);
    root.setProperty('--shell-safe-bottom', `${safeBottom}px`);
  }, device);
  await page.waitForTimeout(700);
  return page;
}

for (const device of DEVICES) for (const scene of ['matchup', 'matchup-live']) {
  test(`nothing on the ${scene} Hub is truncated on ${device.name}`, async () => {
    const page = await openHub(scene, device);
    try {
      const truncated = await page.evaluate(collectTruncated);
      assert.deepEqual(
        truncated,
        [],
        `${scene}: these lose characters to an ellipsis:\n${truncated
          .map((t) => `  .${t.cls} "${t.text}" (+${t.overBy}px)`)
          .join('\n')}`,
      );
    } finally {
      await page.close();
    }
  });
}

for (const device of DEVICES) test(`nothing paints into the status bar on ${device.name}`, async () => {
  const page = await openHub('matchup', device);
  try {
    const m = await page.evaluate(measureTopBarrier);
    const top = device.safeTop;
    assert.equal(m.shellPaddingTop, top, 'the shell must reserve the whole inset');
    assert.equal(m.contentTop, top, 'the scroller must start below the inset');
    assert.equal(m.barrierHeight, top, 'the barrier must cover the whole inset');
    assert.ok(m.barrierOpaque, 'the barrier must be opaque, not a tint');
    assert.ok(m.bandTop >= top, `the season band starts at ${m.bandTop}, inside the status bar`);
    /* The band asked for --bg-base, which is not a token, so the whole
       background declaration was invalid and it painted nothing at all. */
    assert.ok(m.bandHasBackground, 'the season band must have a real background');
  } finally {
    await page.close();
  }
});

/**
 * No text field on a phone may be smaller than 16px.
 *
 * iOS zooms the whole web view when you focus one that is, and it does not
 * zoom back. What that looks like is not "the text got bigger" — it is the tab
 * bar losing its labels off the bottom of the screen, the page panning
 * sideways so everything sits against the edges, and the sticky season band
 * riding up into the clock. Six symptoms that read as six layout bugs, all of
 * them one font size.
 *
 * Reproduced on device by tapping the Board's 14px search field.
 */
for (const scene of ['matchup', 'board', 'market', 'league', 'connect']) {
  test(`no text field on ${scene} is small enough to make iOS zoom`, async () => {
    const page = await openHub(scene, DEVICES[2]);
    try {
      const small = await page.evaluate(collectSmallInputs);
      assert.deepEqual(
        small,
        [],
        `${scene}: these will zoom the page on focus and never zoom back:\n${small
          .map((s) => `  .${s.cls} at ${s.size}px`)
          .join('\n')}`,
      );
    } finally {
      await page.close();
    }
  });
}
