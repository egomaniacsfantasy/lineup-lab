/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ProductTour } from '../components/onboarding/ProductTour';
import { TOURS, tourById, tourForPath } from '../components/onboarding/tourSteps';
import { markTourSkipped, shouldOfferTour } from '../components/onboarding/tourStorage';
import { useAuth } from './AuthContext';
import { useLeagueConnection } from './LeagueConnectionContext';

interface TourValue {
  /** Replay the tour for the tab currently on screen. */
  start: () => void;
  /**
   * Always true now: start() falls back to the Hub's tour on a tab that has
   * none, so the menu item always leads somewhere. Kept so a caller can stop
   * relying on that without a signature change.
   */
  available: boolean;
  open: boolean;
}

const TourContext = createContext<TourValue>({
  start: () => undefined,
  available: false,
  open: false,
});

export function useTour() {
  return useContext(TourContext);
}

/**
 * Let the page settle before offering a tour.
 *
 * Stops are measured from live bounding boxes and the first one usually
 * points at a price that does not exist until pricing lands, so opening the
 * instant a tab mounts spotlights a rectangle that is about to move. It is
 * also simple courtesy: arriving somewhere and being immediately talked at is
 * the thing everybody hates about onboarding.
 */
const SETTLE_MS = 1_200;

/* Long enough for a tab to mount when the tour is replayed from a tab that
   has none. Shorter than SETTLE_MS because nothing is being fetched: the
   league is already loaded, this is one route change. */
const ROUTE_SETTLE_MS = 400;

/**
 * One tour per tab, offered the first time you arrive on that tab.
 *
 * It used to be a single Hub tour that had to describe the other three tabs
 * from a distance. Each tab now explains itself when you get there, which is
 * both shorter and the only moment the explanation can point at anything.
 */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  /* Replays and the fixture flag are explicit; the once-per-tab offer is not. */
  const [explicit, setExplicit] = useState(false);
  const { session } = useAuth();
  const { bootstrap } = useLeagueConnection();
  const location = useLocation();
  const navigate = useNavigate();

  /* ?tour=<id> names a tour outright, which is how the design fixtures reach
     one: they live at /design/matchup, not /matchup, so resolving by route
     finds nothing there. ?tour on its own means "whatever this tab has". */
  const forcedId = new URLSearchParams(location.search).get('tour');
  const forcedTour = forcedId ? tourById(forcedId) : null;
  const routeTour = tourForPath(location.pathname);
  const tour = forcedTour ?? routeTour;
  const tourId = tour?.id ?? null;

  /**
   * Replay the tour for the tab on screen.
   *
   * On a tab with no tour of its own - More, Connect - it goes to the Hub and
   * plays that one rather than doing nothing. A menu item that silently does
   * nothing is the same dead end as the row that said "Tap to pick your team"
   * and then did not.
   */
  const start = useCallback(() => {
    setExplicit(true);
    if (tour) {
      setOpen(true);
      return;
    }
    const fallback = TOURS[0];
    navigate(fallback.path);
    /* The Hub has to mount before the tour can find anything on it. The
       overlay then keeps looking for its stops for several seconds, so this
       only has to cover the route change. */
    window.setTimeout(() => setOpen(true), ROUTE_SETTLE_MS);
  }, [navigate, tour]);

  /* Forcing it open is the only way to review or measure a tour. Every other
     route in needs a real session and a real league, and the design fixtures
     have neither by design. Same convention as the other fixture flags
     (?staleSeason, ?syncing). */
  useEffect(() => {
    if (forcedId == null || !tourId) return;
    setExplicit(true);
    setOpen(true);
  }, [forcedId, tourId]);

  /* Offered once per tab, and only to somebody signed in with a league behind
     them. The signed-in check is doing real work beyond politeness: the
     design fixtures render the whole app without a session, and a tour that
     opened itself over them would break every rendered test in the suite by
     covering the thing under test. */
  const offeredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (open || !tourId) return undefined;
    if (!session || !bootstrap) return undefined;
    if (offeredRef.current.has(tourId)) return undefined;
    if (!shouldOfferTour(tourId)) return undefined;

    const timer = window.setTimeout(() => {
      offeredRef.current.add(tourId);
      setExplicit(false);
      setOpen(true);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [bootstrap, open, session, tourId]);

  /* Leaving the tab closes the tour, because every one of its stops points at
     something on the page just left. Closing counts as skipping: they chose
     to go somewhere else, and a tour that re-offered itself on every return
     would follow somebody around the app. */
  const openTourIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && tourId) openTourIdRef.current = tourId;
  }, [open, tourId]);

  useEffect(() => {
    const active = openTourIdRef.current;
    if (!open || !active || active === tourId) return;
    markTourSkipped(active);
    offeredRef.current.add(active);
    setOpen(false);
  }, [open, tourId]);

  const value = useMemo(
    () => ({ start, available: true, open }),
    [open, start, tour],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <ProductTour explicit={explicit} onClose={() => setOpen(false)} open={open} tour={tour} />
    </TourContext.Provider>
  );
}
