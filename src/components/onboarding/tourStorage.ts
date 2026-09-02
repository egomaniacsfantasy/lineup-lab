/**
 * Which tours this browser has already been offered.
 *
 * Per tour, not per app. Each tab explains itself the first time you arrive
 * on it, so "seen" has to be recorded per tab or the Hub's tour would spend
 * the one flag everybody else needed.
 *
 * Versioned, so a tour that changes materially can be offered once more
 * without also re-offering it every time a word is edited: bump TOUR_VERSION
 * deliberately, or leave it alone and nobody is interrupted twice.
 *
 * Every read and write is guarded. A private window, cleared site data or a
 * browser set to block storage throws on access rather than returning null,
 * and an onboarding tour is the last thing that should be able to take the
 * app down with it. The failure mode of storage being unavailable is that a
 * tour offers itself once per session, which is the right way round.
 */

export const TOUR_VERSION = 1;

const KEY = 'og.tour.state.v2';

export interface TourSeen {
  /** When the tour was finished, or null if it never was. */
  completedAt: number | null;
  /** When it was skipped, or null. Skipping counts as seen. */
  skippedAt: number | null;
}

export interface TourState {
  version: number;
  seen: Record<string, TourSeen>;
}

const EMPTY: TourState = { version: 0, seen: {} };

export function readTourState(): TourState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<TourState>;
    const version = typeof parsed.version === 'number' ? parsed.version : 0;
    const seen: Record<string, TourSeen> = {};
    /* Rebuilt field by field rather than trusted wholesale. This is parsed
       from a string a user can edit, and everything downstream reads it as
       numbers. */
    if (parsed.seen && typeof parsed.seen === 'object') {
      for (const [id, entry] of Object.entries(parsed.seen)) {
        const record = entry as Partial<TourSeen> | null;
        seen[id] = {
          completedAt: typeof record?.completedAt === 'number' ? record.completedAt : null,
          skippedAt: typeof record?.skippedAt === 'number' ? record.skippedAt : null,
        };
      }
    }
    return { version, seen };
  } catch {
    return EMPTY;
  }
}

function write(state: TourState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable. Tours stay offered for this session only.
  }
}

function record(tourId: string, entry: TourSeen) {
  const current = readTourState();
  write({
    version: TOUR_VERSION,
    /* Everything already recorded is carried forward. Writing only the tour
       that just closed would forget every other tab and re-offer all of
       them, which is worse than never recording anything. */
    seen: { ...current.seen, [tourId]: entry },
  });
}

export function markTourCompleted(tourId: string) {
  record(tourId, { completedAt: Date.now(), skippedAt: null });
}

export function markTourSkipped(tourId: string) {
  record(tourId, { completedAt: null, skippedAt: Date.now() });
}

/**
 * Whether to offer this tour unasked.
 *
 * Skipping counts. Someone who dismissed it told us something, and asking
 * again tomorrow is how a helpful thing becomes an annoying one. Replaying a
 * tour on purpose always works and never consults this.
 */
export function shouldOfferTour(tourId: string, state: TourState = readTourState()): boolean {
  if (state.version < TOUR_VERSION) return true;
  const entry = state.seen[tourId];
  if (!entry) return true;
  return entry.completedAt == null && entry.skippedAt == null;
}
