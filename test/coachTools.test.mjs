import assert from 'node:assert/strict';
import test from 'node:test';

import { TOOLS, TOOL_NAMES, HANDLERS, runTool, leagueRoster } from '../server/services/coach/tools.js';
import { REFUSALS, REFUSAL_REASONS, refuse } from '../server/services/coach/refusals.js';
import { validateAnswer, violationFeedback } from '../server/services/coach/validate.js';

/**
 * The coach's tool layer, exercised against the REAL engine on a synthetic
 * twelve-team league.
 *
 * The thing under test is not "does it return JSON". It is the two properties
 * the whole design rests on: that a question the data cannot answer comes back
 * as a sentence rather than a guess, and that a conditional answer is a
 * difference the server computed rather than one a model was invited to work
 * out.
 */

/* ── a real league ───────────────────────────────────────────────────────── */

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const ROSTER_POSITIONS = [...SLOTS, 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
const REG_WEEKS = 14;
const TEAM_COUNT = 12;

const catalog = {};
const projections = [];
let uid = 0;

function P(position, ppg, name) {
  const id = `p${uid++}`;
  catalog[id] = { position, name, team: 'FA', injuryStatus: null };
  projections.push({ playerId: id, mean: ppg, stdev: ppg * 0.35, weekly: {}, weeklyCI: {} });
  return id;
}

function buildTeam(rosterId, scale, teamName, ownerName) {
  const players = [
    P('QB', 20 * scale, `Quarterback ${rosterId}`), P('QB', 12 * scale, `Backup QB ${rosterId}`),
    P('RB', 18 * scale, `Runner ${rosterId}`), P('RB', 14 * scale, `Runner Two ${rosterId}`),
    P('RB', 8 * scale, `Runner Three ${rosterId}`), P('RB', 6 * scale, `Runner Four ${rosterId}`),
    P('WR', 17 * scale, `Receiver ${rosterId}`), P('WR', 13 * scale, `Receiver Two ${rosterId}`),
    P('WR', 9 * scale, `Receiver Three ${rosterId}`), P('WR', 7 * scale, `Receiver Four ${rosterId}`),
    P('TE', 11 * scale, `Tight End ${rosterId}`), P('TE', 5 * scale, `Tight End Two ${rosterId}`),
    P('K', 9 * scale, `Kicker ${rosterId}`), P('DEF', 8 * scale, `Defense ${rosterId}`),
    P('WR', 6 * scale, `Receiver Five ${rosterId}`),
  ];
  return {
    rosterId, teamName, ownerName, isUser: rosterId === 1, players,
    starters: players.slice(0, SLOTS.length),
    record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0, pointsAgainst: 0,
  };
}

const NAMES = [
  ["Andre's Death Dealers", 'AndreVL'], ['Gridiron Heretics', 'FantasyGodCasta'],
  ['Sunday Scaries', 'mmoser'], ['Waiver Wire Wizards', 'jdoe'],
  ['Coked Out Ladds', 'avla'], ['The Allen Armada', 'HoopDreamsDan'],
  ['Three-peat?', 'kfz'], ['Real Eliot Wolf', 'ew'],
  ['Waddle Through Flowers', 'wtf'], ['PatriotsDrive', 'pd'],
  ['MayeDaye', 'md'], ['Philly Special', 'ps'],
];

const teams = NAMES.map(([teamName, ownerName], i) =>
  buildTeam(i + 1, 1.15 - i * 0.03, teamName, ownerName));

const scheduleWeeks = [];
let order = teams.map((t) => t.rosterId);
for (let w = 1; w <= REG_WEEKS; w += 1) {
  const matchups = [];
  for (let i = 0; i < TEAM_COUNT / 2; i += 1) {
    const a = order[i];
    const b = order[TEAM_COUNT - 1 - i];
    const matchupId = w * 100 + i;
    const teamA = teams.find((t) => t.rosterId === a);
    const teamB = teams.find((t) => t.rosterId === b);
    matchups.push({ rosterId: a, matchupId, starters: teamA.starters });
    matchups.push({ rosterId: b, matchupId, starters: teamB.starters });
  }
  scheduleWeeks.push({ week: w, matchups });
  order = [order[0], order[TEAM_COUNT - 1], ...order.slice(1, TEAM_COUNT - 1)];
}

const ctx = {
  league: {
    rosterPositions: ROSTER_POSITIONS, regularSeasonWeeks: REG_WEEKS,
    playoffWeekStart: REG_WEEKS + 1, playoffTeams: 6, scoringFamily: 'ppr', isDynasty: false,
  },
  teams, week: 3, catalog, scheduleWeeks, overlay: null,
  projections: { version: 'coach-test-v1', projections },
};

/* The real count, not a fast one. A cheaper setting here would let a change
   that makes the coach quote noise pass its own test, which is the failure
   this file exists to catch. */
import { COACH_SIMS, MATERIAL_PP } from '../server/services/coach/tools.js';
const SIMS = COACH_SIMS;

/* ── the contract the model sees ─────────────────────────────────────────── */

test('every tool has a handler, and every handler has a tool', () => {
  assert.deepEqual(TOOL_NAMES.slice().sort(), Object.keys(HANDLERS).sort());
});

test('every schema is strict, so an argument cannot be silently ignored', () => {
  for (const tool of TOOLS) {
    const schema = tool.input_schema;
    assert.equal(schema.type, 'object', `${tool.name} is not an object schema`);
    assert.equal(
      schema.additionalProperties,
      false,
      `${tool.name} accepts unlisted arguments, so a hallucinated one passes silently`,
    );
    assert.ok(Array.isArray(schema.required), `${tool.name} has no required list`);
    assert.deepEqual(
      schema.required.slice().sort(),
      Object.keys(schema.properties).sort(),
      `${tool.name} has optional arguments; strict tool calling needs every property required`,
    );
    assert.ok(tool.description.length > 40, `${tool.name} is under-described`);
  }
});

/* ── refusals ────────────────────────────────────────────────────────────── */

test('every refusal reason has a sentence a person would accept', () => {
  for (const reason of REFUSAL_REASONS) {
    const message = REFUSALS[reason];
    assert.ok(message.length > 20, `${reason} has no real sentence`);
    assert.doesNotMatch(message, /undefined|null|\[object/, `${reason} leaks a value`);
    /* A refusal that guesses is worse than no refusal. */
    assert.doesNotMatch(
      message,
      /probably|roughly|I think|my guess|likely around/i,
      `${reason} speculates about the answer it is declining to give`,
    );
  }
});

test('an unknown reason degrades to a sentence, never to silence', () => {
  const result = refuse('something_nobody_wrote');
  assert.equal(result.available, false);
  assert.equal(result.reason, 'out_of_scope');
  assert.ok(result.message.length > 0, 'an unknown reason produced a blank refusal');
});

test('a week outside the schedule is refused, not answered', async () => {
  for (const week of [0, 99, -3]) {
    const result = await runTool('get_week_board', { week }, ctx, { pricing: { available: true } });
    assert.equal(result.available, false, `week ${week} was answered`);
    assert.equal(result.reason, 'week_out_of_range');
  }
});

test('a team nobody has is refused', async () => {
  const result = await runTool('get_lineup', { rosterId: '999', week: 3 }, ctx);
  assert.equal(result.reason, 'team_not_found');
});

test('a player nobody rosters is refused', async () => {
  const result = await runTool('find_player', { query: 'Zzyzx Nobody' }, ctx);
  assert.equal(result.reason, 'player_not_found');
});

test('a dynasty league refuses trade pricing rather than guessing at picks', async () => {
  const dynasty = { ...ctx, league: { ...ctx.league, isDynasty: true } };
  const result = await runTool('analyze_trade', { partnerRosterId: '2', give: [], get: [] }, dynasty);
  assert.equal(result.reason, 'dynasty_unpriced');
  assert.match(result.message, /this season alone/);
});

test('an unknown tool name is refused rather than throwing', async () => {
  const result = await runTool('get_the_lottery_numbers', {}, ctx);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'out_of_scope');
});

test('a handler that throws becomes a refusal, not a crash', async () => {
  const broken = { ...ctx, teams: null, scheduleWeeks: null };
  const result = await runTool('find_player', { query: 'Runner' }, broken);
  assert.equal(result.available, false, 'a thrown handler escaped into the loop');
});

/* ── the conditional answer ──────────────────────────────────────────────── */

test('what_if returns the difference already computed, and it is not noise', async () => {
  const board = await runTool('get_week_board', { week: 3 }, ctx, { pricing: { available: true, lines: [] } });
  assert.equal(board.available, true);
  const mine = board.games.find((g) => g.sides.some((s) => s.isYou));
  assert.ok(mine, 'the fixture has no game for the user in week 3');
  const me = mine.sides.find((s) => s.isYou);
  const them = mine.sides.find((s) => !s.isYou);

  const win = await runTool(
    'what_if',
    { conditions: [{ week: 3, matchupId: mine.matchupId, winnerRosterId: me.rosterId }] },
    ctx, { sims: SIMS },
  );
  assert.equal(win.available, true);

  const you = win.teams.find((t) => t.isYou);
  assert.ok(you, 'what_if dropped the user from its own answer');

  /* The shape that keeps the model out of the arithmetic. */
  for (const field of ['titlePct', 'playoffPct']) {
    assert.ok(you[field].before != null, `${field}.before missing`);
    assert.ok(you[field].after != null, `${field}.after missing`);
    assert.ok(you[field].change != null, `${field}.change missing`);
    assert.ok(
      Math.abs((you[field].after - you[field].before) - you[field].change) < 0.06,
      `${field}.change does not equal after minus before, so the model would be right to distrust it`,
    );
  }

  const lose = await runTool(
    'what_if',
    { conditions: [{ week: 3, matchupId: mine.matchupId, winnerRosterId: them.rosterId }] },
    ctx, { sims: SIMS },
  );
  const youLose = lose.teams.find((t) => t.isYou);

  /* The direction has to be right. At 400 sims it is not: one question in five
     comes back saying losing helps you, because the win/lose difference is
     sampled and the standard deviation is bigger than the effect. This is the
     assertion that set COACH_SIMS. */
  assert.ok(
    you.titlePct.after > youLose.titlePct.after,
    `winning did not beat losing (${you.titlePct.after} vs ${youLose.titlePct.after})`,
  );
  assert.ok(
    you.titlePct.change > youLose.titlePct.change,
    'the reported change disagrees with the reported level',
  );
});

test('a swing inside the simulation margin is flagged, not quoted', async () => {
  const mine = matchupFor(3, 1);
  const result = await runTool(
    'what_if',
    { conditions: [{ week: 3, matchupId: mine.matchupId, winnerRosterId: '1' }] },
    ctx, { sims: SIMS },
  );

  for (const row of result.teams) {
    for (const field of ['titlePct', 'playoffPct']) {
      assert.equal(
        row[field].material,
        Math.abs(row[field].change) >= MATERIAL_PP,
        `${row.teamName} ${field} is flagged material inconsistently with its own change`,
      );
    }
  }

  assert.match(
    result.note,
    /material is false/,
    'nothing tells the coach what to do with an immaterial change, so it will quote it',
  );

  /* Everybody who is not you and did not move by more than the margin is left
     out entirely, so there are no near-zero rows inviting a narrated finding. */
  for (const row of result.teams.filter((t) => !t.isYou)) {
    assert.ok(
      Math.abs(row.titlePct.change) >= MATERIAL_PP || Math.abs(row.playoffPct.change) >= MATERIAL_PP,
      `${row.teamName} is in the answer having barely moved`,
    );
  }
});

test('the same question twice gives the same answer', async () => {
  /* The engine is seeded from league inputs rather than the clock. That is
     what lets a delta be reported as a fact: if two identical runs disagreed,
     every "worth 2.8 points" the coach says would be partly sim noise. */
  const args = { conditions: [{ week: 5, matchupId: 500, winnerRosterId: '1' }] };
  const a = await runTool('what_if', args, ctx, { sims: SIMS });
  const b = await runTool('what_if', args, ctx, { sims: SIMS });
  assert.deepEqual(a.teams, b.teams, 'two identical questions produced different numbers');
});

test('what_if refuses a matchup that does not exist, and a team not in it', async () => {
  const bogus = await runTool('what_if', { conditions: [{ week: 3, matchupId: 'nope', winnerRosterId: '1' }] }, ctx, { sims: SIMS });
  assert.equal(bogus.reason, 'matchup_not_found');

  const board = await runTool('get_week_board', { week: 3 }, ctx, { pricing: { available: true, lines: [] } });
  const other = board.games.find((g) => !g.sides.some((s) => s.isYou));
  const notInIt = await runTool(
    'what_if',
    { conditions: [{ week: 3, matchupId: other.matchupId, winnerRosterId: '1' }] },
    ctx, { sims: SIMS },
  );
  assert.equal(notInIt.reason, 'not_scheduled', 'a team was credited with winning a game it is not in');

  const empty = await runTool('what_if', { conditions: [] }, ctx, { sims: SIMS });
  assert.equal(empty.available, false);
});

test('several conditions are one call, not several', async () => {
  const conditions = [3, 4, 5].map((week) => {
    const mine = matchupFor(week, 1);
    return { week, matchupId: mine.matchupId, winnerRosterId: '1' };
  });
  const result = await runTool('what_if', { conditions }, ctx, { sims: SIMS });
  assert.equal(result.available, true);
  assert.equal(result.assumed.length, 3);
  const you = result.teams.find((t) => t.isYou);
  const single = await runTool('what_if', { conditions: [conditions[0]] }, ctx, { sims: SIMS });
  const youSingle = single.teams.find((t) => t.isYou);
  assert.ok(
    you.titlePct.change > youSingle.titlePct.change,
    'winning three games was not worth more than winning one',
  );
});

function matchupFor(week, rosterId) {
  const entry = scheduleWeeks.find((w) => w.week === week);
  return entry.matchups.find((m) => String(m.rosterId) === String(rosterId));
}

/* ── payload discipline ──────────────────────────────────────────────────── */

test('tool results stay small, because input is re-sent every iteration', async () => {
  const board = await runTool('get_week_board', { week: 3 }, ctx, { pricing: { available: true, lines: [] } });
  const lineup = await runTool('get_lineup', { rosterId: '1', week: 3 }, ctx, { pricing: {} });
  const roster = leagueRoster(ctx);

  const size = (v) => JSON.stringify(v).length;
  assert.ok(size(board) < 4_000, `week board is ${size(board)} chars`);
  assert.ok(size(lineup) < 2_500, `lineup is ${size(lineup)} chars`);
  assert.ok(size(roster) < 2_000, `the in-context roster is ${size(roster)} chars`);

  /* No roster inside a board, no catalog inside a lineup. */
  assert.doesNotMatch(JSON.stringify(board), /playerId/, 'the week board is carrying players');
});

test('what_if reports the teams that moved, not all twelve every time', async () => {
  const mine = matchupFor(3, 1);
  const result = await runTool(
    'what_if',
    { conditions: [{ week: 3, matchupId: mine.matchupId, winnerRosterId: '1' }] },
    ctx, { sims: SIMS },
  );
  assert.ok(result.teams.length <= TEAM_COUNT);
  assert.ok(result.teams.some((t) => t.isYou), 'the user is always included');
});

/* ── the validator ───────────────────────────────────────────────────────── */

test('an answer built from tool numbers passes', () => {
  const toolResults = [{ available: true, teams: [{ teamName: "Andre's Death Dealers", rosterId: '1', titlePct: { before: 38.0, after: 40.8, change: 2.8 } }] }];
  const result = validateAnswer(
    'Beating them in week 3 takes you from 38.0% to 40.8%, a gain of 2.8 points of title equity.',
    { toolResults, teams: leagueRoster(ctx), extraNumbers: [3] },
  );
  assert.deepEqual(result.violations, []);
  assert.equal(result.ok, true);
});

test('a fabricated number is caught', () => {
  const toolResults = [{ available: true, teams: [{ rosterId: '1', teamName: "Andre's Death Dealers", titlePct: { before: 38.0, after: 40.8, change: 2.8 } }] }];
  const result = validateAnswer(
    'That win is worth about 7.4 points of title equity.',
    { toolResults, teams: leagueRoster(ctx) },
  );
  assert.equal(result.ok, false, 'a number no tool produced was allowed through');
  assert.ok(result.violations.some((v) => v.type === 'number' && v.value === '7.4'));
  assert.match(violationFeedback(result.violations), /7\.4/);
});

test('a rounded number is not treated as a fabrication', () => {
  const toolResults = [{ available: true, titlePct: 40.8 }];
  assert.equal(validateAnswer('You are 41% to win it.', { toolResults }).ok, true);
});

test('a team nobody looked up is caught', () => {
  const toolResults = [{ available: true, teams: [{ rosterId: '1', teamName: "Andre's Death Dealers", titlePct: 40.8 }] }];
  const result = validateAnswer(
    'You are at 40.8%, while Sunday Scaries are the team to beat.',
    { toolResults, teams: leagueRoster(ctx) },
  );
  assert.equal(result.ok, false, 'the coach discussed a team it never queried');
  assert.ok(result.violations.some((v) => v.type === 'team' && v.value === 'Sunday Scaries'));
});

test('ordinary English does not trip the name check', () => {
  const toolResults = [{ available: true, teams: [{ rosterId: '1', teamName: "Andre's Death Dealers", titlePct: 40.8 }] }];
  const result = validateAnswer(
    'Winning this one matters. Your title odds sit at 40.8%, and The rest of the season is still open.',
    { toolResults, teams: leagueRoster(ctx) },
  );
  assert.deepEqual(result.violations, [], 'a word-allowlist style check would have failed this');
});

test('house style survives the model', () => {
  const result = validateAnswer('You are 40.8% — the favourite.', { toolResults: [{ v: 40.8 }] });
  assert.ok(result.violations.some((v) => v.type === 'em_dash'));
});
