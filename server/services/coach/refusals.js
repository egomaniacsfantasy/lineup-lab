/**
 * What the coach is allowed to say when it cannot answer.
 *
 * The single most dangerous thing an assistant over this engine can do is
 * answer a question the data does not support. Not because it errors - because
 * it doesn't. It produces a fluent, plausible, wrong number, and this product's
 * whole claim is that its numbers are defensible.
 *
 * So refusing is not left to the model's judgement. Every tool returns either
 * a result or `{ available: false, reason }`, the reason maps to an exact
 * sentence here, and the system prompt's rule is "if a tool says unavailable,
 * say its message and stop." That turns a judgement call - which is where small
 * models fail worst - into transcription, which they do reliably.
 *
 * The reasons are not invented for this file. `no_projections`, `team_not_found`
 * and friends are what the engine already returns (engine.js, leverage.js); this
 * gives them a voice rather than a second vocabulary to drift from.
 */

/**
 * reason -> the sentence the coach says, verbatim.
 *
 * Each one says what is missing and, where there is one, what would fix it.
 * None of them apologises, and none of them speculates about the answer it is
 * declining to give: "it's probably a small edge" is the failure this file
 * exists to prevent, dressed as helpfulness.
 */
export const REFUSALS = {
  no_projections:
    'This league has no projections loaded yet, so nothing here is priced. It fills in once the season data syncs.',
  pricing_unavailable:
    'The book has not opened for this league yet. Give the sync a minute and ask again.',
  team_not_found:
    'I could not find that team in this league.',
  player_not_found:
    'I could not find that player on any roster in this league.',
  week_out_of_range:
    'That week is outside this league’s schedule.',
  not_scheduled:
    'That team has no game scheduled that week.',
  matchup_not_found:
    'I could not find that matchup.',
  pre_draft:
    'This league has not drafted yet, so there are no rosters to price.',
  /* The engine deliberately does not value picks or future seasons. The coach
     inherits that refusal rather than papering over it, which is the same
     position the dynasty banner takes in the UI. */
  dynasty_unpriced:
    'This is a dynasty league. The engine does not value picks or future seasons yet, so every number I have is for this season alone.',
  season_over:
    'This league’s season is finished, so there is nothing left to condition on.',
  /* The catch-all, and the one that matters most. Anything the tools cannot
     reach - injury news, waiver-wire reads, another league, the weather - lands
     here rather than being answered from general knowledge. */
  out_of_scope:
    'I can only answer from this league’s own numbers, and that is not something I can price.',
};

/** Every reason string the coach knows how to say. */
export const REFUSAL_REASONS = Object.freeze(Object.keys(REFUSALS));

/**
 * Build the refusal a tool returns.
 *
 * `detail` is for the log, never for the user: it can carry a roster id or a
 * week number that would mean nothing in a sentence and would be one more
 * number the model might repeat.
 */
export function refuse(reason, detail = null) {
  const message = REFUSALS[reason];
  if (!message) {
    /* An unknown reason must not become a blank refusal, which reads to the
       model as "no message, improvise one". */
    return { available: false, reason: 'out_of_scope', message: REFUSALS.out_of_scope, detail: reason };
  }
  return detail == null
    ? { available: false, reason, message }
    : { available: false, reason, message, detail };
}

/**
 * Give an engine result a voice.
 *
 * The engine returns `{ available: false, reason }` with no message, because
 * it has no opinion about wording. Anything that comes back unavailable is
 * routed through here so the coach never sees a bare reason code, and so a
 * reason the engine grows that this file has not learned yet degrades to
 * out_of_scope rather than to silence.
 */
export function fromEngine(result) {
  if (result && result.available === false) return refuse(result.reason ?? 'out_of_scope');
  return result;
}

export function isRefusal(value) {
  return Boolean(value && value.available === false);
}
