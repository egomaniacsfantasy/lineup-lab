/**
 * Whether this browser has been offered the tour already.
 *
 * Versioned, so a tour that changes materially can be offered once more
 * without also re-offering it every time a word is edited: bump TOUR_VERSION
 * deliberately, or leave it alone and nobody is interrupted twice.
 *
 * Every read and write is guarded. A private window, cleared site data or a
 * browser set to block storage throws on access rather than returning null,
 * and an onboarding tour is the last thing that should be able to take the
 * app down with it. The failure mode of storage being unavailable is that the
 * tour offers itself once per session, which is the right way round.
 */

export const TOUR_VERSION = 1;

const KEY = 'og.tour.state.v1';

export interface TourState {
  version: number;
  /** When the tour was finished, or null if it never was. */
  completedAt: number | null;
  /** When it was skipped, or null. Skipping counts as seen. */
  skippedAt: number | null;
}

const EMPTY: TourState = { version: 0, completedAt: null, skippedAt: null };

export function readTourState(): TourState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<TourState>;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      completedAt: typeof parsed.completedAt === 'number' ? parsed.completedAt : null,
      skippedAt: typeof parsed.skippedAt === 'number' ? parsed.skippedAt : null,
    };
  } catch {
    return EMPTY;
  }
}

function write(state: TourState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable. The tour stays offered for this session only.
  }
}

export function markTourCompleted() {
  write({ version: TOUR_VERSION, completedAt: Date.now(), skippedAt: null });
}

export function markTourSkipped() {
  write({ version: TOUR_VERSION, completedAt: null, skippedAt: Date.now() });
}

/**
 * Whether to offer the tour unasked.
 *
 * Skipping counts. Someone who dismissed it told us something, and asking
 * again tomorrow is how a helpful thing becomes an annoying one. Replaying it
 * on purpose from the account menu always works and never consults this.
 */
export function shouldOfferTour(state: TourState = readTourState()): boolean {
  if (state.version >= TOUR_VERSION && (state.completedAt != null || state.skippedAt != null)) {
    return false;
  }
  return true;
}
