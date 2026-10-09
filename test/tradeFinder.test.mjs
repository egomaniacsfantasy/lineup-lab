import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The trade finder: a ticket, and a board served from the background scan.
 *
 * Rendered against the fixture league. Its board answers with five deals as
 * a scan that already ran (four help you; three cost the other side title
 * odds, one lifts both), its live search answers per manager, and two flags
 * make the waiting states reachable: ?boardScanning (a first look whose scan
 * is still running) and ?slowFinder (a live walk that takes a moment).
 */

const cwd = process.cwd();
const port = 4227;
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
  await waitForUrl(`${baseUrl}/design/market`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite && ownsVite) vite.kill('SIGTERM');
});

async function openMarket(viewport, search = '') {
  const page = await browser.newPage({ viewport, colorScheme: 'dark' });
  await page.goto(`${baseUrl}/design/market${search}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.trade-finder__ticket').waitFor({ state: 'visible' });
  return page;
}

const DESKTOP = { width: 1280, height: 1000 };

test('the board is there on arrival, from a scan that already ran, with the ticket beside the builder', async () => {
  const page = await openMarket(DESKTOP);
  try {
    assert.deepEqual(await page.locator('.trade-cc__view').allTextContents(), ['Trade finder', 'Build trades']);
    assert.deepEqual(
      await page.locator('.trade-finder__leg-label').allTextContents(),
      ['Partner', 'You send', 'Off limits', 'You get'],
    );
    /* No shape row. Each side's count sits on its own leg. */
    assert.equal(await page.locator('.trade-finder__count').count(), 2);
    assert.deepEqual(await page.locator('.trade-finder__count').first().locator('button').allTextContents(), ['any', '1', '2', '3']);

    /* No search ran. The board came from the last scan, and says when. */
    const board = page.locator('.trade-finder__board');
    await board.waitFor({ state: 'visible' });
    assert.match(await page.locator('.trade-finder__board-title').innerText(), /deals that help you/i);
    assert.match(await page.locator('.trade-finder__board-head').innerText(), /Updated \d{1,2}:\d{2}/);
    assert.equal(await page.locator('.trade-finder__find').innerText(), 'Show deals');

    /* Out of the box: no limit on what the other side gives up, every deal
       that helps you. Four of the five fixture deals do; the fifth lowers your
       odds and is never shown. */
    assert.equal(await page.locator('.trade-finder__lane').count(), 4);
    assert.match(await page.locator('.trade-finder__lane').first().innerText(), /Puka Nacua/);
    assert.doesNotMatch(await board.innerText(), /outside your limits/);

    /* The builder is still the other tab. */
    await page.locator('.trade-cc__view').nth(1).click();
    assert.equal(await page.locator('.trade-cc__builder').evaluate((el) => el.checkVisibility()), true);
    assert.equal(await page.locator('.trade-cc__finder').evaluate((el) => el.checkVisibility()), false);
  } finally {
    await page.close();
  }
});

test('a first look waits on the scan as a screen, then hands over to the board', async () => {
  const page = await openMarket(DESKTOP, '?boardScanning');
  try {
    const scan = page.locator('.trade-finder__scan');
    await scan.waitFor({ state: 'visible' });
    assert.match(await scan.innerText(), /scanning every manager for the first time/i);
    /* Every manager is on the screen, not a spinner. */
    assert.equal(await page.locator('.trade-finder__scan-team').count(), 5);
    assert.equal(await page.locator('.trade-finder__lane').count(), 0);

    /* The fixture's third poll answers as a finished scan. */
    await page.locator('.trade-finder__board').waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(await page.locator('.trade-finder__scan').count(), 0);
    assert.equal(await page.locator('.trade-finder__lane').count(), 4);
  } finally {
    await page.close();
  }
});

test('limits sit in the ticket as words, open to steppers, and stay with the ticket between asks', async () => {
  const page = await openMarket(DESKTOP);
  try {
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    /* Nothing behind a button any more: no Limits control on the results, no
       sliders anywhere, and the line under the legs says both numbers. */
    assert.equal(await page.locator('.trade-finder__ghost', { hasText: 'Limits' }).count(), 0);
    assert.equal(await page.locator('input[type=range]').count(), 0);
    /* The words wrap as inline chips, so innerText carries line breaks. */
    const lineWords = async () => (await page.locator('.trade-finder__limits-line').innerText()).replace(/\s+/g, ' ');
    assert.match(await lineWords(), /Your title up 0\.0 pp or more/);
    assert.match(await lineWords(), /theirs down no limit/);
    assert.equal(await page.locator('.trade-finder__limits-panel').count(), 0, 'the steppers are closed until asked for');

    /* Change opens them in place. Their side steps down from no limit through
       5, 3, 2, 1, 0.5 to nothing, and the board refilters as it goes. */
    await page.locator('.trade-finder__limits-change').click();
    const theirs = page.locator('.trade-finder__stepper', { has: page.locator('#trade-finder-max-loss-value') });
    const down = theirs.locator('button[aria-label="Let them lose less"]');
    assert.equal(await theirs.locator('output').innerText(), 'no limit');
    await down.click();
    assert.equal(await theirs.locator('output').innerText(), '5.0 pp');
    for (let i = 0; i < 5; i += 1) await down.click();
    assert.equal(await theirs.locator('output').innerText(), '0.0 pp');
    assert.equal(await down.isDisabled(), true, 'the strict end is the end');
    assert.equal(await page.locator('.trade-finder__lane').count(), 1, 'only the deal that lifts both sides');
    assert.match(await page.locator('.trade-finder__board').innerText(), /3 outside your limits/);
    /* The line marks the number that moved. */
    assert.equal(await page.locator('.trade-finder__limits-num--set').innerText(), '0.0 pp');
    await page.locator('.trade-finder__limits-change').click();
    assert.equal(await page.locator('.trade-finder__limits-panel').count(), 0);

    /* A new ask keeps them: the limits are part of the ticket. Two going out
       leaves the one 2 for 2 deal, which lifts both sides, so nothing is
       outside the (kept) limit. */
    await page.locator('.trade-finder__leg', { hasText: 'You send' }).locator('.trade-finder__count-btn', { hasText: '2' }).click();
    assert.match(await page.locator('.trade-finder__readback').innerText(), /2 going out/);
    await page.locator('.trade-finder__find').click();
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.trade-finder__lane').count(), 1);
    assert.doesNotMatch(await page.locator('.trade-finder__board').innerText(), /outside your limits/);
    assert.match(await lineWords(), /theirs down 0\.0 pp at most/);
  } finally {
    await page.close();
  }
});

test('a count on each leg picks the shapes, and a count the engine cannot price is off', async () => {
  const page = await openMarket(DESKTOP);
  try {
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    const send = page.locator('.trade-finder__leg', { hasText: 'You send' }).locator('.trade-finder__count');
    const get = page.locator('.trade-finder__leg', { hasText: 'You get' }).locator('.trade-finder__count');
    const press = (control, text) => control.locator('.trade-finder__count-btn', { hasText: new RegExp(`^${text}$`) });

    /* 1 for 1: the three one-player swaps on the board. */
    await press(send, '1').click();
    await press(get, '1').click();
    assert.match(await page.locator('.trade-finder__readback').innerText(), /1 for 1/);
    await page.locator('.trade-finder__find').click();
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.trade-finder__lane').count(), 3);

    /* With one coming back, three going out is off: the engine prices no 3 for 1. */
    assert.equal(await press(send, '3').isDisabled(), true);
    assert.equal(await press(send, '2').isDisabled(), false);
    /* Open the get side again and 3 going out comes back. */
    await press(get, 'any').click();
    assert.equal(await press(send, '3').isDisabled(), false);
    assert.match(await page.locator('.trade-finder__readback').innerText(), /1 going out/);
  } finally {
    await page.close();
  }
});

test('a lane opens in place with both faces, the lineup cost, and Build', async () => {
  const page = await openMarket(DESKTOP);
  try {
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    const lane = page.locator('.trade-finder__lane').first();
    /* Five columns, every lane: get, swap, send, price. Two players a side,
       each with his own row and name. */
    assert.equal(await lane.locator('.trade-finder__side--get .trade-finder__player').count(), 2);
    assert.equal(await lane.locator('.trade-finder__side--send .trade-finder__player').count(), 2);
    const laneFaces = await lane.locator('.trade-finder__lane-main .trade-finder__face').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    assert.equal(new Set(laneFaces).size, 1, `lane faces ${laneFaces.join(', ')}`);
    assert.match(await lane.locator('.trade-finder__swap-col').innerText(), /2 for 2/i);
    /* No action buttons on a closed lane. */
    assert.equal(await lane.locator('.trade-finder__act').count(), 0);

    await lane.locator('.trade-finder__lane-main').click();
    const open = lane.locator('.trade-finder__open');
    await open.waitFor({ state: 'visible' });
    assert.match(await open.locator('.trade-finder__open-name').first().innerText(), /puka nacua/i);
    assert.match(await open.innerText(), /you send/i);
    assert.doesNotMatch(await open.innerText(), /will he take it/i, 'no acceptance estimate');
    /* No hierarchy inside a package: every player on a side is the same
       row at the same size, nobody a headline and nobody a bullet under him.
       This 2 for 2 has two players a side, so four equal blocks. */
    assert.equal(await open.locator('.trade-finder__open-player').count(), 4);
    const widths = await open.locator('.trade-finder__open-player .trade-finder__face').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    assert.equal(new Set(widths).size, 1, `faces ${widths.join(', ')}`);
    assert.ok(widths[0] >= 60, `faces ${widths[0]}`);
    assert.equal(await open.locator('.trade-finder__open-name').count(), 4);
    assert.equal(await lane.locator('.trade-finder__who-extra').count(), 0);

    await open.locator('.trade-finder__act--primary').click();
    await page.locator('.trade-cc__builder').waitFor({ state: 'visible' });
    const selected = await page.locator('.trade-cc__asset-name').allTextContents();
    assert.deepEqual(selected.sort(), ['Brock Bowers', 'Derrick Henry', 'Puka Nacua', 'Trey McBride']);
  } finally {
    await page.close();
  }
});

test('a leg closes on the pick, shows it as a chip, and adds more through its plus', async () => {
  const page = await openMarket(DESKTOP);
  try {
    const partnerLeg = page.locator('.trade-finder__leg').nth(0);
    await partnerLeg.locator('.trade-finder__leg-open').click();
    const sheet = page.locator('.trade-finder__sheet');
    await sheet.waitFor({ state: 'visible' });
    /* One pick, and the sheet is gone. No Done button to find. */
    assert.equal(await sheet.locator('.trade-finder__sheet-done').count(), 0);
    await sheet.locator('.trade-finder__item').first().click();
    await sheet.waitFor({ state: 'detached' });
    assert.equal(await partnerLeg.locator('.trade-finder__chip--leg').count(), 1);

    /* The plus opens it again for more, and that one stays open. */
    await partnerLeg.locator('.trade-finder__leg-add').click();
    await sheet.waitFor({ state: 'visible' });
    await sheet.locator('.trade-finder__item').nth(1).click();
    assert.equal(await sheet.count(), 1);
    await sheet.locator('.trade-finder__sheet-done').click();
    assert.equal(await partnerLeg.locator('.trade-finder__chip--leg').count(), 2);

    /* The chip's own cross removes it. */
    await partnerLeg.locator('.trade-finder__chip-x').first().click();
    assert.equal(await partnerLeg.locator('.trade-finder__chip--leg').count(), 1);
  } finally {
    await page.close();
  }
});

test('a named player walks the league live, as a screen, and deals land together', async () => {
  const page = await openMarket(DESKTOP, '?slowFinder');
  try {
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    /* Pin a player you want: the search is live and narrows to his owner. */
    await page.locator('.trade-finder__leg').nth(3).locator('.trade-finder__leg-open').click();
    const sheet = page.locator('.trade-finder__sheet');
    await sheet.locator('.trade-finder__seg-btn', { hasText: 'A player' }).click();
    await sheet.locator('.trade-finder__search input').fill('London');
    await sheet.locator('.trade-finder__item', { hasText: 'Drake London' }).first().click();
    await sheet.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.trade-finder__find').innerText(), 'Find trades');
    await page.locator('.trade-finder__find').click();

    const scan = page.locator('.trade-finder__scan');
    await scan.waitFor({ state: 'visible' });
    /* The fixture puts London on four rosters, so four managers can deliver
       him; the walk takes them two at a time. */
    assert.match(await scan.innerText(), /Searching 4 managers/i);
    assert.equal(await page.locator('.trade-finder__scan-team').count(), 4);
    const now = await page.locator('.trade-finder__scan-team--now').count();
    assert.ok(now >= 1 && now <= 2, `${now} in flight`);
    /* Nothing lands while it runs. */
    assert.equal(await page.locator('.trade-finder__lane').count(), 0);

    await page.locator('.trade-finder__board').waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await page.locator('.trade-finder__board-title').innerText(), /to get drake london/i);
    assert.match(await page.locator('.trade-finder__board-head').innerText(), /Searched 4 managers just now/);
    /* The fixture's London deal costs Hermes 1.2 points of title odds, inside
       the default 2 point limit, so it is on the board. */
    assert.match(await page.locator('.trade-finder__board').innerText(), /Drake London[\s\S]*Terry McLaurin/);
    assert.doesNotMatch(await page.locator('.trade-finder__board').innerText(), /outside your limits/);
  } finally {
    await page.close();
  }
});

test('a picked player only has to be IN the deal, and an off-limits player is never sent', async () => {
  const page = await openMarket(DESKTOP);
  try {
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    /* Off limits: McBride. Every board deal that sends him disappears. */
    await page.locator('.trade-finder__leg').nth(2).locator('.trade-finder__leg-open').click();
    let sheet = page.locator('.trade-finder__sheet');
    assert.equal(await sheet.locator('.trade-finder__seg-btn').count(), 0, 'off limits is players only');
    await sheet.locator('.trade-finder__search input').fill('McBride');
    await sheet.locator('.trade-finder__item', { hasText: 'Trey McBride' }).first().click();
    await sheet.waitFor({ state: 'detached' });
    await page.locator('.trade-finder__find').click();
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    assert.doesNotMatch(await page.locator('.trade-finder__board').innerText(), /Trey McBride/);
    assert.match(await page.locator('.trade-finder__board').innerText(), /Drake London/);

    /* Take McBride off the list, then pick him to SEND. */
    await page.locator('.trade-finder__chip-x[aria-label="Remove Trey McBride"]').click();
    await page.locator('.trade-finder__leg').nth(1).locator('.trade-finder__leg-open').click();
    sheet = page.locator('.trade-finder__sheet');
    await sheet.locator('.trade-finder__seg-btn', { hasText: 'A player' }).click();
    await sheet.locator('.trade-finder__search input').fill('McBride');
    await sheet.locator('.trade-finder__item', { hasText: 'Trey McBride' }).first().click();
    await sheet.waitFor({ state: 'detached' });
    await page.locator('.trade-finder__find').click();
    await page.locator('.trade-finder__board').waitFor({ state: 'visible', timeout: 15_000 });
    /* Both McBride deals: the 1 for 1 AND the 2 for 2 where Derrick Henry goes
       too. A picked player is in the deal, not the whole deal. */
    const lanes = await page.locator('.trade-finder__lane').allInnerTexts();
    assert.ok(lanes.length >= 2, `${lanes.length} lanes`);
    assert.ok(lanes.every((text) => /Trey McBride/.test(text)), 'every deal includes McBride');
    assert.ok(lanes.some((text) => /Derrick Henry/.test(text)), 'other players of yours can go with him');
  } finally {
    await page.close();
  }
});

test('one leg holds positions AND a player at once; picking the player keeps the positions', async () => {
  const page = await openMarket(DESKTOP);
  try {
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    const sendLeg = page.locator('.trade-finder__leg').nth(1);
    await sendLeg.locator('.trade-finder__leg-open').click();
    let sheet = page.locator('.trade-finder__sheet');
    await sheet.locator('.trade-finder__tile', { has: page.locator('.trade-finder__tile-glyph', { hasText: /^TE$/ }) }).click();
    await sheet.waitFor({ state: 'detached' });
    await sendLeg.locator('.trade-finder__leg-add').click();
    sheet = page.locator('.trade-finder__sheet');
    await sheet.locator('.trade-finder__tile', { has: page.locator('.trade-finder__tile-glyph', { hasText: /^RB$/ }) }).click();
    await sheet.locator('.trade-finder__seg-btn', { hasText: 'A player' }).click();
    await sheet.locator('.trade-finder__search input').fill('McBride');
    await sheet.locator('.trade-finder__item', { hasText: 'Trey McBride' }).first().click();
    await sheet.locator('.trade-finder__sheet-done').click();
    const chips = await sendLeg.locator('.trade-finder__chip-text').allInnerTexts();
    assert.deepEqual(chips, ['Your RBs', 'Your TEs', 'Trey McBride']);
    /* The fixture's McBride + Henry (RB) deal fits; nothing else of yours rides along. */
    await page.locator('.trade-finder__find').click();
    await page.locator('.trade-finder__board').waitFor({ state: 'visible', timeout: 15_000 });
    const lanes = await page.locator('.trade-finder__lane').allInnerTexts();
    assert.ok(lanes.length >= 1 && lanes.every((text) => /Trey McBride/.test(text)));
  } finally {
    await page.close();
  }
});

test('the player list values a player by the rest of his season, and says so', async () => {
  const page = await openMarket(DESKTOP);
  try {
    await page.locator('.trade-finder__leg').nth(3).locator('.trade-finder__leg-open').click();
    const sheet = page.locator('.trade-finder__sheet');
    await sheet.waitFor({ state: 'visible' });
    await sheet.locator('.trade-finder__seg-btn', { hasText: 'A player' }).click();
    const rows = sheet.locator('.trade-finder__item');
    await rows.first().waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => /rest of season/i.test(document.querySelector('.trade-finder__list-caption')?.textContent ?? ''),
    );
    /* Every other week projects 80% of week 8 on the fixture, so a player is
       worth 0.82 of his week 8 number per game; the top is 32.5, not 39.6. */
    const values = (await sheet.locator('.trade-finder__item-mean').allTextContents()).map(Number);
    assert.equal(values[0], 32.5);
    assert.deepEqual(values, [...values].sort((a, b) => b - a));
    const ranks = await sheet.locator('.trade-finder__item .trade-finder__rank').allTextContents();
    assert.equal(ranks.length, values.length);
    assert.equal(ranks[0], 'WR1');
  } finally {
    await page.close();
  }
});

test('a manager who does not answer is retried, then skipped and named; the walk carries on', async () => {
  const page = await openMarket(DESKTOP);
  try {
    await page.locator('.trade-finder__board').waitFor({ state: 'visible' });
    /* Pin one of YOUR players: every manager is walked for what he brings back. */
    await page.locator('.trade-finder__leg').nth(1).locator('.trade-finder__leg-open').click();
    const sheet = page.locator('.trade-finder__sheet');
    await sheet.locator('.trade-finder__seg-btn', { hasText: 'A player' }).click();
    /* McLaurin: the player Hermes's fixture deal includes (a pick must be in the deal). */
    await sheet.locator('.trade-finder__search input').fill('McLaurin');
    await sheet.locator('.trade-finder__item', { hasText: 'Terry McLaurin' }).first().click();
    await sheet.waitFor({ state: 'detached' });

    /* Hermes (2) fails once, as the server does while it restarts; Apollo (3)
       fails every time. */
    await page.evaluate(() => {
      const hooks = window;
      hooks.__finderFailOnce = 2;
      hooks.__finderFailAlways = 3;
    });
    await page.locator('.trade-finder__find').click();
    await page.locator('.trade-finder__board').waitFor({ state: 'visible', timeout: 20_000 });
    const head = await page.locator('.trade-finder__board-head').innerText();
    assert.match(head, /Searched 5 managers just now/);
    assert.match(head, /1 did not answer/);
    /* Hermes answered on the retry, so his deals are on the board. */
    assert.match(await page.locator('.trade-finder__lanes').innerText(), /Hermes Express/);
  } finally {
    await page.close();
  }
});
