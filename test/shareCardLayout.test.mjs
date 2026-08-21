import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The hub card is drawn on a canvas, so nothing in the type system or the DOM
 * can tell you it came out wrong. These two defects both shipped past review
 * and were only caught by looking at the picture:
 *
 *  - the footer rows were positioned off the bottom of the chart, so on a
 *    league with title history they sat on top of the plot;
 *  - a league with no history yet (which is every league in week 1) drew
 *    nothing in the chart band, leaving a 250px hole above the footer.
 *
 * Both are the same shape of bug: vertical space that is not accounted for.
 * So this measures space rather than appearance.
 */

const cwd = process.cwd();
const port = 4177;
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

/* Vite serves the module from the page's registry, so a new page is not a new
   module graph. Without this, editing the card and rerunning the guard
   measures the previous build. */
let nonce = 0;
const nextNonce = () => `${process.pid}-${(nonce += 1)}`;

const BASE = { eyebrow: 'Week 8', you: 'Vlahakis', record: '5-2-0', titleOdds: '+1226',
  playoffs: '61%', finish: '7.4-6.6', seed: '5.2', standing: 'No. 3 of 12 in the league',
  week: 'Week 8: -116 to beat Rodgers That' };

/**
 * Draw the card and measure it row by row.
 *
 * Each row is compared against its own leftmost pixel rather than one global
 * background sample. The card paints a gradient wash behind its top third, so
 * a single sample taken from the corner makes every row look painted and the
 * whole measurement reads zero.
 */
async function rowProfile(page, payload) {
  return page.evaluate(async ({ data, nonce }) => {
    const mod = await import(`/src/utils/shareCard.ts?guard=${nonce}`);
    /* No art: the logo and the avatar are network-dependent and this is a
       measurement of layout, not of asset loading. */
    const canvas = await mod.drawShareCard(data, { withArt: false });
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const { data: px } = ctx.getImageData(0, 0, W, H);
    const at = (x, y) => {
      const i = (y * W + x) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    };
    const differs = (a, b) =>
      Math.abs(a[0] - b[0]) > 10 || Math.abs(a[1] - b[1]) > 10 || Math.abs(a[2] - b[2]) > 10;

    /* The gutter is never drawn into, so x=2 is this row's background. */
    const PAD = 88;
    const painted = [];
    for (let y = 0; y < H; y += 1) {
      const reference = at(2, y);
      let hits = 0;
      for (let x = PAD; x < W - PAD; x += 2) {
        if (differs(at(x, y), reference)) hits += 1;
      }
      painted.push(hits);
    }

    /* Full-bleed means the paint reaches the edges, so look at the edges. The
       plain page background is sampled from the gutter just above the bar. */
    const plain = at(2, H - 120);
    const barEdges = [];
    for (let y = H - 90; y < H - 10; y += 1) {
      barEdges.push(differs(at(0, y), plain) && differs(at(W - 1, y), plain));
    }
    return { width: W, height: H, painted, barEdges };
  }, { data: payload, nonce: nextNonce() });
}

let vite = null;
let browser = null;
let ownsVite = false;

test.before(async () => {
  if (!(await isPortOpen(port))) {
    vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd, env: process.env, stdio: 'ignore',
    });
    ownsVite = true;
  }
  await waitForUrl(baseUrl);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

async function withPage(run) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 }, colorScheme: 'dark' });
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    return await run(page);
  } finally {
    await page.close();
  }
}

test('the hub card is portrait, because the season needs the room', async () => {
  await withPage(async (page) => {
    const { width, height } = await rowProfile(page, { ...BASE, titleSeries: [6.1, 7.0, 8.1] });
    assert.equal(width, 1080);
    assert.ok(height > width, `expected a portrait card, got ${width}x${height}`);
  });
});

test('the plug bar reaches both edges of every card', async () => {
  await withPage(async (page) => {
    for (const series of [null, [6.1, 6.4, 5.9, 7.2, 7.0, 7.5, 8.1]]) {
      const { barEdges } = await rowProfile(page, { ...BASE, titleSeries: series });
      /* If the bar ever becomes an inset pill, the address stops surviving a
         crop, which is the one thing on the card that has to. */
      assert.ok(
        barEdges.length > 0 && barEdges.every(Boolean),
        `plug bar does not reach both edges (series=${series ? 'yes' : 'no'}): ${barEdges.filter(Boolean).length}/${barEdges.length} rows`,
      );
    }
  });
});

test('no card leaves a chart-sized hole above the plug', async () => {
  await withPage(async (page) => {
    for (const series of [null, [6.1, 6.4, 5.9, 7.2, 7.0, 7.5, 8.1]]) {
      const { height, painted } = await rowProfile(page, { ...BASE, titleSeries: series });
      /* Measure the body only: above the plug bar, below the lockup. */
      const body = painted.slice(160, height - 108);
      let run = 0;
      let worst = 0;
      body.forEach((hits) => {
        run = hits === 0 ? run + 1 : 0;
        if (run > worst) worst = run;
      });
      /* The layout's own widest deliberate gap measures 103px (the air under
         the hero on a card with no history). A chart band is 200px, so the
         week-1 hole cannot hide under this ceiling. */
      assert.ok(
        worst <= 120,
        `card with ${series ? 'history' : 'no history'} has a ${worst}px empty band; the layout is not filling its own height`,
      );
    }
  });
});
