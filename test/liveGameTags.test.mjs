import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

/**
 * Where each player's game is, on the Hub's lineup board and in the League
 * board's game dialog, rendered.
 *
 * The first defect: during games a row showed a projection and a small "X now"
 * in the same face, and nothing on the row said whether the player's game was
 * on, over or yet to start. A live row now leads with points and carries the
 * clock, and a row whose game has not started keeps its projection with no tag.
 *
 * The second: a finished row said so three ways at once, with a FINAL chip, a
 * greyed score and a "proj" that on the Hub had converged on the score ("15.9 /
 * proj 15.9"). It now shows the score alone and the whole row recedes. Live
 * rows were outlined in cyan, which is not in the palette; live now has no
 * colour of its own, and the tag's bright type and pulsing dot carry it.
 *
 * ?liveGames gives the design league a fixed scoreboard (see useNflGameState):
 * MIN live in the 3rd, DET in OT, WAS at half, BAL, ATL and PHI final. Without
 * the flag a design scene must never request the real scoreboard, because a
 * fixture that reads it fails whenever a real game involving its players
 * happens to be on.
 */

const cwd = process.cwd();
const port = 4211;
const baseUrl = `http://127.0.0.1:${port}`;

const HUB_CARDS = '.matchup-page__module--slot-board .matchup-page__slot-card';
const DIALOG_CARDS = '.matchup-modal__scroll .matchup-page__slot-card';

/* The teams DESIGN_LIVE_GAMES marks final. Written out here rather than read
   off the page, so a row is judged against the fixture and not against the
   rendering under test. */
const FINAL_TEAMS = ['BAL', 'ATL', 'PHI'];

/* Enough of week 8 for the rows the phone test reads. Routed, because the
   design scene asks the API for its schedule and this suite runs no API, and
   without a schedule no row has an opponent to keep or give up. */
const SCHEDULE = {
  available: true,
  season: 2026,
  week: 8,
  games: [
    { team: 'BAL', week: 8, season: 2026, opponent: 'BUF', homeAway: 'away', kickoffIso: '2026-10-25T17:00:00Z', gameId: 'bal-buf' },
    { team: 'BUF', week: 8, season: 2026, opponent: 'BAL', homeAway: 'home', kickoffIso: '2026-10-25T17:00:00Z', gameId: 'bal-buf' },
    { team: 'MIN', week: 8, season: 2026, opponent: 'DET', homeAway: 'away', kickoffIso: '2026-10-25T17:00:00Z', gameId: 'min-det' },
    { team: 'DET', week: 8, season: 2026, opponent: 'MIN', homeAway: 'home', kickoffIso: '2026-10-25T17:00:00Z', gameId: 'min-det' },
  ],
  byes: [],
};

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

/* Every lineup card matching `selector`. `finished` comes from the team named
   in the row's own meta line, `faded` from how the row is drawn, so the two can
   be held against each other. */
