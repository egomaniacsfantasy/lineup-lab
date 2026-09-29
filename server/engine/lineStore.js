/**
 * Line history, keyed by league. Every computed Line carries inputsHash;
 * a new hash = the line moved (projections, lineups, or scores changed).
 * This append-only stream is the diff source for "line moved" surfacing
 * and the seam for the future push-notification engine.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'lines',
);

/**
 * How long a league's line history is kept.
 *
 * It used to be "the last 200 entries", full stop, which was a promise the app
 * could not keep. The futures chart offers Week, Month and Season, and the Time
 * Machine offers any prior week; at the rate entries were being written, 200 of
 * them was eleven days. So Month showed eleven days, Season showed eleven days,
 * and "opened at" quietly meant "the oldest snapshot that survived" rather than
 * where the book actually opened.
 *
 * Retention now matches what the UI offers: a full season, by time rather than
 * by count. A season is about 480 entries at the cadence in scheduler.js and
 * roughly 1.4 KB each, so under a megabyte per league per season against a 1 GB
 * disk. The count cap that remains is a safety net for a pathological writer,
 * set far above a real season, and it never trims the opener.
 */
const RETAIN_MS = 400 * 24 * 60 * 60_000;
const MAX_ENTRIES = 20_000;

function fileFor(leagueId) {
  return path.join(DIR, `${leagueId}.json`);
}

export function readHistory(leagueId) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(leagueId), 'utf8'));
  } catch {
    return [];
  }
}

function inferTrigger(latest, pricing) {
  if (!latest) return 'line opened';
  if (latest.week !== pricing.week) return 'weekly roll';
  if (latest.projectionVersion !== pricing.projectionVersion) return 'projection update';
  return 'reprice';
}

/**
 * Append a pricing snapshot if its inputsHash differs from the latest
 * entry. Returns true when a new entry was recorded (the line moved).
 */
export function recordPricing(leagueId, pricing, { force = false } = {}) {
  if (!pricing.available) return false;

  const history = readHistory(leagueId);
  const latest = history.at(-1);
  const trigger = force ? 'scheduled' : inferTrigger(latest, pricing);

  // Skip duplicate views (same inputsHash) — UNLESS force, which the 6h
  // scheduler uses to lay down a timestamped point even when nothing moved.
  // (entries from before titleOdds existed get superseded once)
  if (!force && latest && latest.inputsHash === pricing.inputsHash && latest.titleOdds) {
    return false;
  }

  const futuresByRoster = new Map((pricing.futures ?? []).map((f) => [String(f.rosterId), f]));
  const winProbByRoster = new Map();
  for (const line of pricing.lines ?? []) {
    for (const [rosterId, side] of Object.entries(line.sides ?? {})) {
      winProbByRoster.set(rosterId, side.winProbability);
    }
  }

  history.push({
    computedAt: pricing.computedAt,
    inputsHash: pricing.inputsHash,
    projectionVersion: pricing.projectionVersion,
    week: pricing.week,
    trigger,
    lines: pricing.lines.map((line) => ({
      matchupId: line.matchupId,
      sides: Object.fromEntries(
        Object.entries(line.sides).map(([rosterId, side]) => [
          rosterId,
          {
            moneyline: side.moneyline,
            winProbability: side.winProbability,
            /* The closing spread and projected score, kept so a result can
               later be graded against the number we actually posted.
               Without them, "did this team beat the number" is not a question
               the stored history can answer: a moneyline alone only says who
               was favoured, which a final score already tells you, so any
               record built from it collapses back into plain wins and losses.
               These are two numbers per side per snapshot and they cannot be
               recovered after the fact — a week that passes unstored is a week
               that can never be graded. */
            spread: side.spread,
            projection: side.projection,
          },
        ]),
      ),
    })),
    titleOdds: Object.fromEntries(
      (pricing.futures ?? []).map((f) => [f.rosterId, f.championOdds]),
    ),
    playoffOdds: Object.fromEntries(
      (pricing.futures ?? []).map((f) => [f.rosterId, f.playoffOdds]),
    ),
    // Raw probabilities too — American odds clamp at 98.5%, so a 100% playoff
    // team would round-trip to 98.5% in the charts. Charts prefer these.
    titleProb: Object.fromEntries(
      (pricing.futures ?? []).map((f) => [f.rosterId, f.titleProb]),
    ),
    playoffProb: Object.fromEntries(
      (pricing.futures ?? []).map((f) => [f.rosterId, f.playoffProb]),
    ),
    teamSnapshots: [...futuresByRoster.entries()].map(([rosterId, future]) => ({
      rosterId: Number(rosterId),
      teamName: future.teamName,
      computedAt: pricing.computedAt,
      trigger,
      winProbThisWeek: winProbByRoster.get(rosterId) ?? null,
      titleOdds: future.championOdds,
      playoffOdds: future.playoffOdds,
    })),
  });

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(leagueId), JSON.stringify(retain(history)));
  // TODO(notifications): this is where a line-movement event would be
  // emitted to the push-notification engine.
  return true;
}

/**
 * Drop what is older than a season, and never drop the opening entry.
 *
 * The opener is what "opened at / now" and Your Ticket's multiple are measured
 * from. Trimmed away, those numbers do not go missing - they silently start
 * quoting a later snapshot as the open, which is worse, because it still reads
 * like a fact.
 */
export function retain(history, now = Date.now()) {
  if (history.length === 0) return history;
  const cutoff = now - RETAIN_MS;
  const kept = history.filter((entry) => (entry.computedAt ?? 0) >= cutoff);
  const opener = history[0];
  const withOpener = kept[0] === opener ? kept : [opener, ...kept];
  return withOpener.length > MAX_ENTRIES
    ? [opener, ...withOpener.slice(-(MAX_ENTRIES - 1))]
    : withOpener;
}

/**
 * Title price by week — the latest recorded title odds per week, oldest
 * week first. Real history only: weeks with no snapshot simply aren't
 * in the series.
 */
export function readTitleHistory(leagueId) {
  const byWeek = new Map();
  for (const entry of readHistory(leagueId)) {
    if (!entry.titleOdds || entry.week == null) continue;
    byWeek.set(entry.week, { week: entry.week, odds: entry.titleOdds, at: entry.computedAt });
  }
  return [...byWeek.values()].sort((a, b) => a.week - b.week);
}
