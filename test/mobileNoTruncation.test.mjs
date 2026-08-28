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
    /* `.season-band` is the component's own root. The page-level wrapper around
     it is being renamed by other work in flight, and this guard is about where
     the band lands on screen, not what the wrapper is called. */
  const band = document.querySelector('.season-band');
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

/* The season band only renders once pricing has resolved, so a fixed wait is a
   coin flip: this guard failed on a pre-push with "the season band starts at
   null" minutes after passing locally. Wait for the thing being measured. */
async function waitForBand(page) {
  await page.waitForSelector('.season-band', { timeout: 20_000 });
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
  /* `matchup` is the unpriced fixture and has no futures, so it never renders
     a band. `matchup-live` is the scene where there is something to land. */
  const page = await openHub('matchup-live', device);
  try {
    await waitForBand(page);
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

/* ──────────────────────────────────────────────────────────────────────────
   The gate: on a phone the app is not shown at all.

   Here rather than in a file of its own because every rendered test in this
   repo runs its own Vite, and a ninth one pushes this machine far enough that
   an unrelated test times out waiting thirty seconds for its server. Same
   subject as the rest of this file, which is what a phone gets.

   This gate replaces the entire application, so the ways it can be wrong are
   expensive in both directions: catch a tablet or a laptop and the product is
   gone for someone who could have used it; miss a phone and the thing it
   exists to prevent happens anyway. The exemptions matter as much as the
   rule, and the design routes most of all: they are how the tests above look
   at a phone-width layout, so a gate that caught them would take about twenty
   tests with it.
   ────────────────────────────────────────────────────────────────────────── */

/** A fresh context every time: the override persists, so it must not leak. */
async function visit(path, { width, height, reducedMotion, hasTouch = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch,
    ...(reducedMotion ? { reducedMotion } : {}),
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  return { page, context };
}

async function gated(path, options) {
  const { page, context } = await visit(path, options);
  try {
    return await page.evaluate(() => ({
      gate: document.querySelectorAll('.mobile-gate').length,
      shell: document.querySelectorAll('.app-shell').length,
      /* The sign-up form. A phone that is shown this has been asked to make
         an account before being told it cannot use what it just made. */
      signup: document.querySelectorAll('input[type="password"]').length,
    }));
  } finally {
    await context.close();
  }
}

test('a phone gets the gate and nothing else', async () => {
  const seen = await gated('/league', { width: 375, height: 812 });
  assert.equal(seen.gate, 1, 'a 375px viewport was not gated');
  assert.equal(seen.shell, 0, 'the app shell rendered behind the gate');
  assert.equal(seen.signup, 0, 'a phone was shown a sign-up form');
});

test('a phone is turned away at the door, before it is asked to sign up', async () => {
  /* The gate sits above the auth split. Below it, a signed-out phone was
     shown the whole sign-up flow and told at the END of it to find a laptop. */
  for (const path of ['/', '/signin', '/connect', '/matchup']) {
    const seen = await gated(path, { width: 375, height: 812 });
    assert.equal(seen.gate, 1, `${path} was not gated on a phone`);
    assert.equal(seen.signup, 0, `${path} showed a phone a sign-up form`);
  }
});

test('a phone on its side is still a phone', async () => {
  /* 844 wide clears the width test comfortably and leaves 390px of height,
     which is worse than portrait rather than better. A coarse pointer is what
     separates it from a desktop window someone has dragged short. */
  const seen = await gated('/league', { width: 844, height: 390, hasTouch: true });
  assert.equal(seen.gate, 1, 'a landscape phone was let through');
});

test('a tablet and a laptop are not phones', async () => {
  /* "Use a laptop or tablet" is only honest advice if a tablet works. */
  for (const [width, height, what] of [
    [768, 1024, 'a portrait tablet'],
    [1024, 768, 'a landscape tablet'],
    [1440, 900, 'a laptop'],
  ]) {
    const seen = await gated('/league', { width, height });
    assert.equal(seen.gate, 0, `${what} (${width}x${height}) was gated`);
    assert.ok(seen.shell > 0 || seen.signup > 0, `${what} rendered neither the app nor a sign-in`);
  }
});

test('a short desktop window is not a phone', async () => {
  /* The landscape rule keys on a coarse pointer for exactly this reason: a
     window dragged flat is still a mouse and a keyboard. */
  const seen = await gated('/league', { width: 1280, height: 420 });
  assert.equal(seen.gate, 0, 'a short desktop window was gated');
});

test('the design routes are never gated, at any width', async () => {
  /* Every other rendered test in this suite looks at a phone-width layout
     through these. Gating them takes about twenty tests with it. */
  for (const path of ['/design/board', '/design/matchup', '/design/board-row/slip']) {
    const seen = await gated(path, { width: 375, height: 812 });
    assert.equal(seen.gate, 0, `${path} was gated at 375px`);
  }
});

test('?desktop=1 lets you look anyway, and sticks, and can be turned off', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  try {
    const count = () => page.evaluate(() => document.querySelectorAll('.mobile-gate').length);

    await page.goto(`${baseUrl}/league?desktop=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    assert.equal(await count(), 0, '?desktop=1 did not let the phone through');

    /* Sticky, or it would have to be re-typed on every link followed. */
    await page.goto(`${baseUrl}/league`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    assert.equal(await count(), 0, 'the override did not survive the next page');

    /* And a way back out. A sticky override with no off switch is one nobody
       can undo without clearing site data. */
    await page.goto(`${baseUrl}/league?desktop=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    assert.equal(await count(), 1, '?desktop=0 did not turn the override off');
  } finally {
    await context.close();
  }
});

test('the gate fills the screen and never scrolls', async () => {
  const { page, context } = await visit('/league', { width: 375, height: 812 });
  try {
    const box = await page.evaluate(() => {
      const gate = document.querySelector('.mobile-gate');
      const rect = gate.getBoundingClientRect();
      return {
        coversWidth: rect.width >= innerWidth,
        coversHeight: rect.height >= innerHeight - 1,
        scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        /* Both lines of the headline, and neither of them alone. */
        headlineLines: Math.round(
          document.querySelector('.mobile-gate__headline').getBoundingClientRect().height /
            (parseFloat(getComputedStyle(document.querySelector('.mobile-gate__headline')).fontSize) *
              1.05),
        ),
      };
    });
    assert.ok(box.coversWidth && box.coversHeight, 'the gate does not fill the screen');
    /* A gate you can scroll past is a banner, and there is nothing behind it
       to scroll to anyway. */
    assert.equal(box.scrollX, 0, 'the gate scrolls sideways');
    assert.equal(box.scrollY, 0, 'the gate scrolls');
    assert.ok(box.headlineLines <= 2, `the headline runs to ${box.headlineLines} lines`);
  } finally {
    await context.close();
  }
});

test('the drift runs, and stops for anyone who asked for less motion', async () => {
  /* Two things this cannot be measured with, both found the hard way.
     Sampling getComputedStyle().transform proves nothing: a 26s ease-in-out
     spends whole seconds either side of its turnaround barely moving, so five
     snapshots come back identical from an animation running perfectly well.
     And getAnimations() proves nothing under reduced motion either, because
     Chromium suppresses animations itself when the media feature is emulated,
     so it returns zero whether or not our own rule exists.
     The computed animation-name is the cascade's actual answer, and it is
     'none' only if this stylesheet made it so. */
  const glow = async (reducedMotion) => {
    const { page, context } = await visit('/league', { width: 375, height: 812, reducedMotion });
    try {
      return await page.evaluate(async () => {
        const node = document.querySelector('.mobile-gate__glow');
        const before = node.getAnimations()[0]?.currentTime ?? null;
        await new Promise((resolve) => setTimeout(resolve, 600));
        return {
          animationName: getComputedStyle(node).animationName,
          attached: node.getAnimations().length,
          advanced: before != null && (node.getAnimations()[0]?.currentTime ?? 0) > before,
        };
      });
    } finally {
      await context.close();
    }
  };

  const normal = await glow(null);
  assert.equal(normal.animationName, 'mobile-gate-drift', 'the background carries no animation');
  assert.equal(normal.attached, 1);
  assert.ok(normal.advanced, 'the animation is attached but not advancing');

  const reduced = await glow('reduce');
  assert.equal(
    reduced.animationName,
    'none',
    'reduced motion still resolves to an animation, so the stylesheet is not the thing stopping it',
  );
});
