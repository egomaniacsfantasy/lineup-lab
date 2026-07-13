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

const MAX_ENTRIES = 200;

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
          { moneyline: side.moneyline, winProbability: side.winProbability },
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
  fs.writeFileSync(
    fileFor(leagueId),
    JSON.stringify(history.slice(-MAX_ENTRIES)),
  );
  // TODO(notifications): this is where a line-movement event would be
  // emitted to the push-notification engine.
  return true;
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
