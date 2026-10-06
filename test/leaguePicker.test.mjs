import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * Choosing which Sleeper leagues appear, and pinning them.
 *
 * Rendered against the fixture in ?sleeper mode, where the league is a
 * Sleeper connection under the reserved handle and Sleeper answers with three
 * leagues: the open one, and two the account does not have. Without that mode
 * the fixture is an ESPN league and none of this surface is drawn at all.
 */

const cwd = process.cwd();
const port = 4231;
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
    vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd,
      env: process.env,
      stdio: 'ignore',
    });
    ownsVite = true;
  }
  await waitForUrl(`${baseUrl}/design/mobile-hub`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

const leagueNames = (page) => page.locator('.mobile-hub__league-item .mobile-hub__league-option:not(.mobile-hub__league-option--manage)').allTextContents();

test('the phone can tick a league on, and pin it to the top', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/mobile-hub?sleeper`, { waitUntil: 'domcontentloaded' });

    /* One league on the account, and the name is still a menu: it has
       somewhere to go now, which is the sheet. */
    const name = page.locator('.mobile-hub__league--switch');
    await name.waitFor({ state: 'visible' });
    await name.click();
    assert.deepEqual(await leagueNames(page), ['Odds Gods Design Replay']);

    await page.locator('.mobile-hub__league-option--manage').click();
    const sheet = page.locator('.league-picker');
    await sheet.waitFor({ state: 'visible' });

    /* Everything Sleeper lists, with only the league already here ticked. */
    const rows = sheet.locator('.league-checklist__row');
    await rows.first().waitFor({ state: 'visible' });
    assert.deepEqual(
      await sheet.locator('.league-checklist__name').allTextContents(),
      ['Odds Gods Design Replay', 'Tartarus Dynasty', 'Elysium Best Ball'],
    );
    assert.deepEqual(
      await rows.evaluateAll((els) => els.map((el) => el.getAttribute('aria-checked'))),
      ['true', 'false', 'false'],
    );
    const save = sheet.locator('.league-picker__save');
    assert.equal(await save.innerText(), 'No changes');
    assert.equal(await save.isDisabled(), true);

    /* Unticking the open league says what that will do, before it is done. */
    await rows.nth(0).click();
    assert.equal(await save.innerText(), 'Remove 1 league');
    assert.match(await sheet.locator('.league-picker__note').innerText(), /is open now/);
    await rows.nth(0).click();

    await rows.nth(1).click();
    assert.equal(await save.innerText(), 'Add 1 league');
    await save.click();
    await sheet.waitFor({ state: 'detached' });

    /* Added, and the league that was open is still the one open. */
    await name.click();
    assert.deepEqual(await leagueNames(page), ['Odds Gods Design Replay', 'Tartarus Dynasty']);
    assert.equal(
      await page.locator('.mobile-hub__league-option--open').innerText(),
      'Odds Gods Design Replay',
    );

    /* Pinning moves it to the top and marks the pin. */
    await page.getByRole('button', { name: 'Pin Tartarus Dynasty to the top' }).click();
    assert.deepEqual(await leagueNames(page), ['Tartarus Dynasty', 'Odds Gods Design Replay']);
    const unpin = page.getByRole('button', { name: 'Unpin Tartarus Dynasty' });
    assert.equal(await unpin.getAttribute('aria-pressed'), 'true');
    await unpin.click();
    assert.deepEqual(await leagueNames(page), ['Odds Gods Design Replay', 'Tartarus Dynasty']);
  } finally {
    await page.close();
  }
});

test('the wizard asks which leagues, with a tick you can see', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/connect?multiLeague`, { waitUntil: 'domcontentloaded' });
    await page.locator('.connect-wizard__platform-card, .connect-page button').first().waitFor({ state: 'visible' });
    await page.locator('main button').first().click();
    await page.locator('.connect-wizard__input').fill('designgods');
    await page.locator('.connect-wizard__connect').click();

    const rows = page.locator('.league-checklist__row');
    await rows.first().waitFor({ state: 'visible' });
    assert.equal(await rows.count(), 2);

    /* Nothing is ticked for you, and nothing comes in until something is. */
    const go = page.locator('.connect-wizard__continue');
    assert.equal(await go.isDisabled(), true);
    assert.equal(await go.innerText(), 'Pick at least one league');

    /* The tick box is a drawn box. This step had no CSS at all: the rows
       were bare buttons and the tick was a character nobody could see. */
    const box = await page.locator('.league-checklist__tick').first().evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: el.getBoundingClientRect().width, border: style.borderTopWidth };
    });
    assert.equal(Math.round(box.width), 22);
    assert.notEqual(box.border, '0px');
    assert.notEqual(
      await go.evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgba(0, 0, 0, 0)',
      'the continue button has no fill',
    );
  } finally {
    await page.close();
  }
});