const READ_ROWS = ({ selector, finalTeams }) => {
  const leadingText = (node) =>
    node?.firstChild?.nodeType === Node.TEXT_NODE ? node.firstChild.textContent : '';
  return [...document.querySelectorAll(selector)]
    .map((card) => {
      const name = card.querySelector('.matchup-page__row-name')?.textContent;
      if (!name) return null;
      const meta = card.querySelector('.matchup-page__meta-full');
      const compact = card.querySelector('.matchup-page__meta-compact');
      const tag = meta?.querySelector('.matchup-page__game-tag') ?? null;
      const dot = tag?.querySelector('.matchup-page__game-tag-dot') ?? null;
      const frame = getComputedStyle(card);
      return {
        name,
        bench: card.closest('.matchup-detail__bench') != null,
        finished: leadingText(meta).split(' · ').some((token) => finalTeams.includes(token)),
        faded: [...card.children].some((child) => Number(getComputedStyle(child).opacity) < 1),
        tag: tag?.textContent ?? null,
        tagPhase: tag
          ? [...tag.classList].find((c) => c.startsWith('matchup-page__game-tag--') && !c.endsWith('--flush'))
          : null,
        tagInk: tag
          ? [
            getComputedStyle(tag).color,
            getComputedStyle(tag).borderTopColor,
            getComputedStyle(tag).backgroundColor,
            dot ? getComputedStyle(dot).backgroundColor : 'rgb(0, 0, 0)',
          ]
          : [],
        spoken: meta?.querySelector('.visually-hidden')?.textContent ?? null,
        compact: leadingText(compact),
        compactTag: compact?.querySelector('.matchup-page__game-tag')?.textContent ?? null,
        leadsWithScore: Boolean(card.querySelector('.matchup-page__slot-scored')),
        leadsWithProjection: Boolean(card.querySelector('.matchup-page__slot-projection')),
        projLabel: card.querySelector('.matchup-page__slot-proj-label')?.textContent ?? null,
        numberLabel: card.querySelector('.matchup-page__slot-number-label')?.textContent?.trim() ?? null,
        frame: `${frame.borderTopColor} | ${frame.boxShadow}`,
      };
    })
    .filter(Boolean);
};

/* How far a computed colour sits from grey: the spread between its largest and
   smallest channel. The palette's warm neutrals are all under 12; the cyan the
   live tag used to wear is 146. */
