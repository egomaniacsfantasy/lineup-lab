import { useCallback, useEffect, useState } from 'react';
import { removeLeg, toggleLeg, type ParlayLeg } from '../utils/parlay';

/**
 * The slip, kept across a reload and scoped to one league and one week.
 *
 * Keyed by week on purpose: a parlay is a claim about a specific set of games,
 * and carrying last week's legs into this week's board would leave selections
 * lit on cards they do not belong to.
 *
 * A leg keeps the price it was added at rather than tracking the board. That
 * is what a slip is: you took that number. It also means a slip screenshotted
 * on Tuesday still reconciles on Sunday, which matters more here than
 * freshness, because the whole point is to settle it with someone later.
 */

const KEY_PREFIX = 'oddsgods:slip';

function storageKey(leagueId: string, week: number) {
  return `${KEY_PREFIX}:${leagueId}:${week}`;
}

/* Every read and write is guarded. Storage throws outright in a private
   window and in embedded webviews with site data switched off, and a slip is
   never worth taking the page down for. */
export function readSlip(leagueId: string, week: number): ParlayLeg[] {
  try {
    const raw = window.localStorage.getItem(storageKey(leagueId, week));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ParlayLeg[]) : [];
  } catch {
    return [];
  }
}

export function writeSlip(leagueId: string, week: number, legs: readonly ParlayLeg[]) {
  try {
    if (legs.length === 0) window.localStorage.removeItem(storageKey(leagueId, week));
    else window.localStorage.setItem(storageKey(leagueId, week), JSON.stringify(legs));
  } catch {
    /* The slip stays correct on screen; it just will not survive a reload. */
  }
}

export function useBetSlip(leagueId: string | null, week: number | null) {
  const [legs, setLegs] = useState<ParlayLeg[]>([]);

  useEffect(() => {
    if (!leagueId || week == null) {
      setLegs([]);
      return;
    }
    setLegs(readSlip(leagueId, week));
  }, [leagueId, week]);

  const persist = useCallback(
    (next: ParlayLeg[]) => {
      setLegs(next);
      if (leagueId && week != null) writeSlip(leagueId, week, next);
    },
    [leagueId, week],
  );

  const toggle = useCallback(
    (leg: ParlayLeg) => persist(toggleLeg(legs, leg)),
    [legs, persist],
  );
  const drop = useCallback((key: string) => persist(removeLeg(legs, key)), [legs, persist]);
  const clear = useCallback(() => persist([]), [persist]);

  return { legs, toggle, drop, clear };
}
