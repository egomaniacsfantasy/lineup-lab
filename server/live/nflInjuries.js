/**
 * Live in-game injury status from ESPN's public injuries feed, used to LOCK a
 * player who is RULED OUT to their current points in the live sim - the same
 * treatment a finished game gets (f = 0 -> mean = points so far, variance = 0),
 * but for a SINGLE player instead of the whole team.
 *
 * ESPN updates this feed in real time: a player ruled out DURING a game shows
 * status "Out" within a cycle (verified live). Only status "Out" locks a player -
 * "Questionable"/"Doubtful" may still play, so they keep projecting normally. It
 * also covers a player ruled out AFTER the last projection run (pregame): their
 * current points are 0, so they lock to 0 in live mode.
 *
 * Non-blocking cache, same shape as nflGameStatus: getRuledOut() returns the last
 * known set immediately (empty on cold start = no locks = normal pricing);
 * awaitNflInjuries() does one fresh read for the whole live cycle.
 */
import { normalizeTeam } from './nflGameStatus.js';

const INJURIES_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
const TTL_MS = 90_000;

const _SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/** Normalize a player name so ESPN's displayName matches the league catalog's
 *  name: strip accents, lowercase, drop '.'/'\'' and trailing generational
 *  suffixes. Mirrors the Python injury_loader's _norm. */
export function normalizePlayerName(name) {
  if (!name) return '';
  // Strip combining diacritical marks (U+0300-U+036F) after NFD decomposition.
  let s = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.toLowerCase().trim().replace(/[.']/g, '');
  const parts = s.split(/\s+/).filter(Boolean);
  while (parts.length && _SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  return parts.join(' ');
}

/** A ruled-out player is keyed by normalized name + team, so the live cycle can
 *  match it against the catalog (which carries name + team) across providers. */
function keyOf(name, team) {
  return `${normalizePlayerName(name)}|${normalizeTeam(team) ?? ''}`;
}

let _cache = { at: 0, out: new Set(), statuses: new Map(), refreshing: false };

/** Normalize ESPN's status wording to the short designation the UI shows and the
 *  engine understands: "Injured Reserve"/"...Designated to Return" -> "IR",
 *  "Physically Unable to Perform" -> "PUP". Out/Questionable/Doubtful pass through.
 *  "Active" (listed but cleared) is treated as no designation by the caller. */
function normalizeDesignation(status) {
  if (!status) return null;
  const s = String(status).trim();
  if (/reserve/i.test(s)) return 'IR';
  if (/unable to perform|^pup$/i.test(s)) return 'PUP';
  return s;
}

async function fetchInjuries() {
  // Same hard cap as the scoreboard read: a stalled ESPN injuries response must not
  // hang the live cycle. On abort/error the caller keeps the last cached set.
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(INJURIES_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`injuries ${res.status}`);
    const data = await res.json();
    const out = new Set();          // status exactly "Out" -> live-locks the player
    const statuses = new Map();     // key -> display designation (for the injury badge)
    for (const grp of data?.injuries ?? []) {
      for (const inj of grp?.injuries ?? []) {
        const ath = inj?.athlete ?? {};
        const nm = ath?.displayName;
        const tm = ath?.team?.abbreviation;
        if (!nm) continue;
        const key = keyOf(nm, tm);
        // ONLY a definitive "Out" locks the player in the LIVE sim. Questionable/
        // Doubtful/Active do not - those players may still produce.
        if (inj?.status === 'Out') out.add(key);
        // The badge shows every real designation EXCEPT "Active" (listed but cleared,
        // which is not an injury worth surfacing).
        if (inj?.status && inj.status !== 'Active') {
          const d = normalizeDesignation(inj.status);
          if (d) statuses.set(key, d);
        }
      }
    }
    return { out, statuses };
  } finally {
    clearTimeout(to);
  }
}

function refreshInBackground() {
  if (_cache.refreshing) return;
  _cache.refreshing = true;
  fetchInjuries()
    .then(({ out, statuses }) => {
      _cache = { at: Date.now(), out, statuses, refreshing: false };
    })
    .catch((err) => {
      _cache.refreshing = false;
      console.error('[nflInjuries] refresh failed:', err?.message ?? err);
    });
}

/** Set of "normName|team" keys for players currently ruled OUT. Never blocks -
 *  returns the last known set and refreshes in the background. */
export function getRuledOut() {
  if (Date.now() - _cache.at >= TTL_MS) refreshInBackground();
  return _cache.out;
}

/** Map of "normName|team" -> display designation (Out/Questionable/Doubtful/IR/PUP)
 *  for every currently-injured player. Never blocks. Powers the injury badge. */
export function getInjuryStatuses() {
  if (Date.now() - _cache.at >= TTL_MS) refreshInBackground();
  return _cache.statuses;
}

/** This player's current injury designation, or null when not on the report. */
export function getInjuryStatus(name, team, statuses = _cache.statuses) {
  if (!name || !statuses || statuses.size === 0) return null;
  return statuses.get(keyOf(name, team)) ?? null;
}

/** Fresh read for the live cycle (one shared scrape per cycle, worth the wait).
 *  Returns the ruled-out set. */
export async function awaitNflInjuries() {
  try {
    const { out, statuses } = await fetchInjuries();
    _cache = { at: Date.now(), out, statuses, refreshing: false };
  } catch (err) {
    console.error('[nflInjuries] await failed:', err?.message ?? err);
  }
  return _cache.out;
}

/** True if this player (by catalog name + team) is currently ruled OUT. */
export function isRuledOut(name, team, ruledOut = _cache.out) {
  if (!name || !ruledOut || ruledOut.size === 0) return false;
  return ruledOut.has(keyOf(name, team));
}