function hueOf(css) {
  const scale = css.trim().startsWith('color(') ? 255 : 1;
  const [r, g, b] = (css.match(/-?[\d.]+/g) ?? []).map(Number).slice(0, 3).map((v) => v * scale);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

async function rowsAt(path, { viewport = { width: 1440, height: 1100 }, schedule = null } = {}) {
  const page = await browser.newPage({ viewport, colorScheme: 'dark' });
  try {
    if (schedule) {
      await page.route('**/api/nfl/schedule**', (route) => route.fulfill({ json: schedule }));
    }
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator(HUB_CARDS).first().waitFor();
    if (schedule) {
      /* The rows paint before the schedule lands; wait for an opponent from it. */
      await page.waitForFunction(
        () => document.querySelector('.matchup-page__module--slot-board')?.textContent.includes('@ BUF'),
      );
    }
    const rows = await page.evaluate(READ_ROWS, { selector: HUB_CARDS, finalTeams: FINAL_TEAMS });
    return Object.fromEntries(rows.map((row) => [row.name, row]));
  } finally {
    await page.close();
  }
}

test('a live player leads with points and carries the quarter and clock', async () => {
  const rows = await rowsAt('/design/matchup?liveGames');
  const jefferson = rows['J. Jefferson'];
  assert.ok(jefferson, 'the design lineup has no J. Jefferson');
  assert.equal(jefferson.tagPhase, 'matchup-page__game-tag--live');
  assert.equal(jefferson.tag, 'Q3 4:12');
  assert.equal(jefferson.leadsWithScore, true, 'a live row must lead with points scored');
  assert.match(jefferson.projLabel ?? '', /^proj /, 'the projection must sit beneath it, labelled');

  assert.equal(rows['J. Gibbs']?.tag, 'OT 2:00');
  assert.equal(rows['T. McLaurin']?.tag, 'Half');
});

test('a finished player shows his score labelled final, and his row recedes', async () => {
  const rows = await rowsAt('/design/matchup?liveGames');
  const henry = rows['D. Henry'];
  assert.ok(henry, 'the design lineup has no D. Henry');
  assert.equal(henry.finished, true, 'D. Henry is no longer on a team the fixture has final');
  assert.equal(henry.leadsWithScore, true);
  assert.equal(henry.tag, null, 'a finished row printed a tag on its meta line; the number column already says final');
  assert.equal(henry.projLabel, null, 'a finished row printed "proj" beside a settled score');
  assert.equal(henry.numberLabel, 'final', 'a settled score must say so under the number; a fade alone was read as nothing');
  assert.equal(henry.faded, true, 'a finished row must also recede, so the games still to come are what the eye lands on');
  assert.equal(henry.spoken, 'Final', 'a screen reader cannot see a row fade, so it must still hear Final');
});

test('once the matchup is under way, every number says what it is', async () => {
  /* A Sunday column is a mix of scores and projections in one face. With two
     9:30 games done, two faded scores sat among bright projections and the
     user could not tell which numbers had happened. So each row's number
     carries a word: "proj" before kickoff, "proj <final>" while playing,
     "final" after. Before anyone has kicked off, nothing is labelled: every
     number is a projection and the word would be noise on every row. */
  /* ?pregame&liveGames is the Sunday column: nobody credited with points, so
     the scoreboard alone decides who is final, who is playing and who has
     not kicked off, and all three sit in one lineup. */
  const started = Object.values(await rowsAt('/design/matchup?pregame&liveGames')).filter((row) => !row.bench);
  const kinds = { final: 0, playing: 0, upcoming: 0 };
  for (const row of started) {
    if (row.finished) {
      kinds.final += 1;
      assert.equal(row.numberLabel, 'final', `${row.name} has played and his score is unlabelled`);
    } else if (row.leadsWithScore) {
      kinds.playing += 1;
      assert.match(row.projLabel ?? '', /^proj /, `${row.name} is playing and his projected final is unlabelled`);
    } else {
      kinds.upcoming += 1;
      assert.equal(row.numberLabel, 'proj', `${row.name} has not played and his projection is unlabelled`);
    }
  }
  for (const [kind, count] of Object.entries(kinds)) {
    assert.ok(count > 0, `the fixture has no ${kind} row, so that branch is unproven`);
  }

  const pregame = Object.values(await rowsAt('/design/matchup?pregame')).filter((row) => !row.bench);
  assert.ok(pregame.length > 0, 'the pregame fixture has no lineup rows');
  for (const row of pregame) {
    assert.equal(row.numberLabel, null, `${row.name} is labelled before anyone has kicked off`);
    assert.equal(row.projLabel, null, `${row.name} carries a live label before anyone has kicked off`);
  }
});

test('only finished rows recede', async () => {
  /* The fade marks a score as final alongside its label, so it must mark
     exactly those rows. A live row faded is the one game still worth watching
     made hard to see; a finished row left bright reads as a projection. */
  const rows = Object.values(await rowsAt('/design/matchup?liveGames'));
  const faded = rows.filter((row) => row.faded).map((row) => row.name).sort();
  const finished = rows.filter((row) => row.finished).map((row) => row.name).sort();
  assert.ok(finished.length > 0, 'the ?liveGames fixture has no finished rows to check');
  assert.ok(rows.some((row) => row.tagPhase === 'matchup-page__game-tag--live'), 'the fixture has no live rows to check');
  assert.deepEqual(faded, finished);
});

test('a live row is framed like any other row, and its tag carries no hue', async () => {
  /* Live used to outline the card in cyan and tint its tag, and cyan is not in
     the palette. Compared against a started row on the same side, so each pair
     shares a side's styling and differs only in whether its game is live. */
  const rows = await rowsAt('/design/matchup?liveGames');
  for (const [live, quiet] of [['J. Jefferson', 'C. Lamb'], ['J. Gibbs', 'J. Jacobs']]) {
    assert.ok(rows[live] && rows[quiet], `the design lineup is missing ${live} or ${quiet}`);
    assert.equal(rows[live].tagPhase, 'matchup-page__game-tag--live', `${live} is no longer live in the fixture`);
    assert.equal(rows[quiet].tagPhase === 'matchup-page__game-tag--live', false, `${quiet} is live in the fixture`);
    assert.equal(rows[live].frame, rows[quiet].frame, `${live}'s card is framed differently because his game is live`);
    for (const ink of rows[live].tagInk) {
      assert.ok(hueOf(ink) <= 24, `${live}'s live tag is tinted (${ink}); live has no colour of its own`);
    }
  }
});

test('on a phone a finished row keeps its opponent, and a live row gives it to the clock', async () => {
  /* The short meta line has room for one of the two, so a running game's tag
     takes the opponent's place. A finished row has no tag any more, and
     blanking its line anyway threw away the one fact it had room for. */
  const rows = await rowsAt('/design/matchup?liveGames&desktop=0', {
    viewport: { width: 402, height: 874 },
    schedule: SCHEDULE,
  });
  assert.equal(rows['D. Henry']?.compact, '@ BUF');
  assert.equal(rows['D. Henry']?.compactTag, null);
  assert.equal(rows['J. Jefferson']?.compact, '', 'a live row kept its opponent beside the clock');
  assert.equal(rows['J. Jefferson']?.compactTag, 'Q3 4:12');
});

test('with no bench option anywhere, the board prints no hint', async () => {
  /* It used to say "No bench options this week. Every slot is the only play
     you have.", which is a line spent on nothing, and by Sunday was also wrong:
     kickoffs lock players, so it appeared over a full bench. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/matchup?liveGames`, { waitUntil: 'domcontentloaded' });
    await page.locator(HUB_CARDS).first().waitFor();
    assert.equal(
      await page.locator('.matchup-page__slot-bench-cue').count(),
      0,
      'the fixture now has a bench option, so this no longer checks the empty case',
    );
    assert.equal(await page.locator('.matchup-page__lineup-hint').count(), 0);
  } finally {
    await page.close();
  }
});

test('the game dialog recedes finished rows the same way, bench included', async () => {
  /* The dialog draws its rows, bench too, with the Hub's own SlotNumbers, so a
     finished bench row that did not recede would print a bare score reading as
     a projection. Every game on the board is opened, since which one holds a
     finished bench player is the fixture's business. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  try {
    await page.goto(`${baseUrl}/design/league?liveGames`, { waitUntil: 'domcontentloaded' });
    const games = page.locator('.matchup-slate__row-button');
    await games.first().waitFor({ timeout: 45_000 });
    const count = await games.count();
    let benchChecked = 0;
    for (let index = 0; index < count; index += 1) {
      await games.nth(index).click();
      await page.locator('.matchup-modal__panel').waitFor();
      const bench = page.locator('.matchup-modal__panel .matchup-detail__bench > summary');
      if (await bench.count()) await bench.click();
      const rows = await page.evaluate(READ_ROWS, { selector: DIALOG_CARDS, finalTeams: FINAL_TEAMS });
      for (const row of rows) {
        const where = `${row.name} (${row.bench ? 'bench' : 'starter'}, game ${index + 1})`;
        assert.equal(row.faded, row.finished, `${where} ${row.finished ? 'did not recede' : 'receded'}`);
        if (row.finished) {
          assert.equal(row.tag, null, `${where} printed a tag`);
          assert.equal(row.projLabel, null, `${where} printed "proj"`);
        }
      }
      benchChecked += rows.filter((row) => row.bench && row.finished).length;
      await page.keyboard.press('Escape');
      await page.locator('.matchup-modal').waitFor({ state: 'detached' });
    }
    assert.ok(benchChecked > 0, 'no game in the fixture has a finished bench player, so the bench went unchecked');
  } finally {
    await page.close();
  }
});

test('design scenes never read the real scoreboard', async () => {
  /* Asserted on the REQUEST, not on the rendered tags. Reading tags raced the
     first poll: with the guard removed this test still passed, because the rows
     were read before the real scoreboard answered. A design scene must not ask
     at all, and a request is visible the moment it is made. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  const asked = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/nfl/game-state')) asked.push(request.url());
  });
  try {
    await page.goto(`${baseUrl}/design/matchup`, { waitUntil: 'domcontentloaded' });
    await page.locator(HUB_CARDS).first().waitFor();
    /* The hook polls on mount, so a request would already be out by now. The
       wait covers a slow first render, not the poll interval. */
    await page.waitForTimeout(1500);
    assert.deepEqual(asked, [], 'a design scene requested the real NFL scoreboard');
  } finally {
    await page.close();
  }
});
