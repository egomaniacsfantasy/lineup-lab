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
     shown the whole sign-up flow and told at the END of it to find a laptop.

     A BARE /signin is still in this list. The peek now hands the sign-up
     screen a username and that case is exempted below, but the complaint here
     was never about the form: it was about the order. Somebody arriving cold
     has been given nothing yet, so they get the pitch. */
  for (const path of ['/', '/signin', '/connect', '/matchup']) {
    const seen = await gated(path, { width: 375, height: 812 });
    assert.equal(seen.gate, 1, `${path} was not gated on a phone`);
    assert.equal(seen.signup, 0, `${path} showed a phone a sign-up form`);
  }
});

test('the sign-up door closes behind them', async () => {
  /* The exemption is true of one path, and it used to be read once per page
     load. So a phone that arrived at /signin from the peek had the gate
     disabled for the rest of the visit: navigate anywhere afterwards and the
     entire desktop app rendered on the phone, which is the one outcome the
     gate exists to prevent, reached through the door added to help them. */
  const { page, context } = await visit('/signin?sleeper=designgods', {
    width: 375,
    height: 812,
  });
  try {
    await page.locator('.auth-landing__form').waitFor({ timeout: 15_000 });

    /* Move on the way the app does after an account is made: a client side
       route change, not a fresh load. */
    await page.evaluate(() => {
      window.history.pushState({}, '', '/connect');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.locator('.mobile-gate').waitFor({ timeout: 10_000 });

    const after = await page.evaluate(() => ({
      path: window.location.pathname,
      gate: document.querySelectorAll('.mobile-gate').length,
      shell: document.querySelectorAll('.app-shell').length,
    }));

    assert.equal(after.path, '/connect');
    assert.equal(after.gate, 1, 'the gate stayed off after the sign-up path');
    assert.equal(after.shell, 0, 'the desktop shell rendered on a phone');
  } finally {
    await context.close();
  }
});

test('the one way through is a phone that has already been shown its league', async () => {
  /* The exemption, and its exact width. ?sleeper= is set by one thing only:
     the peek's button, which cannot be pressed until the screen has priced a
     real matchup and a real championship number. So this is the account being
     asked for AFTER the value, which is the order the test above is about. */
  const seen = await gated('/signin?sleeper=designgods', { width: 375, height: 812 });
  assert.equal(seen.gate, 0, 'the peek handoff was bounced back to the pitch');
  assert.equal(seen.signup, 1, 'the sign-up form did not render for the handoff');
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

/* 667 is an iPhone SE, the shortest phone anyone still uses and the one the
   pitch has to fit on. 812 is the common case. */
for (const [width, height, what] of [
  [375, 667, 'an iPhone SE'],
  [375, 812, 'a modern phone'],
]) {
  test(`the pitch fits ${what} without scrolling`, async () => {
    const { page, context } = await visit('/league', { width, height });
    try {
      const box = await page.evaluate(() => {
        const gate = document.querySelector('.mobile-gate');
        const rect = gate.getBoundingClientRect();
        const headline = document.querySelector('.mobile-gate__headline');
        return {
          coversWidth: rect.width >= innerWidth,
          coversHeight: rect.height >= innerHeight - 1,
          scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          scrollY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
          /* Every line of the pitch, still inside the screen. A gate that
             runs its last reason off the bottom has spent the visit and not
             made the case. */
          contentBottom: document.querySelector('.mobile-gate__address').getBoundingClientRect().bottom,
          viewport: innerHeight,
          headlineLines: Math.round(
            headline.getBoundingClientRect().height /
              (parseFloat(getComputedStyle(headline).fontSize) * 1.05),
          ),
        };
      });

      assert.ok(box.coversWidth && box.coversHeight, 'the gate does not fill the screen');
      /* A gate you can scroll past is a banner, and there is nothing behind
         it to scroll to anyway. */
      assert.equal(box.scrollX, 0, 'the gate scrolls sideways');
      assert.equal(box.scrollY, 0, 'the gate scrolls');
      assert.ok(
        box.contentBottom <= box.viewport,
        `the pitch runs ${(box.contentBottom - box.viewport).toFixed(0)}px off the bottom`,
      );
      assert.ok(box.headlineLines <= 2, `the headline runs to ${box.headlineLines} lines`);
    } finally {
      await context.close();
    }
  });
}

/**
 * The pitch, and only claims the product can honour.
 *
 * This screen is the first and often the only one an advert sends someone to,
 * so it sells rather than apologises. Every reason on it has to be a surface
 * that exists: the Predictor was left off a draft of this list on the word of
 * a comment in src/services/predictor.ts saying its endpoints were unbuilt,
 * which they have not been for some time. The route is right there in
 * server/routes/api.js. Claims get checked against routes, not against prose.
 */
test('the gate makes the case, and every claim on it has a surface behind it', async () => {
  const { page, context } = await visit('/league', { width: 375, height: 812 });
  try {
    const pitch = await page.evaluate(() => ({
      props: [...document.querySelectorAll('.mobile-gate__props li')].map((li) => li.textContent),
      free: document.querySelector('.mobile-gate__free')?.textContent ?? '',
      /* The way in. This used to be a line of copy telling you to go and
         find a laptop; it is a control now, because a screen that only
         gives instructions is the dead end this one stopped being. */
      cta: document.querySelector('.mobile-gate__open')?.textContent ?? '',
      body: document.querySelector('.mobile-gate').textContent,
    }));

    assert.ok(pitch.props.length >= 4, `only ${pitch.props.length} reasons to walk to a laptop`);

    /* The five surfaces, by the words someone would recognise them by. */
    for (const claim of [/moneyline/i, /championship odds/i, /trade/i, /bracket|season/i, /parlay/i]) {
      assert.ok(
        pitch.props.some((prop) => claim.test(prop)),
        `nothing on the gate mentions ${claim}`,
      );
    }

    /* Free, and specifically the same "during the beta" the sign-up form
       says. A flat "free" here would contradict the next screen. */
    assert.match(pitch.free, /free/i);
    assert.match(pitch.free, /beta/i);

    assert.match(pitch.cta, /odds/i, 'there is no way into the product from the pitch');
    /* And it still says where the rest of it lives, which is the thing it
       originally did and must not lose by gaining a door. */
    assert.match(pitch.body, /laptop or tablet/i);
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

/* ──────────────────────────────────────────────────────────────────────────
   The door in the gate: a Sleeper username, and one number.

   The gate used to end at "go and find a laptop", which is a handoff most
   people never make. The card that brought them here was forwarded into a
   league group chat and opened on a phone, so a wall at this point breaks
   the loop the card exists to start.

   What the anonymous view shows is deliberately almost nothing: your
   championship odds, and the rest of your league by name with every price but
   yours locked. The tease is a rival's name with a lock where his number
   should be.
   ────────────────────────────────────────────────────────────────────────── */

async function peek(page) {
  await page.locator('.mobile-gate__open').click();
  await page.locator('.league-peek__input').fill('designgods');
  await page.locator('.league-peek__go').click();
  await page.locator('.league-peek__odds').waitFor({ timeout: 15_000 });
}

test('a username buys exactly one number, and every rival stays locked', async () => {
  const { page, context } = await visit('/', { width: 375, height: 812 });
  try {
    await peek(page);

    const seen = await page.evaluate(() => ({
      odds: document.querySelector('.league-peek__odds').textContent.trim(),
      /* Rival rows are named, because a list of nobody does not prove it is
         your league. Their prices are not, because that is the thing being
         sold. */
      rivals: [...document.querySelectorAll('.league-peek__rival')].map((row) => ({
        named: row.querySelector('.league-peek__rival-name').textContent.trim().length > 0,
        locked: Boolean(row.querySelector('.league-peek__lock')),
        /* No stray digits: a percentage or a price anywhere in a rival row
           would be the one thing this screen must not give away. */
        leaks: /\d/.test(row.textContent.replace(/\s/g, '')),
      })),
      /* And the pitch steps aside: five bullets between someone and the
         number they just asked for is the argument outstaying its welcome. */
      pitchStillThere: document.querySelectorAll('.mobile-gate__props').length,
    }));

    assert.match(seen.odds, /^[+-]?\d/, `the headline number reads "${seen.odds}"`);
    assert.ok(seen.rivals.length > 0, 'no rival rows to be locked out of');
    for (const rival of seen.rivals) {
      assert.ok(rival.named, 'a rival row has no name, so it proves nothing');
      assert.ok(rival.locked, 'a rival row is not locked');
      assert.ok(!rival.leaks, 'a rival row is showing a number');
    }
    assert.equal(seen.pitchStillThere, 0, 'the pitch is still sitting on top of the answer');
  } finally {
    await context.close();
  }
});

test('the sign-up is reachable on the shortest phone', async () => {
  /* The gate was overflow: hidden while it was a fixed poster. With a league
     listed under the number, that put the call to action past the bottom of
     a short screen with no way to reach it.

     Asserting this by setting scrollTop proves nothing: an overflow: hidden
     box is still a scroll container, so a script can scroll it when a finger
     cannot. What has to be true is that the content either fits, or the box
     is one the user can actually scroll.

     560px, not 667: an iPhone SE running Safari with its bars showing has
     about this much room, and a real twelve-team league lists eleven locked
     rows rather than the fixture's five. */
  const { page, context } = await visit('/', { width: 375, height: 560 });
  try {
    await peek(page);
    const state = await page.evaluate(() => {
      const gate = document.querySelector('.mobile-gate');
      const cta = document.querySelector('.league-peek__cta').getBoundingClientRect();
      return {
        overflows: gate.scrollHeight > gate.clientHeight + 1,
        overflowY: getComputedStyle(gate).overflowY,
        ctaFitsUnscrolled: cta.bottom <= window.innerHeight + 1,
      };
    });

    if (state.ctaFitsUnscrolled) return;
    assert.ok(state.overflows, 'the button is off screen but the gate does not overflow');
    assert.match(
      state.overflowY,
      /auto|scroll/,
      `the sign-up is below the fold and the gate is overflow: ${state.overflowY}, so nobody can reach it`,
    );
  } finally {
    await context.close();
  }
});

test('a username nobody has says so, and keeps the field', async () => {
  const { page, context } = await visit('/', { width: 375, height: 812 });
  try {
    await page.locator('.mobile-gate__open').click();
    await page.locator('.league-peek__input').fill('nobody-has-this-handle');
    await page.locator('.league-peek__go').click();
    await page.locator('.league-peek__error').waitFor({ timeout: 15_000 });

    /* A dead end here is the same mistake the gate made: say what happened
       and leave the way in on screen. */
    assert.equal(await page.locator('.league-peek__input').count(), 1);
  } finally {
    await context.close();
  }
});


/* ──────────────────────────────────────────────────────────────────────────
   THE MATCHUP, UNLOCKED

   The peek used to open with a championship price and nothing else, which is
   one number from a machine nobody has watched work: the locked rows under it
   were asking for an account on trust. It now prices one whole matchup first,
   on their league, against a manager they know.

   That section is the thing being demonstrated, so these guard the two ways a
   demonstration can lie: by quoting a price that is not a price, and by
   quoting two.
   ────────────────────────────────────────────────────────────────────────── */

test('the gate prices one whole matchup before it locks anything', async () => {
  const { page, context } = await visit('/', { width: 375, height: 812 });
  try {
    await peek(page);
    await page.locator('.league-peek__game').waitFor({ timeout: 15_000 });

    const game = await page.evaluate(() => {
      const sides = [...document.querySelectorAll('.league-peek__game-side')];
      return {
        sideCount: sides.length,
        week: document.querySelector('.league-peek__game-week').textContent.trim(),
        names: sides.map((side) => side.querySelector('.league-peek__game-name').textContent.trim()),
        records: sides.map((side) => side.querySelector('.league-peek__game-record').textContent.trim()),
        prices: sides.map((side) => side.querySelector('.league-peek__game-price').textContent.trim()),
        projections: sides.map((side) => side.querySelector('.league-peek__game-proj').textContent.trim()),
        barWidth: document.querySelector('.league-peek__game-bar-fill').style.width,
      };
    });

    assert.equal(game.sideCount, 2, 'a matchup has two sides');
    assert.match(game.week, /^Week \d+$/, `week reads "${game.week}"`);
    for (const name of game.names) assert.ok(name.length > 0, 'a side has no team name');
    for (const record of game.records) assert.match(record, /^\d+-\d+(-\d+)?$/, `record reads "${record}"`);
    for (const projection of game.projections) {
      assert.match(projection, /^(\d+\.\d|—) pts$/, `projection reads "${projection}"`);
    }
    assert.match(game.barWidth, /^\d+(\.\d+)?%$/, `the win bar has width "${game.barWidth}"`);

    /* The invariant a book cannot break: in a two-team game exactly one side
       is the favourite. The Hub's engine used to derive the second price by
       arithmetic on the first, which produced two favourites in one game. */
    const signs = game.prices.map((price) => price.trim()[0]);
    assert.ok(
      game.prices.every((price) => /^[+-]\d+$/.test(price)),
      `prices read ${JSON.stringify(game.prices)}`,
    );
    assert.notEqual(
      signs[0],
      signs[1],
      `both sides of one game are priced ${JSON.stringify(game.prices)}`,
    );
  } finally {
    await context.close();
  }
});

test('the gate never shows a price and a percentage as the same claim', async () => {
  /* The product's rule: one unit at a time. The win bar carries the only
     percentage on the screen and there is no price beside it, so the reader is
     never asked to check two numbers against each other. */
  const { page, context } = await visit('/', { width: 375, height: 812 });
  try {
    await peek(page);
    await page.locator('.league-peek__game').waitFor({ timeout: 15_000 });

    const mixed = await page.evaluate(() => {
      const sides = [...document.querySelectorAll('.league-peek__game-side')];
      return sides.map((side) => ({
        text: side.textContent,
        hasPercent: side.textContent.includes('%'),
      }));
    });

    for (const side of mixed) {
      assert.ok(!side.hasPercent, `a priced side is also showing a percentage: "${side.text}"`);
    }
  } finally {
    await context.close();
  }
});

test('the sign-up carries the username it was already given', async () => {
  /* The conversion point for every phone-first visitor. Somebody who typed
     their username into the pitch and watched their own matchup get priced
     must not be asked for it again on the next screen, or on the laptop. */
  const { page, context } = await visit('/', { width: 375, height: 812 });
  try {
    await peek(page);
    await page.locator('.league-peek__cta').click();
    await page.waitForURL(/\/signin/, { timeout: 15_000 });
    /* The button leaves via a full navigation, because the gate sits above the
       router and there is nothing to push to. waitForURL returns on the URL
       change, which is before the new document has rendered anything, so wait
       for the thing being asserted rather than for the address bar. */
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.auth-landing__form, .mobile-gate').first().waitFor({ timeout: 15_000 });

    const landed = await page.evaluate(() => ({
      url: window.location.pathname + window.location.search,
      /* The form itself, not the gate again. /signin is exempt from the phone
         gate for exactly this reason: without it the button at the bottom of
         the pitch loops straight back to the pitch. */
      hasForm: Boolean(document.querySelector('.auth-landing__form')),
      gateStillUp: Boolean(document.querySelector('.mobile-gate')),
      remembered: window.localStorage.getItem('og.olympus.pending-sleeper'),
    }));

    assert.match(landed.url, /sleeper=designgods/, `landed on "${landed.url}"`);
    assert.ok(landed.hasForm, 'the sign-up form did not render');
    assert.ok(!landed.gateStillUp, 'the gate bounced the sign-up back to itself');
    assert.equal(landed.remembered, 'designgods', 'the username was not kept for the connect screen');
  } finally {
    await context.close();
  }
});

test('a league still being priced waits, and never invents a number or blames the user', async () => {
  /* The reported failure, and the reason it was so hard to believe: a hero
     quoting -311 with every player projecting 0.0, which "repriced" to +169
     the moment projections landed.

     Neither number came from the engine. Both were frames of the placeholder
     that used to sit in that slot, which drew random magnitudes between 105
     and 365 with a random sign, i.e. exactly the range real prices live in.
     It was indistinguishable from a quote, so it got read as one, and the
     book looked like it had changed its mind by five hundred points.

     ?syncing answers the pricing call the way a freshly connected league does:
     available false, nothing behind it. Two things must be true in that
     window. Nothing on screen may be a number, and the message must not be the
     old one, which told the user we could not find their team in their own
     league. That was never true and it landed on the screen most of the paid
     traffic arrives on. */
  const { page, context } = await visit('/?syncing=1', { width: 375, height: 812 });
  try {
    await page.locator('.mobile-gate__open').click();
    await page.locator('.league-peek__input').fill('designgods');
    await page.locator('.league-peek__go').click();

    // It should still be waiting well after the point it used to give up.
    await page.waitForTimeout(3_000);
    const waiting = await page.evaluate(() => ({
      busy: Boolean(document.querySelector('.league-peek--busy')),
      odds: document.querySelector('.league-peek__odds')?.textContent ?? null,
      error: document.querySelector('.league-peek__error')?.textContent ?? null,
    }));

    assert.ok(waiting.busy, 'the gate stopped waiting for a league that is still syncing');
    assert.equal(waiting.odds, null, 'a championship price appeared for an unpriced league');
    assert.equal(waiting.error, null, `it gave up early with "${waiting.error}"`);

    // And when it does give up, it says the true thing.
    await page.locator('.league-peek__error').waitFor({ timeout: 30_000 });
    const gaveUp = await page.evaluate(
      () => document.querySelector('.league-peek__error').textContent.trim(),
    );
    assert.match(gaveUp, /still being priced/, `it gave up with "${gaveUp}"`);
    assert.ok(
      !/could not find your team/i.test(gaveUp),
      'it still blames the user for a league that simply has not been priced',
    );
    assert.equal(
      await page.locator('.league-peek__input').count(),
      1,
      'the way back in is gone',
    );
  } finally {
    await context.close();
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   THE TICKET WINDOW

   The landing page runs the same machine as the phone gate above, on a screen
   that looks nothing like it, which is exactly why the machine was pulled out
   into usePeek rather than copied. These test the page's three states plus the
   two ways it can go wrong.

   Here rather than in a file of their own because every rendered test in this
   repo brings up its own Vite, and this file already owns one and already
   exercises the identical path on the other screen.
   ────────────────────────────────────────────────────────────────────────── */

const DESKTOP = { width: 1440, height: 900 };

async function landing(query = '') {
  /* ?desktop=1 so the phone gate never intercepts. The viewport is desktop
     anyway; the flag makes that explicit rather than incidental. */
  const { page, context } = await visit(`/${query}${query ? '&' : '?'}desktop=1`, DESKTOP);
  await page.locator('input').waitFor({ timeout: 15_000 });
  return { page, context };
}

async function priceIt(page, handle = 'designgods') {
  await page.locator('input').fill(handle);
  await page.locator('form button[type="submit"]').click();
}

test('the window asks for one thing and nothing competes with it', async () => {
  const { page, context } = await landing();
  try {
    const seen = await page.evaluate(() => {
      const main = document.querySelector('main');
      const input = document.querySelector('input');
      const submit = document.querySelector('form button[type="submit"]');
      const inputBox = input.getBoundingClientRect();
      const submitBox = submit.getBoundingClientRect();
      /* Every other control on the screen, so "largest" is a claim about all
         of them rather than about the two we happened to think of. */
      const others = [...main.querySelectorAll('a, button')]
        .filter((el) => el !== submit)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent.trim(), area: r.width * r.height };
        });
      return {
        text: main.textContent,
        placeholder: input.placeholder,
        submit: submit.textContent.trim(),
        ctaArea: submitBox.width * submitBox.height,
        inputArea: inputBox.width * inputBox.height,
        others,
        /* One viewport. Anything below the fold on this screen does not
           belong on it. */
        pageHeight: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
      };
    });

    assert.equal(seen.placeholder, 'Your Sleeper username');
    assert.equal(seen.submit, 'Price my league');
    assert.match(
      seen.text,
      /Somewhere in your league sits the championship favorite\./,
      'the headline is not the one that shipped',
    );
    /* The first version sold the machine rather than the book, which walks
       away from the framing the whole product is built on. */
    assert.ok(
      !/Ten thousand simulations are about to/.test(seen.text),
      'the retired headline is back',
    );

    /* One door, present and quiet, and smaller than the thing it sits under.
       "Just looking?" is deliberately gone: it offered a stranger somebody
       else's league at the exact moment they were deciding to type their
       own. */
    assert.match(seen.text, /My league is on ESPN/);
    assert.ok(!/Just looking/.test(seen.text), 'the demo door is back on the landing page');
    for (const other of seen.others) {
      assert.ok(
        other.area < seen.ctaArea,
        `"${other.text}" is as big as the call to action, so it competes with it`,
      );
    }
    assert.ok(seen.inputArea > 0, 'no field');

    /* One clause. The other two were answering questions nobody had asked
       yet: a simulation count means nothing before you have seen a number, and
       "no money anywhere in this" raises the spectre of money on a screen that
       had not mentioned it. */
    assert.match(seen.text, /Completely free during the beta\./);
    assert.ok(
      !/simulations per matchup/.test(seen.text),
      'the sim count is back in the small print',
    );
    assert.match(seen.text, /Already have an account\?/);

    /* And none of the old page: no demo league, no invented teams, no
       feature grid. */
    assert.ok(!/Mount Olympus/.test(seen.text), 'the demo league is on the landing page again');
    assert.ok(!/Every decision has a price/.test(seen.text), 'the retired tagline is back');

    assert.ok(
      seen.pageHeight <= seen.viewport + 1,
      `the window is ${seen.pageHeight}px in a ${seen.viewport}px viewport, so it scrolls`,
    );
  } finally {
    await context.close();
  }
});

test('a username turns the page into the visitor own book', async () => {
  const { page, context } = await landing();
  try {
    await priceIt(page);
    /* State 2 is a real state, not a flicker: the ritual has to be on screen
       while the league is priced. */
    await page.locator('[aria-busy="true"]').waitFor({ timeout: 5_000 });

    await page.locator('ol li').first().waitFor({ timeout: 20_000 });

    const book = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('ol li')];
      const cta = document.querySelector('main a[href*="signin"]');
      return {
        text: document.querySelector('main').textContent,
        rows: rows.length,
        /* Their row is priced; everybody else's is a lock. */
        locked: rows.filter((r) => r.querySelector('svg')).length,
        priced: rows.filter((r) => !r.querySelector('svg')).length,
        prices: [...document.querySelectorAll('main span')]
          .map((s) => s.textContent.trim())
          .filter((t) => /^[+-]\d+$/.test(t)),
        cta: cta?.textContent.trim(),
        ctaHref: cta?.getAttribute('href'),
      };
    });

    assert.ok(book.rows >= 2, `only ${book.rows} teams in the table`);
    assert.equal(book.priced, 1, 'more than one row is unlocked');
    assert.equal(book.locked, book.rows - 1, 'not every rival is locked');

    /* The matchup is priced, and a two-team game has exactly one favourite. */
    const [yours, theirs] = book.prices;
    assert.ok(yours && theirs, `expected two matchup prices, got ${JSON.stringify(book.prices)}`);
    assert.notEqual(
      Math.sign(Number(yours)),
      Math.sign(Number(theirs)),
      `both sides priced ${yours} / ${theirs}`,
    );

    assert.equal(book.cta, 'Create a free account');
    /* Carried through, so it is never typed twice. */
    assert.match(book.ctaHref, /sleeper=designgods/, `the CTA points at ${book.ctaHref}`);
    assert.match(book.text, /The whole book opens when you do\. Free during the beta\./);
  } finally {
    await context.close();
  }
});

test('a name nobody has says so, and leaves every door open', async () => {
  const { page, context } = await landing();
  try {
    await priceIt(page, 'nobody-has-this-handle');
    /* Not [role="status"]: the pricing state carries that too, and waiting on
       it matched the ritual rather than the failure. Wait for the field to
       come BACK, which is the thing being asserted anyway. */
    await page.getByText(/No Sleeper account by that name/i).waitFor({ timeout: 20_000 });

    const seen = await page.evaluate(() => ({
      error: [...document.querySelectorAll('main p')]
        .map((p) => p.textContent.trim())
        .find((t) => /No Sleeper account/i.test(t)) ?? '',
      fieldKept: Boolean(document.querySelector('input')),
      value: document.querySelector('input')?.value,
      text: document.querySelector('main').textContent,
    }));

    assert.match(seen.error, /No Sleeper account by that name/i, `it said "${seen.error}"`);
    assert.ok(seen.fieldKept, 'the field is gone, so there is no second try');
    assert.equal(seen.value, 'nobody-has-this-handle', 'it threw away what they typed');
    /* The ESPN door survives a miss. Somebody who "mistyped" may have no
       Sleeper name to spell correctly, and a dead end here ends the visit. */
    assert.match(seen.text, /My league is on ESPN/);
  } finally {
    await context.close();
  }
});

test('somebody in two leagues is asked which one', async () => {
  const { page, context } = await landing('?multiLeague=1');
  try {
    await priceIt(page);
    await page.locator('ul li button').first().waitFor({ timeout: 20_000 });

    const choice = await page.evaluate(() => ({
      options: [...document.querySelectorAll('ul li button')].map((b) => b.textContent.trim()),
      text: document.querySelector('main').textContent,
    }));

    assert.equal(choice.options.length, 2, `offered ${choice.options.length} leagues`);
    assert.ok(choice.options.some((o) => /Mount Olympus/.test(o)));
    assert.ok(choice.options.some((o) => /The Second Circle/.test(o)));

    /* And picking one gets to the book. */
    await page.locator('ul li button').first().click();
    await page.locator('ol li').first().waitFor({ timeout: 20_000 });
  } finally {
    await context.close();
  }
});

test('the ESPN door explains itself and never asks for ESPN credentials', async () => {
  const { page, context } = await landing();
  try {
    await page.getByText('My league is on ESPN').click();
    await page.getByText('ESPN leagues connect after you make an account.').waitFor({
      timeout: 10_000,
    });

    const door = await page.evaluate(() => ({
      text: document.querySelector('main').textContent,
      /* The one thing this screen must never do. */
      passwords: document.querySelectorAll('input[type="password"]').length,
      inputs: document.querySelectorAll('input').length,
      cta: document.querySelector('main a[href*="signin"]')?.textContent.trim(),
    }));

    assert.equal(door.passwords, 0, 'the landing page is asking for an ESPN password');
    assert.equal(door.inputs, 0, 'the ESPN door is collecting something');
    assert.match(door.text, /needs a computer/);
    assert.equal(door.cta, 'Create a free account');
  } finally {
    await context.close();
  }
});

test('the landing page acknowledges Sleeper and ESPN and nothing else', async () => {
  const { page, context } = await landing();
  try {
    /* Placeholders count as visible words on this page: "Sleeper" appears in
       the field rather than in prose, which is the whole design. */
    const text = await page.evaluate(() => {
      const main = document.querySelector('main');
      const placeholders = [...main.querySelectorAll('input')]
        .map((input) => input.placeholder)
        .join(' ');
      return `${main.textContent} ${placeholders}`;
    });
    for (const other of ['Yahoo', 'NFL.com', 'CBS', 'MyFantasyLeague', 'Fleaflicker']) {
      assert.ok(!new RegExp(other, 'i').test(text), `the page mentions ${other}`);
    }
    assert.match(text, /Sleeper/);
    assert.match(text, /ESPN/);
  } finally {
    await context.close();
  }
});

test('a dynasty peek says what is missing, and does not contradict itself', async () => {
  /* The scope note lives in the app shell, and both anonymous screens render
     ABOVE the shell, so a dynasty manager arriving from an advert saw trade
     and ranking claims that do not apply to their league with nothing saying
     so. They are also the audience most likely to read that as broken rather
     than early. */
  const { page, context } = await visit('/?dynasty=1', { width: 375, height: 812 });
  try {
    await peek(page);
    await page.locator('.dynasty-scope').waitFor({ timeout: 15_000 });

    const seen = await page.evaluate(() => ({
      note: document.querySelector('.dynasty-scope').textContent,
      pitch: document.querySelector('.league-peek__pitch').textContent,
    }));

    assert.match(seen.note, /Dynasty league/i);
    assert.match(seen.note, /trade pricing is off/i);
    assert.match(seen.note, /this season alone/i);

    /* And the pitch beside it must not offer the thing the note just said is
       off. Saying both, two sentences apart, is the product contradicting
       itself on the screen where it is asking to be believed. */
    assert.ok(
      !/trade finder/i.test(seen.pitch),
      `the note says trade pricing is off and the pitch offers it: "${seen.pitch}"`,
    );
  } finally {
    await context.close();
  }
});

test('a redraft peek is not given the dynasty note, and keeps the full pitch', async () => {
  const { page, context } = await visit('/', { width: 375, height: 812 });
  try {
    await peek(page);
    const seen = await page.evaluate(() => ({
      notes: document.querySelectorAll('.dynasty-scope').length,
      pitch: document.querySelector('.league-peek__pitch').textContent,
    }));
    assert.equal(seen.notes, 0, 'a redraft league was given the dynasty note');
    assert.match(seen.pitch, /trade finder/i, 'the redraft pitch lost the trade finder');
  } finally {
    await context.close();
  }
});

test('a priced visitor can send the card as well as make an account', async () => {
  /* Two things to do with a number you were just shown, and they are not
     rivals: the account is the conversion, the card is the loop. The card is
     the SAME generator the Hub uses, so the advert for the product looks like
     the product. */
  const { page, context } = await landing();
  try {
    await priceIt(page);
    await page.locator('ol li').first().waitFor({ timeout: 20_000 });

    const actions = await page.evaluate(() => {
      const account = document.querySelector('main a[href*="signin"]');
      const share = [...document.querySelectorAll('main button')].find((b) =>
        /share my card/i.test(b.textContent),
      );
      const box = (el) => (el ? el.getBoundingClientRect() : null);
      const a = box(account);
      const s = box(share);
      return {
        account: account?.textContent.trim(),
        share: share?.textContent.trim(),
        /* Weight says which one is the point, rather than hiding the other. */
        accountFilled: account ? getComputedStyle(account).backgroundColor : null,
        shareFilled: share ? getComputedStyle(share).backgroundColor : null,
        accountWider: a && s ? a.width >= s.width : false,
      };
    });

    assert.equal(actions.account, 'Create a free account');
    assert.equal(actions.share, 'Share my card');
    assert.notEqual(
      actions.accountFilled,
      actions.shareFilled,
      'the two actions are dressed identically, so neither reads as the point',
    );
    assert.ok(actions.accountWider, 'the secondary action is wider than the primary one');

    /* And it draws. A share button that opens an empty preview is worse than
       no share button. */
    await page.getByText('Share my card').click();
    await page.locator('img[src^="data:image/png"]').waitFor({ timeout: 20_000 });
  } finally {
    await context.close();
  }
});

test('the card tells whoever it is forwarded to that it is free', async () => {
  /* The plug bar is the only reason a card that gets forwarded twice brings
     anybody back, and "free" is the objection it has to answer in the half
     second it is looked at. */
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/utils/shareCard.ts', import.meta.url), 'utf8'),
  );
  assert.match(source, /FREE AT ODDSGODS\.NET/, 'the plug bar stopped saying it is free');
});

test('a shared card shows the real lineup, not the pre-draft message', async () => {
  /* The card's empty-starters state says "your lineup lands here once you
     draft", which is right for a league that has not, and a lie under the team
     name of somebody who drafted in August. The peek reads starters off the
     bootstrap it already fetches, so the card it sends is the Hub's card with
     the same faces on it. */
  const { page, context } = await landing();
  try {
    await priceIt(page);
    await page.locator('ol li').first().waitFor({ timeout: 20_000 });
    await page.getByText('Share my card').click();
    await page.locator('img[src^="data:image/png"]').waitFor({ timeout: 20_000 });

    /* Read the drawn pixels rather than the DOM: the card is a canvas, so the
       only way to know what it says is to look at it. */
    const drawn = await page.evaluate(async () => {
      const img = document.querySelector('img[src^="data:image/png"]');
      const bitmap = await createImageBitmap(
        await (await fetch(img.src)).blob(),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      /* Rows with ink, so an empty band in the middle is measurable. */
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const painted = [];
      for (let y = 0; y < canvas.height; y += 1) {
        let hits = 0;
        for (let x = 0; x < canvas.width; x += 6) {
          const i = (y * canvas.width + x) * 4;
          if (data[i] > 70 || data[i + 1] > 70 || data[i + 2] > 70) hits += 1;
        }
        painted.push(hits);
      }
      return { height: canvas.height, painted };
    });

    /* No roster-sized hole. The same ceiling the card's own layout test uses. */
    const body = drawn.painted.slice(160, drawn.height - 108);
    let run = 0;
    let worst = 0;
    for (const hits of body) {
      run = hits === 0 ? run + 1 : 0;
      if (run > worst) worst = run;
    }
    assert.ok(worst <= 120, `the shared card has a ${worst}px empty band in it`);
  } finally {
    await context.close();
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   THE HUB, FOR A PHONE THAT BELONGS TO SOMEBODY

   The gate turns an anonymous phone away and that is still right. It was wrong
   for a phone with an account: the funnel ended in a wall, where making an
   account got you the pitch again.

   What matters here is as much what is ABSENT as what is present. This is the
   short version on purpose, and the list of things left out is a product
   decision rather than an unfinished screen.
   ────────────────────────────────────────────────────────────────────────── */

test('the phone Hub answers the three questions and leaves the rest on the laptop', async () => {
  const { page, context } = await visit('/design/mobile-hub', { width: 375, height: 812 });
  try {
    await page.locator('.mobile-hub__table').waitFor({ timeout: 20_000 });

    const hub = await page.evaluate(() => {
      const root = document.querySelector('.mobile-hub');
      return {
        text: root.textContent,
        /* This week, priced, both sides. */
        prices: [...root.querySelectorAll('.mobile-hub__side-price')].map((s) =>
          s.textContent.trim(),
        ),
        /* The season, in one number and the three that qualify it. */
        title: root.querySelector('.mobile-hub__title-price')?.textContent.trim(),
        stats: [...root.querySelectorAll('.mobile-hub__stats dd')].map((d) =>
          d.textContent.trim(),
        ),
        /* And where everybody sits, unlocked: this is their league now. */
        rows: root.querySelectorAll('.mobile-hub__row').length,
        locks: root.querySelectorAll('svg path[d^="M7 10V7"]').length,
        /* No shell. The whole premise is that there is one tab. */
        tabBar: document.querySelectorAll('.bottom-tab-bar').length,
        header: document.querySelectorAll('.app-header').length,
      };
    });

    assert.equal(hub.prices.length, 2, 'the week is not priced on both sides');
    const [yours, theirs] = hub.prices;
    assert.notEqual(
      Math.sign(Number(yours)),
      Math.sign(Number(theirs)),
      `both sides priced ${yours} / ${theirs}`,
    );
    assert.match(hub.title, /^[+-]?\d|^—$/, `the title price reads "${hub.title}"`);
    assert.equal(hub.stats.length, 3, 'the three qualifying numbers are not all there');
    assert.ok(hub.rows >= 2, `only ${hub.rows} teams on the board`);
    assert.equal(hub.locks, 0, 'a signed-in phone is still being shown locks');
    assert.equal(hub.tabBar, 0, 'the phone Hub grew a tab bar');
    assert.equal(hub.header, 0, 'the phone Hub grew the desktop header');

    /* Said once, and at the bottom: above the fold it reads as an apology for
       the screen you are on. */
    assert.match(hub.text, /open on a laptop/i, 'nothing says where the rest is');
  } finally {
    await context.close();
  }
});

test('the phone Hub leaves out every widget that needs a desktop', async () => {
  /* Each of these is on the desktop Hub and each was excluded for its own
     reason: a trade is a decision made with two rosters open, a start/sit
     needs the lineup beside it, a thirty-point sparkline in a 340px column is
     a smudge, and eighteen rows of two-column comparison is the most
     desktop-shaped thing in the product. */
  const { page, context } = await visit('/design/mobile-hub', { width: 375, height: 812 });
  try {
    await page.locator('.mobile-hub__table').waitFor({ timeout: 20_000 });

    const found = await page.evaluate(() => {
      const text = document.querySelector('.mobile-hub').textContent;
      return {
        trades: /trades to try|suggested trades|find trades/i.test(text),
        startSit: /\bsit\b.*\bstart\b|start\/sit/i.test(text),
        lineMovement: /line movement/i.test(text),
        lineupVsLineup: /lineup vs lineup/i.test(text),
      };
    });

    assert.ok(!found.trades, 'the trade widget is on the phone Hub');
    assert.ok(!found.startSit, 'the start/sit widget is on the phone Hub');
    assert.ok(!found.lineMovement, 'the line movement chart is on the phone Hub');
    assert.ok(!found.lineupVsLineup, 'lineup vs lineup is on the phone Hub');
  } finally {
    await context.close();
  }
});

test('the phone Hub fits a phone', async () => {
  const { page, context } = await visit('/design/mobile-hub', { width: 375, height: 812 });
  try {
    await page.locator('.mobile-hub__table').waitFor({ timeout: 20_000 });
    const overflow = await page.evaluate(() => ({
      docWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      /* Nothing clipped mid-word, which is what a fixed-width table does to a
         long team name. */
      clipped: [...document.querySelectorAll('.mobile-hub__row-name')].filter(
        (el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis',
      ).length,
    }));
    assert.ok(
      overflow.docWidth <= overflow.viewport + 1,
      `the phone Hub scrolls sideways: ${overflow.docWidth}px in ${overflow.viewport}px`,
    );
    assert.equal(overflow.clipped, 0, 'a team name is cut off with no ellipsis');
  } finally {
    await context.close();
  }
});
