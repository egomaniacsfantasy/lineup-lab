import { predictSeason, weekForks, PREDICTOR_SIMS } from '../../engine/leverage.js';
import { analyzeTrade } from '../../engine/engine.js';
import { refuse, fromEngine, isRefusal } from './refusals.js';

/**
 * The coach's tool surface.
 *
 * Design rules, in the order they matter:
 *
 * 1. THE MODEL NEVER DOES ARITHMETIC ON A PROBABILITY. what_if returns the
 *    before, the after AND the difference, all computed here. A model that is
 *    handed two numbers and asked for the gap will sometimes get it wrong, and
 *    a wrong delta is indistinguishable from a right one to the reader.
 *
 * 2. NARROW RETURNS. Input tokens are re-sent on every iteration of the tool
 *    loop, so payload size drives cost harder than model choice does. Every
 *    tool returns the fields an answer needs and nothing else - no rosters
 *    inside a standings call, no catalog inside a lineup.
 *
 * 3. TEAMS IN CONTEXT, PLAYERS BY SEARCH. Twelve teams fit in the cached
 *    system prompt, so resolving "Dan" is comprehension against a table the
 *    model can already see - which is what a language model is for. The player
 *    catalog is thousands of rows and cannot be, so that one gets a tool.
 *    Fuzzy-matching a team name in JavaScript would be trading the model's
 *    strongest skill for its weakest.
 *
 * 4. ONE CALL SHOULD ANSWER THE COMMON QUESTION. what_if takes a LIST of
 *    conditions, so "if I win out" is one call rather than five. Small models
 *    answer after the first tool result; make the first result sufficient.
 *
 * 5. EVERY FAILURE IS A REFUSAL WITH A SENTENCE. See refusals.js.
 */

/**
 * Sim count for a conditional answer, and why it is not lower.
 *
 * The tempting saving is to halve it: a what_if is two runs, so fewer sims is
 * a faster, cheaper coach. Measured on a twelve-team, fourteen-week league,
 * asking "what is a win in week N worth" five times:
 *
 *     sims   mean swing   sd     wrong sign
 *      400     +1.42pp   1.22      1 of 5
 *     1000     +1.86pp   0.91      0 of 5
 *     2000     +2.68pp   1.26      0 of 5
 *     4000     +3.22pp   0.99      0 of 5
 *     8000     +2.80pp   0.49      0 of 5
 *
 * At 400 the coach tells one manager in five that LOSING helps them. The mean
 * also drifts upward as sims rise, so low counts are biased toward "it barely
 * matters" as well as noisy - the failure that looks least like a failure.
 *
 * A separate and easily confused fact: the engine is seeded from league inputs
 * rather than the clock, so asking the SAME question twice is exactly
 * reproducible. That is reproducibility, not accuracy. Win and lose are
 * different inputs, sampled differently, so the difference between them still
 * carries sampling error - which is what the table above measures.
 */
export const COACH_SIMS = PREDICTOR_SIMS;

/**
 * How big a swing has to be before it gets quoted as a number.
 *
 * Standard deviation at COACH_SIMS is about 1pp, so a reported "+0.4pp" is the
 * sim talking. Below this the tool still returns the value - it is real
 * bookkeeping - but flags it immaterial, and the note tells the coach to say
 * it barely moves rather than to quote a figure it cannot stand behind.
 */
export const MATERIAL_PP = 1.0;

const r1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(1)) : null);

/* Deltas are the whole point of what_if, so they get more precision than the
   levels do: a 0.4pp swing rounds to 0.0 at one decimal and reads as "no
   effect", which is a different claim from the one the engine made. */
const r2 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(2)) : null);

function teamRow(team) {
  const rec = team.record ?? {};
  return {
    rosterId: String(team.rosterId),
    teamName: team.teamName,
    ownerName: team.ownerName ?? null,
    record: `${rec.wins ?? 0}-${rec.losses ?? 0}${rec.ties ? `-${rec.ties}` : ''}`,
    isYou: Boolean(team.isUser),
  };
}

