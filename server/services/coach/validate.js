/**
 * The last line of defence: nothing reaches the reader that the tools did not
 * say.
 *
 * `validateTradeNarration` in tradeRationale.js already does this for a short
 * templated sentence, with a hand-curated allowlist of capitalised words. That
 * does not survive free-form prose - a coach writes "Beating Hermes is worth",
 * and a word allowlist would have to learn every verb in English.
 *
 * So the two halves are checked differently:
 *
 *  - NUMBERS are checked strictly, by allowlist. Every numeral in the answer
 *    must appear in a tool result. This is the check that matters: a fabricated
 *    2.8 is indistinguishable from a real one to a reader, and it is the exact
 *    thing this product cannot afford to ship.
 *
 *  - NAMES are checked by inversion. Rather than asking "is every capitalised
 *    word allowed", which is unanswerable, it asks "does the answer talk about
 *    a team in this league that no tool returned". That catches the real
 *    failure - quoting odds for a team nobody looked up - with no word list and
 *    no false positives on ordinary English.
 *
 * The result is a list of violations rather than a boolean, so a failure can be
 * logged, retried once with the violations fed back, and only then fall through
 * to a templated answer.
 */

/* Built from char codes, not written out: the copy scan walks server/ too and
   cannot tell a definition of the character from a use of it. The trade
   narrator does the same thing for the same reason. */
const EM_DASH = String.fromCharCode(8212);
const SPACED_EN_DASH = ` ${String.fromCharCode(8211)} `;

/**
 * Every rendering of every number a tool returned.
 *
 * A tool says 40.8; the answer may reasonably write 40.8, 40.80 or 41. All
 * three are the same claim, and rejecting the rounded form would fail honest
 * answers while catching nothing. What it will not accept is 42.
 */
export function collectAllowedNumbers(value, set = new Set()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const abs = Math.abs(value);
    set.add(String(abs));
    set.add(abs.toFixed(0));
    set.add(abs.toFixed(1));
    set.add(abs.toFixed(2));
    set.add(String(Math.round(abs)));
    /* Trailing zeros cut both ways: a tool's 2.80 and an answer's 2.8. */
    set.add(String(Number(abs.toFixed(1))));
    set.add(String(Number(abs.toFixed(2))));
  } else if (typeof value === 'string') {
    /* Numbers inside strings a tool produced - a record like "7-5", a price
       like "+118" - are things the tool said, so they are allowed. */
    for (const match of value.match(/\d+(?:\.\d+)?/g) ?? []) {
      set.add(match);
      set.add(String(Number(match)));
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectAllowedNumbers(item, set));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectAllowedNumbers(item, set));
  }
  return set;
}

/** Which teams a set of tool results actually spoke about. */
function rosterIdsMentioned(value, set = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => rosterIdsMentioned(item, set));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'rosterId' || key === 'winnerRosterId') && item != null) set.add(String(item));
      if (key === 'teamName' && typeof item === 'string') set.add(`name:${item}`);
      rosterIdsMentioned(item, set);
    }
  }
  return set;
}

/**
 * Check an answer against what the tools returned.
 *
 * `extraNumbers` is for values the coach may legitimately state that no tool
 * produced - the current week, the season - passed in rather than guessed at
 * here, so this file never decides what is true.
 */
export function validateAnswer(text, { toolResults = [], teams = [], extraNumbers = [] } = {}) {
  const violations = [];

  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, violations: [{ type: 'empty', value: '' }] };
  }

  /* House style, same rule the copy scan enforces on every other surface. */
  if (text.includes(EM_DASH) || text.includes(SPACED_EN_DASH)) {
    violations.push({ type: 'em_dash', value: EM_DASH });
  }

  const allowed = collectAllowedNumbers(toolResults);
  extraNumbers.forEach((n) => collectAllowedNumbers(n, allowed));

  for (const raw of text.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (allowed.has(raw) || allowed.has(String(Number(raw)))) continue;
    violations.push({ type: 'number', value: raw });
  }

  /* The inverted name check. A league team named in the answer whose roster
     no tool touched means the coach is talking about a team it never looked
     up, which is where invented standings come from. */
  const mentionedIds = rosterIdsMentioned(toolResults);
  for (const team of teams) {
    if (!team?.teamName) continue;
    if (!text.includes(team.teamName)) continue;
    const known =
      mentionedIds.has(String(team.rosterId)) || mentionedIds.has(`name:${team.teamName}`);
    if (!known) violations.push({ type: 'team', value: team.teamName });
  }

  return { ok: violations.length === 0, violations };
}

/**
 * What to send back to the model when its answer failed.
 *
 * Names the offending values, because "try again" produces the same answer and
 * a second bill.
 */
export function violationFeedback(violations) {
  const numbers = violations.filter((v) => v.type === 'number').map((v) => v.value);
  const teams = violations.filter((v) => v.type === 'team').map((v) => v.value);
  const parts = [];
  if (numbers.length > 0) {
    parts.push(
      `These numbers are not in any tool result: ${numbers.join(', ')}. Use only numbers a tool returned, or call the tool that would produce them.`,
    );
  }
  if (teams.length > 0) {
    parts.push(
      `You wrote about ${teams.join(', ')} without looking them up. Call a tool for them or leave them out.`,
    );
  }
  if (violations.some((v) => v.type === 'em_dash')) {
    parts.push('Do not use em dashes.');
  }
  if (violations.some((v) => v.type === 'empty')) parts.push('The answer was empty.');
  return parts.join(' ');
}
