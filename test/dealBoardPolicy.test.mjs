import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { acceptableDeals, dealRejection, isSingleQbLeague } from '../src/utils/dealBoardPolicy.ts';

const ONE_QB = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const SUPERFLEX = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF'];

const POSITIONS = {
  stafford: 'QB',
  mccaffrey: 'RB',
  jefferson: 'WR',
  kelce: 'TE',
  allen: 'QB',
};
const positionOf = (id) => POSITIONS[id] ?? null;

/* A deal both sides gain roughly equally from: what the heading promises. */
const fair = {
  give: [{ id: 'jefferson' }],
  get: [{ id: 'kelce' }],
  youDelta: 0.9,
  partnerDelta: 0.8,
};

test('a quarterback straight across for a skill player is never a best deal', () => {
  /**
   * The case Andre caught on the live board: Stafford for McCaffrey, printed
   * under "Best deals in the league".
   *
   * In a one-quarterback league the two sides are not comparable — a starting
   * quarterback has a replacement a waiver claim away and the running back
   * does not — so a straight swap reads as an offer worth weighing when it is
   * the one thing it is not.
   */
  const deal = {
    give: [{ id: 'stafford' }],
    get: [{ id: 'mccaffrey' }],
    youDelta: 0.4,
    partnerDelta: 0.5,
  };

  const rejection = dealRejection(deal, positionOf, ONE_QB);
  assert.ok(rejection, 'QB for RB straight across was allowed onto the board');
  assert.equal(rejection.reason, 'qb-for-skill');

  /* And in the other direction: receiving the quarterback is the same trade. */
  const reversed = { ...deal, give: [{ id: 'mccaffrey' }], get: [{ id: 'stafford' }] };
  assert.equal(dealRejection(reversed, positionOf, ONE_QB)?.reason, 'qb-for-skill');
});

test('the same trade is fine in superflex, and is not touched', () => {
  /* The rule holds because one league starts one quarterback. In superflex a
     quarterback for a running back is an ordinary trade and often the right
     one, so banning it there would hide the best ideas rather than the worst. */
  const deal = {
    give: [{ id: 'stafford' }],
    get: [{ id: 'mccaffrey' }],
    youDelta: 0.4,
    partnerDelta: 0.5,
  };

  assert.equal(dealRejection(deal, positionOf, SUPERFLEX), null);
  assert.equal(isSingleQbLeague(SUPERFLEX), false);
  assert.equal(isSingleQbLeague(ONE_QB), true);
  assert.equal(isSingleQbLeague(['QB', 'QB', 'RB', 'WR']), false);
});

test('quarterback for quarterback is a real trade', () => {
  const deal = {
    give: [{ id: 'stafford' }],
    get: [{ id: 'allen' }],
    youDelta: 0.6,
    partnerDelta: 0.5,
  };
  assert.equal(dealRejection(deal, positionOf, ONE_QB), null);
});

test('a package containing a quarterback is not the banned shape', () => {
  /* The rule is about a straight swap, where the two names sit side by side
     and invite comparison. Two-for-one with a quarterback in it is a
     different negotiation and the engine can price it. */
  const deal = {
    give: [{ id: 'stafford' }, { id: 'kelce' }],
    get: [{ id: 'mccaffrey' }],
    youDelta: 0.6,
    partnerDelta: 0.5,
  };
  assert.equal(dealRejection(deal, positionOf, ONE_QB), null);
});

test('a deal where one side takes nearly all the value is not a best deal', () => {
  /* The second half of what Andre saw: the engine reported one side up 6.3
     points of championship probability and the board printed it anyway,
     because the board only ever sorted. */
  const fleecing = {
    give: [{ id: 'mccaffrey' }],
    get: [{ id: 'jefferson' }],
    youDelta: 0.2,
    partnerDelta: 6.3,
  };

  const rejection = dealRejection(fleecing, positionOf, ONE_QB);
  assert.ok(rejection, 'a 0.2 against 6.3 split was called a best deal');
  assert.equal(rejection.reason, 'lopsided');
  assert.match(rejection.detail, /97%/);
});

test('an even deal passes, whichever side is marginally ahead', () => {
  assert.equal(dealRejection(fair, positionOf, ONE_QB), null);
  assert.equal(
    dealRejection({ ...fair, youDelta: 0.8, partnerDelta: 0.9 }, positionOf, ONE_QB),
    null,
  );
});

test('a lopsided split of almost nothing is left alone', () => {
  /* 0.10 against 0.02 is a 83/17 split of noise. Nobody is being fleeced, and
     throwing it out would empty the board in a quiet week for no reason. */
  const tiny = { ...fair, youDelta: 0.1, partnerDelta: 0.02 };
  assert.equal(dealRejection(tiny, positionOf, ONE_QB), null);
});

test('acceptableDeals keeps the good ones and reports what it dropped', () => {
  const deals = [
    fair,
    { give: [{ id: 'stafford' }], get: [{ id: 'mccaffrey' }], youDelta: 0.4, partnerDelta: 0.5 },
    { give: [{ id: 'mccaffrey' }], get: [{ id: 'jefferson' }], youDelta: 0.2, partnerDelta: 6.3 },
  ];

  const { kept, rejected } = acceptableDeals(deals, positionOf, ONE_QB);
  assert.equal(kept.length, 1);
  assert.equal(kept[0], fair);
  assert.deepEqual(
    rejected.map((entry) => entry.rejection.reason),
    ['qb-for-skill', 'lopsided'],
  );
});

test('a missing position never silently bans a trade', () => {
  /* An unpriced or uncatalogued player is a gap in what we know, not evidence
     the trade is bad. Dropping it would quietly shrink the board whenever the
     catalogue lagged. */
  const unknown = {
    give: [{ id: 'not-in-catalogue' }],
    get: [{ id: 'mccaffrey' }],
    youDelta: 0.5,
    partnerDelta: 0.5,
  };
  assert.equal(dealRejection(unknown, positionOf, ONE_QB), null);
});

test('both surfaces filter, so they cannot disagree', async () => {
  /* The Hub rail and the Trades board draw from one pool. A deal barred from
     one and shown on the other is the product contradicting itself in front
     of the reader. */
  for (const file of ['src/pages/TradePage.tsx', 'src/components/matchup/HubDeals.tsx']) {
    const source = await fs.readFile(path.resolve(file), 'utf8');
    assert.match(source, /acceptableDeals\(/, `${file} does not filter the deal pool`);
    assert.match(
      source,
      /rosterPositions/,
      `${file} filters without telling the policy how many quarterbacks start`,
    );
    /* Calling the filter is not the same as using it. Asserting only that
       acceptableDeals appears let a version through that computed `kept` and
       then sorted the raw pool anyway. */
    assert.match(
      source,
      /sortByTradeFairness\(kept\)/,
      `${file} computes the filtered pool and then sorts the unfiltered one`,
    );
  }
});