/**
 * The team table that goes in the system prompt, not through a tool.
 *
 * Twelve rows, about two hundred tokens, cached with the rest of the prefix.
 * It is what makes every later question about "Dan" or "the Armada" resolvable
 * without a round trip.
 */
export function leagueRoster(ctx) {
  return (ctx.teams ?? []).map(teamRow);
}

function weekInRange(ctx, week) {
  const weeks = (ctx.scheduleWeeks ?? []).map((w) => w.week);
  if (weeks.length === 0) return false;
  return week >= Math.min(...weeks) && week <= Math.max(...weeks);
}

function matchupsForWeek(ctx, week) {
  return (ctx.scheduleWeeks ?? []).find((w) => w.week === week)?.matchups ?? [];
}

/* ── schemas ───────────────────────────────────────────────────────────────
   Plain JSON Schema, one object per tool, provider-agnostic. Both Anthropic
   and OpenAI take this shape; the adapter that wraps it for the wire lives
   with the agent loop, so swapping providers never touches this file.

   additionalProperties:false and a full `required` list on every one, because
   strict tool calling needs both and because an argument the handler silently
   ignores is a question the coach answered without being asked. */

export const TOOLS = [
  {
    name: 'get_league_settings',
    description:
      'Scoring format, roster slots, playoff spots, regular season length, current week, and whether this is a dynasty league. Call this before any answer that depends on league rules. The list of teams is already in your context and does not need a tool.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'get_odds',
    description:
      'Every team\'s current championship and playoff odds, projected seed and record. This is the standings-and-futures picture as it stands right now, with nothing conditioned on.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'get_week_board',
    description:
      'Every matchup in a given week with its matchupId, both teams, the spread, the total and each side\'s price. Use this to find the matchupId you need for what_if.',
    input_schema: {
      type: 'object',
      properties: { week: { type: 'integer', description: 'Week number.' } },
      required: ['week'],
      additionalProperties: false,
    },
  },
  {
    name: 'what_if',
    description:
      'Condition the season on one or more results and report what it does to every team\'s championship and playoff odds. Pass every result you want to assume in a single call: "if I win out" is one call with several conditions, not several calls. Returns before, after and the difference already computed for you.',
    input_schema: {
      type: 'object',
      properties: {
        conditions: {
          type: 'array',
          description: 'The results to assume. Each names a matchup and who wins it.',
          items: {
            type: 'object',
            properties: {
              week: { type: 'integer' },
              matchupId: { type: 'string', description: 'From get_week_board.' },
              winnerRosterId: { type: 'string' },
            },
            required: ['week', 'matchupId', 'winnerRosterId'],
            additionalProperties: false,
          },
        },
      },
      required: ['conditions'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_week_forks',
    description:
      'For every game in a week, what each side\'s playoff odds become if it wins and if it loses, plus which single result moves the league most. Use this for "what matters this week" questions; use what_if when the user names a specific result.',
    input_schema: {
      type: 'object',
      properties: { week: { type: 'integer' } },
      required: ['week'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_lineup',
    description:
      'A team\'s starting lineup for a week: each slot, the player in it, and what the engine projects them to score.',
    input_schema: {
      type: 'object',
      properties: {
        rosterId: { type: 'string' },
        week: { type: 'integer' },
      },
      required: ['rosterId', 'week'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_player',
    description:
      'Search players rostered in this league by name. Returns the playerId you need for analyze_trade. The player catalog is too large to be in your context, so resolving a player name always needs this call.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Part of a player name.' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_trade',
    description:
      'Price a trade between the user and one other team: what it does to both sides\' championship odds, and whether either side has to drop anybody to fit it.',
    input_schema: {
      type: 'object',
      properties: {
        partnerRosterId: { type: 'string' },
        give: { type: 'array', items: { type: 'string' }, description: 'playerIds the user sends.' },
        get: { type: 'array', items: { type: 'string' }, description: 'playerIds the user receives.' },
      },
      required: ['partnerRosterId', 'give', 'get'],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES = Object.freeze(TOOLS.map((t) => t.name));

/* ── handlers ─────────────────────────────────────────────────────────────
   Each takes the assembled league context and the model's arguments, and
   returns either data or a refusal. None of them throws for a bad argument:
   a thrown error becomes a stack trace the model cannot act on, where a
   refusal becomes a sentence it can say. */

function guardPriced(ctx, pricing) {
  if (isLeaguePreDraft(ctx)) return refuse('pre_draft');
  if (!pricing || pricing.available === false) {
    return pricing?.reason ? fromEngine(pricing) : refuse('pricing_unavailable');
  }
  return null;
}

function isLeaguePreDraft(ctx) {
  return (ctx.teams ?? []).every((t) => (t.players ?? []).length === 0);
}

export const HANDLERS = {
  get_league_settings(ctx) {
    const league = ctx.league ?? {};
    return {
      available: true,
      currentWeek: ctx.week ?? null,
      scoringFormat: league.scoringFamily ?? null,
      rosterSlots: (league.rosterPositions ?? []).filter((p) => !['BN', 'IR', 'TAXI'].includes(p)),
      teamCount: (ctx.teams ?? []).length,
      playoffSpots: league.playoffTeams ?? null,
      regularSeasonWeeks: league.regularSeasonWeeks ?? null,
      playoffWeekStart: league.playoffWeekStart ?? null,
      isDynasty: Boolean(league.isDynasty),
    };
  },

  get_odds(ctx, _args, { pricing } = {}) {
    const blocked = guardPriced(ctx, pricing);
    if (blocked) return blocked;

    const futures = pricing.futures ?? [];
    if (futures.length === 0) return refuse('pricing_unavailable');
    const byRoster = new Map((ctx.teams ?? []).map((t) => [String(t.rosterId), t]));

    return {
      available: true,
      teams: futures.map((f) => {
        const team = byRoster.get(String(f.rosterId));
        return {
          rosterId: String(f.rosterId),
          teamName: f.teamName,
          isYou: Boolean(team?.isUser),
          record: f.record
            ? `${f.record.wins}-${f.record.losses}${f.record.ties ? `-${f.record.ties}` : ''}`
            : null,
          titlePct: r1(f.titleProb),
          playoffPct: r1(f.playoffProb),
          projectedWins: r1(f.projWins),
          avgSeed: r1(f.avgSeed),
        };
      }),
    };
  },

  get_week_board(ctx, { week }, { pricing } = {}) {
    if (!weekInRange(ctx, week)) return refuse('week_out_of_range', `week=${week}`);
    const blocked = guardPriced(ctx, pricing);
    if (blocked) return blocked;

    const byRoster = new Map((ctx.teams ?? []).map((t) => [String(t.rosterId), t]));
    const lines = new Map((pricing.lines ?? []).map((l) => [String(l.matchupId), l]));
    const grouped = new Map();
    for (const m of matchupsForWeek(ctx, week)) {
      if (m.matchupId == null) continue;
      const key = String(m.matchupId);
      grouped.set(key, [...(grouped.get(key) ?? []), m]);
    }

    const games = [];
    for (const [matchupId, pair] of grouped) {
      if (pair.length !== 2) continue;
      const line = lines.get(matchupId);
      games.push({
        matchupId,
        total: r1(line?.sides?.[String(pair[0].rosterId)]?.total),
        sides: pair.map((m) => {
          const team = byRoster.get(String(m.rosterId));
          const side = line?.sides?.[String(m.rosterId)];
          return {
            rosterId: String(m.rosterId),
            teamName: team?.teamName ?? null,
            isYou: Boolean(team?.isUser),
            winPct: r1(side?.winProbability),
            spread: r1(side?.spread),
            projected: r1(side?.projection),
          };
        }),
      });
    }

    if (games.length === 0) return refuse('week_out_of_range', `week=${week}`);
    return { available: true, week, games };
  },

  /**
   * The one that answers "how much would a win in week 3 be worth".
   *
   * Two runs of the same deterministic sim, differenced here. The seed is a
   * function of the league inputs rather than the clock, so a baseline and a
   * conditioned run differ ONLY by the results being assumed - the measured
   * noise floor between two identical runs is 0.00pp. That is what makes the
   * delta reportable as a fact instead of an estimate.
   */
  what_if(ctx, { conditions }, { sims = COACH_SIMS } = {}) {
    if (!Array.isArray(conditions) || conditions.length === 0) {
      return refuse('out_of_scope', 'what_if called with no conditions');
    }

    for (const c of conditions) {
      if (!weekInRange(ctx, c.week)) return refuse('week_out_of_range', `week=${c.week}`);
      const pair = matchupsForWeek(ctx, c.week).filter(
        (m) => String(m.matchupId) === String(c.matchupId),
      );
      if (pair.length !== 2) return refuse('matchup_not_found', `week=${c.week} id=${c.matchupId}`);
      if (!pair.some((m) => String(m.rosterId) === String(c.winnerRosterId))) {
        return refuse('not_scheduled', `roster=${c.winnerRosterId} week=${c.week}`);
      }
    }

    const base = fromEngine(predictSeason(ctx, { sims }));
    if (isRefusal(base)) return base;
    const after = fromEngine(predictSeason(ctx, { picks: conditions, sims }));
    if (isRefusal(after)) return after;

    const baseBy = new Map((base.rows ?? []).map((row) => [String(row.rosterId), row]));
    const byRoster = new Map((ctx.teams ?? []).map((t) => [String(t.rosterId), t]));

    const rows = (after.rows ?? []).map((row) => {
      const before = baseBy.get(String(row.rosterId));
      const team = byRoster.get(String(row.rosterId));
      const titleChange = r2((row.titleProb ?? 0) - (before?.titleProb ?? 0));
      const playoffChange = r2((row.playoffProb ?? 0) - (before?.playoffProb ?? 0));
      return {
        rosterId: String(row.rosterId),
        teamName: team?.teamName ?? null,
        isYou: Boolean(team?.isUser),
        titlePct: {
          before: r1(before?.titleProb), after: r1(row.titleProb),
          change: titleChange, material: Math.abs(titleChange) >= MATERIAL_PP,
        },
        playoffPct: {
          before: r1(before?.playoffProb), after: r1(row.playoffProb),
          change: playoffChange, material: Math.abs(playoffChange) >= MATERIAL_PP,
        },
      };
    });

    /* Your team always, plus whoever actually moved by more than the noise.
       A twelve-row table where nine rows read 0.00 is nine rows of tokens
       saying nothing, and it invites the coach to narrate noise as a finding. */
    const moved = rows.filter(
      (row) =>
        row.isYou ||
        Math.abs(row.titlePct.change) >= MATERIAL_PP ||
        Math.abs(row.playoffPct.change) >= MATERIAL_PP,
    );

    return {
      available: true,
      assumed: conditions.map((c) => ({
        week: c.week,
        matchupId: String(c.matchupId),
        winnerRosterId: String(c.winnerRosterId),
        winnerName: byRoster.get(String(c.winnerRosterId))?.teamName ?? null,
      })),
      sims,
      teams: moved,
      note:
        'change is in percentage points and is already computed; do not recompute it. '
        + 'Where material is false the change is inside the simulation\'s own margin: '
        + 'say it barely moves rather than quoting the number.',
    };
  },

  async get_week_forks(ctx, { week }) {
    if (!weekInRange(ctx, week)) return refuse('week_out_of_range', `week=${week}`);
    const result = fromEngine(await weekForks(ctx, week));
    if (isRefusal(result)) return result;
    if (!result.forks || result.forks.length === 0) return refuse('week_out_of_range', `week=${week}`);

    const byRoster = new Map((ctx.teams ?? []).map((t) => [String(t.rosterId), t]));
    return {
      available: true,
      week: result.week ?? week,
      mostInfluentialMatchupId:
        result.mostInfluentialGame != null ? String(result.mostInfluentialGame) : null,
      games: result.forks.map((fork) => ({
        matchupId: String(fork.matchupId),
        sides: (fork.sides ?? []).map((side) => ({
          rosterId: String(side.rosterId),
          teamName: byRoster.get(String(side.rosterId))?.teamName ?? side.teamName ?? null,
          playoffPctNow: r1(side.nowProb),
          playoffPctIfWin: r1(side.winProb),
          playoffPctIfLose: r1(side.lossProb),
        })),
      })),
    };
  },

  get_lineup(ctx, { rosterId, week }, { pricing } = {}) {
    const team = (ctx.teams ?? []).find((t) => String(t.rosterId) === String(rosterId));
    if (!team) return refuse('team_not_found', `roster=${rosterId}`);
    if (!weekInRange(ctx, week)) return refuse('week_out_of_range', `week=${week}`);

    const entry = matchupsForWeek(ctx, week).find(
      (m) => String(m.rosterId) === String(rosterId),
    );
    if (!entry) return refuse('not_scheduled', `roster=${rosterId} week=${week}`);

    const slots = (ctx.league?.rosterPositions ?? []).filter(
      (p) => !['BN', 'IR', 'TAXI'].includes(p),
    );
    const means = pricing?.playerMeans ?? {};
    const catalog = ctx.catalog ?? {};

    return {
      available: true,
      rosterId: String(rosterId),
      teamName: team.teamName,
      week,
      starters: (entry.starters ?? []).map((id, index) => {
        const entryPlayer = catalog[id];
        return {
          slot: slots[index] ?? 'FLEX',
          playerId: id || null,
          name: entryPlayer?.name ?? null,
          position: entryPlayer?.position ?? null,
          nflTeam: entryPlayer?.team ?? null,
          injuryStatus: entryPlayer?.injuryStatus ?? null,
          projected: r1(means[id]?.mean),
        };
      }),
    };
  },

  find_player(ctx, { query }) {
    const needle = String(query ?? '').trim().toLowerCase();
    if (needle.length < 2) return refuse('player_not_found', `query=${query}`);

    const catalog = ctx.catalog ?? {};
    const owner = new Map();
    for (const team of ctx.teams ?? []) {
      for (const id of team.players ?? []) owner.set(String(id), team);
    }

    const hits = [];
    for (const [id, team] of owner) {
      const player = catalog[id];
      const name = player?.name;
      if (!name || !name.toLowerCase().includes(needle)) continue;
      hits.push({
        playerId: id,
        name,
        position: player.position ?? null,
        nflTeam: player.team ?? null,
        rosteredBy: { rosterId: String(team.rosterId), teamName: team.teamName, isYou: Boolean(team.isUser) },
      });
      if (hits.length >= 12) break;
    }

    if (hits.length === 0) return refuse('player_not_found', `query=${query}`);
    return { available: true, players: hits };
  },

  analyze_trade(ctx, { partnerRosterId, give, get }) {
    if (ctx.league?.isDynasty) return refuse('dynasty_unpriced');
    const partner = (ctx.teams ?? []).find((t) => String(t.rosterId) === String(partnerRosterId));
    if (!partner) return refuse('team_not_found', `roster=${partnerRosterId}`);

    const result = fromEngine(
      analyzeTrade(ctx, { partnerRosterId, give: give ?? [], get: get ?? [] }),
    );
    if (isRefusal(result)) return result;

    const side = (s) => ({
      titlePctBefore: r1(s?.before?.titleProb ?? s?.titleBefore),
      titlePctAfter: r1(s?.after?.titleProb ?? s?.titleAfter),
      titleChange: r2(s?.deltaTitle ?? s?.titleDelta),
    });

    return {
      available: true,
      you: side(result.you),
      partner: { teamName: partner.teamName, ...side(result.partner) },
      dropsNeeded: result.dropsNeeded ?? null,
      warnings: result.warnings ?? [],
      note: 'titleChange is in percentage points, already computed. Do not recompute it.',
    };
  },
};

/**
 * Run one tool call.
 *
 * Never throws. A tool that blows up returns a refusal, because the model can
 * act on a sentence and cannot act on a stack trace - and because an exception
 * escaping into the loop ends the conversation rather than the answer.
 */
export async function runTool(name, args, ctx, deps = {}) {
  const handler = HANDLERS[name];
  if (!handler) return refuse('out_of_scope', `unknown tool ${name}`);
  try {
    return await handler(ctx, args ?? {}, deps);
  } catch (error) {
    console.error(`[coach] tool ${name} threw`, error);
    return refuse('out_of_scope', `${name} failed`);
  }
}
