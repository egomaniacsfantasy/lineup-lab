import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * The Predictor, late in a week and looking ahead.
 *
 * Three things a matchup card has to get right, each of which was wrong or
 * missing: a game that is already settled is shown and never asked for; the
 * number beside a team says it is a projection; and a week where a team is
 * missing starters names them.
 *
 * Rendered against the design league, which answers ?decided with one of
 * this week's three games priced 100.0 against 0.0.
 */

/* Its own Vite on its own port. Adopting another file's server inherits that
   file's lifetime. The design scenes need no API server. */
const PORT = 4195;
const baseUrl = `http://127.0.0.1:${PORT}`;

async function waitForUrl(url, timeoutMs = 60_000) {
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

test.before(async () => {
  vite = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: process.cwd(), stdio: 'ignore' },
  );
  await waitForUrl(`${baseUrl}/design/league`);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (vite) vite.kill('SIGTERM');
});

async function open(query) {
  /* A new page is a new browser context, so no saved picks carry over. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/design/league?view=predictor${query}`);
  /* A selector, not network idle: the projections arrive after first paint
     and the label is what several of these read. */
  await page.waitForSelector('.predictor__side-prob');
  return page;
}

const weekCount = (page) => page.locator('.predictor__weekcount').innerText();

test('a decided game is shown, locked, and not counted as a call to make', async () => {
  const page = await open('&decided');
  try {
    await page.waitForSelector('.predictor__game--decided');
    const card = page.locator('.predictor__game--decided');
    assert.equal(await card.count(), 1, 'exactly one of the three games is settled');

    const sides = card.locator('button.predictor__side');
    assert.deepEqual(
      await sides.evaluateAll((nodes) => nodes.map((node) => node.disabled)),
      [true, true],
      'a settled game still offers a pick',
    );
    assert.match(await card.locator('.predictor__side--won').innerText(), /Apollo Archers/);
    assert.match(await card.locator('.predictor__side--beaten').innerText(), /Athena Owls/);
    assert.match(await card.innerText(), /already decided/i);

    /* Forced past the disabled state, the way a stray handler would be. */
    await sides.first().click({ force: true });
    await sides.last().click({ force: true });
    assert.equal(await page.locator('.predictor__side--picked').count(), 0);

    assert.match(await weekCount(page), /0 of 2 called/);
    assert.match(await weekCount(page), /1 decided/);

    /* Calling one open game: the season total leaves the settled game out,
       so three weeks of three is eight to call rather than nine. */
    await page.locator('.predictor__game:not(.predictor__game--decided) button.predictor__side').first().click();
    await page.waitForSelector('.predictor__side--picked');
    assert.match(await page.locator('.predictor__sub').innerText(), /1 of 8 games called/);
    assert.match(await weekCount(page), /1 of 2 called/);
  } finally {
    await page.close();
  }
});

test('with nothing settled every game is open', async () => {
  const page = await open('');
  try {
    assert.equal(await page.locator('.predictor__game--decided').count(), 0);
    assert.equal(await page.locator('button.predictor__side:disabled').count(), 0);
    assert.match(await weekCount(page), /0 of 3 called/);
    assert.doesNotMatch(await weekCount(page), /decided/);
  } finally {
    await page.close();
  }
});

test('every number on a matchup says it is a projection', async () => {
  const page = await open('');
  try {
    for (const week of ['w8', 'w9']) {
      await page.selectOption('#predictor-week', week);
      const figures = await page.locator('.predictor__side-prob').allInnerTexts();
      assert.equal(figures.length, 6, `${week}: a side has no figure`);
      for (const figure of figures) {
        assert.match(figure, /^proj\s+\d+\.\d$/i, `${week}: "${figure}" is a bare number`);
      }
    }
  } finally {
    await page.close();
  }
});

test('key players on bye sit under their own team, each with a face, all of them named', async () => {
  const page = await open('');
  try {
    /* This week nobody in the fixture is on bye, so no row at all. */
    assert.equal(await page.locator('.predictor__byes').count(), 0);

    await page.selectOption('#predictor-week', 'w9');
    const game = page.locator('.predictor__game', { hasText: "Zeus's Bolts" });
    const names = (column) => column.locator('.predictor__bye-name').allInnerTexts();
    assert.deepEqual(await names(game.locator('.predictor__bye').nth(0)), ['Justin Jefferson', 'CeeDee Lamb']);
    assert.deepEqual(await names(game.locator('.predictor__bye').nth(1)), ['Derrick Henry']);
    /* A face beside every name: a photo, or the initials it falls back to. */
    assert.equal(await game.locator('.predictor__bye-player .player-headshot').count(), 3);

    /* Under the right team, measured: each half of the row lies within the
       horizontal span of the side above it. */
    const spans = await game.evaluate((node) => {
      const box = (el) => {
        const rect = el.getBoundingClientRect();
        return [rect.left, rect.right];
      };
      return {
        sides: [...node.querySelectorAll('.predictor__side')].map(box),
        byes: [...node.querySelectorAll('.predictor__bye')].map(box),
      };
    });
    spans.byes.forEach(([left, right], index) => {
      const [sideLeft, sideRight] = spans.sides[index];
      assert.ok(left >= sideLeft - 1 && right <= sideRight + 1, `bye column ${index} strays from its team`);
    });
    /* A game with nobody missing carries no row. */
    assert.equal(
      await page.locator('.predictor__game', { hasText: 'Poseidon Waves' }).locator('.predictor__byes').count(),
      0,
    );

    /* Three missing is three names. It used to be two and "+1", which hid
       exactly the player you were about to look for. */
    await page.selectOption('#predictor-week', 'w10');
    assert.equal(await page.locator('.predictor__bye-name').count(), 3);
    assert.doesNotMatch(await page.locator('.predictor__byes').innerText(), /\+\d/);
  } finally {
    await page.close();
  }
});

