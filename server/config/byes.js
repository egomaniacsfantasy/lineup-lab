/**
 * NFL bye weeks, per team, for the current season. Built from the NFL pipeline's
 * full schedule (data/game_dates_2026.csv -> byes2026.json: every team misses
 * exactly one of weeks 1-18). Team codes are normalized to the site's canonical
 * (LA -> LAR, etc.) so a roster player's team resolves directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTeam } from '../projections/importer.js';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'byes2026.json');

let _byes = null;
function load() {
  if (_byes) return _byes;
  _byes = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const [team, week] of Object.entries(raw.byes ?? {})) {
      _byes.set(normalizeTeam(team) || team, Number(week));
    }
  } catch (err) {
    console.error('[byes] could not load bye weeks', err);
  }
  return _byes;
}

/** The team's bye week this season, or null (unknown team / free agent). */
export function byeWeekFor(team) {
  if (!team) return null;
  const t = normalizeTeam(team) || String(team).toUpperCase();
  return load().get(t) ?? null;
}

/** Fill `byeWeek` on every catalog player that lacks one (mutates, returns it). */
export function withByeWeeks(players) {
  for (const p of Object.values(players ?? {})) {
    if (p && (p.byeWeek == null)) p.byeWeek = byeWeekFor(p.team);
  }
  return players;
}
