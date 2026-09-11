/**
 * Live in-game injury status from ESPN's public injuries feed, used to LOCK a
 * player who is RULED OUT to their current points in the live sim — the same
 * treatment a finished game gets (f = 0 -> mean = points so far, variance = 0),
 * but for a SINGLE player instead of the whole team.
 *
 * ESPN updates this feed in real time: a player ruled out DURING a game shows
 * status "Out" within a cycle (verified live). Only status "Out" locks a player —
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
  // Strip combining diacritical marks (U+0300–U+036F) after NFD decomposition.
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

let _cache = { at: 0, out: new Set(), refreshing: false };

async function fetchInjuries() {
  const res = await fetch(INJURIES_URL);
  if (!res.ok) throw new Error(`injuries ${res.status}`);
  const data = await res.json();
  const out = new Set();
  for (const grp of data?.injuries ?? []) {
    for (const inj of grp?.injuries ?? []) {
      // ONLY a definitive "Out" locks the player. Questionable/Doubtful/Active do
      // not — those players may still produce, so they project as normal.
      if (inj?.status !== 'Out') continue;
      const ath = inj?.athlete ?? {};
      const nm = ath?.displayName;
      const tm = ath?.team?.abbreviation;
      if (nm) out.add(keyOf(nm, tm));
    }
  }
  return out;
}

function refreshInBackground() {
  if (_cache.refreshing) return;
  _cache.refreshing = true;
  fetchInjuries()
    .then((out) => {
      _cache = { at: Date.now(), out, refreshing: false };
    })
    .catch((err) => {
      _cache.refreshing = false;
      console.error('[nflInjuries] refresh failed:', err?.message ?? err);
    });
}

/** Set of "normName|team" keys for players currently ruled OUT. Never blocks —
 *  returns the last known set and refreshes in the background. */
export function getRuledOut() {
  if (Date.now() - _cache.at >= TTL_MS) refreshInBackground();
  return _cache.out;
}

/** Fresh read for the live cycle (one shared scrape per cycle, worth the wait).
 *  Returns the ruled-out set. */
export async function awaitNflInjuries() {
  try {
    const out = await fetchInjuries();
    _cache = { at: Date.now(), out, refreshing: false };
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