test('a call saved for a week that has been played is not sent again', async () => {
  const page = await open('');
  try {
    await page.locator('button.predictor__side').first().click();
    await page.waitForSelector('.predictor__side--picked');
    assert.match(await page.locator('.predictor__sub').innerText(), /1 of 9 games called/);

    /* What a browser holds a week later: the call just made, plus one for a
       game in a week that is over, and one whose id matches a live game but
       in a week that is over (a provider that numbers games 1 to 6 weekly). */
    const key = await page.evaluate(() => {
      const found = Object.keys(window.localStorage).find((name) => name.startsWith('og.predictor.'));
      const saved = JSON.parse(window.localStorage.getItem(found));
      saved.push({ week: 7, matchupId: 701, winnerRosterId: '1' });
      saved.push({ week: 7, matchupId: 902, winnerRosterId: '2' });
      window.localStorage.setItem(found, JSON.stringify(saved));
      return found;
    });
    assert.ok(key, 'no saved picks to tamper with');

    await page.reload();
    await page.waitForSelector('.predictor__side--picked');
    /* Counted, they would read 3 of 9; sent, the engine would credit the
       played week a second time and every record would run one game long. */
    assert.match(await page.locator('.predictor__sub').innerText(), /1 of 9 games called/);
    await page.selectOption('#predictor-week', 'w9');
    assert.equal(await page.locator('.predictor__side--picked').count(), 0, 'a week 7 call lit a week 9 card');
  } finally {
    await page.close();
  }
});

async function callSeason(page) {
  for (const week of ['w8', 'w9', 'w10']) {
    await page.selectOption('#predictor-week', week);
    const games = page.locator('.predictor__game');
    for (let index = 0; index < 3; index += 1) {
      await games.nth(index).locator('button.predictor__side').first().click();
    }
  }
  await page.selectOption('#predictor-week', 'playoffs');
}

test('the playoffs are one bracket, framed before the seeds exist and picked in place', async () => {
  const page = await open('&playoffTeams=6');
  try {
    /* Before the season is called: the frame, seed numbers, nothing to press. */
    await page.selectOption('#predictor-week', 'playoffs');
    await page.waitForSelector('.pbracket');
    assert.match(await page.locator('.pbracket__note').innerText(), /regular-season game/);
    assert.deepEqual(await page.locator('.pbracket__round-head').allInnerTexts().then((heads) => heads.map((head) => head.split('\n')[0].toLowerCase())), ['quarterfinals', 'semifinals', 'final']);
    assert.equal(await page.locator('button.pbracket__team').count(), 0);
    assert.equal(await page.locator('.pbracket__card--bye').count(), 2);
    assert.match(await weekCount(page), /0 of 5 called/);

    await callSeason(page);
    await page.waitForSelector('button.pbracket__team');
    assert.equal(await page.locator('.pbracket__note').count(), 0);
    /* Six teams: seeds 1 and 2 sit out, and two games can be picked. */
    assert.equal(await page.locator('button.pbracket__team').count(), 4);
    const byes = await page.locator('.pbracket__card--bye').allInnerTexts();
    assert.match(byes[0], /#1/);
    assert.match(byes[1], /#2/);

    /* Every round is a column to the right of the one before it, and each
       later slot sits between the two that feed it. */
    const geometry = await page.evaluate(() =>
      [...document.querySelectorAll('.pbracket__round')].map((round) =>
        [...round.querySelectorAll('.pbracket__card')].map((card) => {
          const rect = card.getBoundingClientRect();
          return { left: rect.left, mid: rect.top + rect.height / 2 };
        }),
      ),
    );
    assert.deepEqual(geometry.map((round) => round.length), [4, 2, 1]);
    assert.ok(geometry[0][0].left < geometry[1][0].left && geometry[1][0].left < geometry[2][0].left);
    for (const [index, slot] of geometry[1].entries()) {
      const fed = (geometry[0][index * 2].mid + geometry[0][index * 2 + 1].mid) / 2;
      assert.ok(Math.abs(slot.mid - fed) <= 2, `semifinal ${index} is off its feeders by ${slot.mid - fed}px`);
    }

    /* A pick carries its team into the next column, on the bracket. */
    await page.locator('button.pbracket__team', { hasText: '#4' }).click();
    await page.waitForSelector('.pbracket__team--picked');
    await page.locator('button.pbracket__team', { hasText: '#3' }).click();
    const semis = page.locator('.pbracket__round').nth(1);
    await semis.locator('button.pbracket__team').first().waitFor();
    assert.match(await semis.innerText(), /#1[\s\S]*#4[\s\S]*#2[\s\S]*#3/);

    await semis.locator('button.pbracket__team', { hasText: '#1' }).click();
    await semis.locator('button.pbracket__team', { hasText: '#2' }).click();
    const final = page.locator('.pbracket__round').nth(2);
    await final.locator('button.pbracket__team').first().waitFor();
    await final.locator('button.pbracket__team', { hasText: '#2' }).click();
    await page.waitForSelector('.pbracket__champ');
    assert.match(await page.locator('.pbracket__champ').innerText(), /Zeus's Bolts/);
    assert.match(await weekCount(page), /5 of 5 called/);

    /* Changing an early round takes back everything it fed. */
    await page.locator('.pbracket__round').first().locator('button.pbracket__team', { hasText: '#5' }).click();
    await page.waitForFunction(() => !document.querySelector('.pbracket__champ'));
    assert.match(await weekCount(page), /2 of 5 called/);
  } finally {
    await page.close();
  }
});
