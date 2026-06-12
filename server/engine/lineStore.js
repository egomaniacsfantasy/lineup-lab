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

/**
 * Append a pricing snapshot if its inputsHash differs from the latest
 * entry. Returns true when a new entry was recorded (the line moved).
 */
export function recordPricing(leagueId, pricing) {
  if (!pricing.available) return false;

  const history = readHistory(leagueId);
  const latest = history.at(-1);

  // (entries from before titleOdds existed get superseded once)
  if (latest && latest.inputsHash === pricing.inputsHash && latest.titleOdds) {
    return false;
  }

  history.push({
    computedAt: pricing.computedAt,
    inputsHash: pricing.inputsHash,
    projectionVersion: pricing.projectionVersion,
    week: pricing.week,
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
