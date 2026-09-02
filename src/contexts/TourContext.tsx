/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ProductTour } from '../components/onboarding/ProductTour';
import { shouldOfferTour } from '../components/onboarding/tourStorage';
import { useAuth } from './AuthContext';
import { useLeagueConnection } from './LeagueConnectionContext';

interface TourValue {
  /** Open the tour on purpose. Never consults whether it has been seen. */
  start: () => void;
  open: boolean;
}

const TourContext = createContext<TourValue>({ start: () => undefined, open: false });

export function useTour() {
  return useContext(TourContext);
}

/**
 * Let the page settle before offering the tour.
 *
 * The first stop points at a price that does not exist until pricing lands,
 * and the ring is measured from a live bounding box, so opening the instant a
 * league appears spotlights a rectangle that is about to move. This is also
 * simple courtesy: arriving somewhere and being immediately talked at is the
 * thing everybody hates about onboarding.
 */
const SETTLE_MS = 1_200;

/** The tour walks the Hub, so the tour starts on the Hub. */
const TOUR_HOME = '/matchup';

/* Long enough for the Hub to mount and paint when the tour is started from
   another tab. Shorter than SETTLE_MS because nothing is being fetched: the
   league is already loaded, this is one route change. */
const ROUTE_SETTLE_MS = 400;

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [offered, setOffered] = useState(false);
  const { session } = useAuth();
  const { bootstrap } = useLeagueConnection();
  const navigate = useNavigate();
  const location = useLocation();

  /* Starting from More or from the League tab has to land on the Hub first.
     Every stop points at something the Hub renders, and a tour opened over a
     page with none of them would go straight to its own empty state - which
     is a replay button that appears not to work. */
  const start = useCallback(() => {
    setOffered(true);
    if (location.pathname === TOUR_HOME) {
      setOpen(true);
      return;
    }
    navigate(TOUR_HOME);
    window.setTimeout(() => setOpen(true), ROUTE_SETTLE_MS);
  }, [location.pathname, navigate]);

  /* ?tour=1 forces it open, which is the only way to review or measure it.
     Every other route to the tour needs a real session and a real league, and
     the design fixtures have neither by design. Same convention as the other
     fixture flags (?staleSeason, ?syncing, ?dynasty). */
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('tour')) return;
    setOffered(true);
    setOpen(true);
  }, [location.search]);

  /* Offered once, and only to somebody who is signed in with a league behind
     them. The signed-in check is doing real work beyond politeness: the
     design fixtures render the whole app without a session, and a tour that
     opened itself over them would break every rendered test in the suite by
     covering the thing under test. */
  useEffect(() => {
    if (offered || open) return undefined;
    if (!session || !bootstrap) return undefined;
    if (location.pathname !== TOUR_HOME) return undefined;
    if (!shouldOfferTour()) return undefined;

    const timer = window.setTimeout(() => {
      setOffered(true);
      setOpen(true);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [bootstrap, location.pathname, offered, open, session]);

  const value = useMemo(() => ({ start, open }), [open, start]);

  return (
    <TourContext.Provider value={value}>
      {children}
      <ProductTour onClose={() => setOpen(false)} open={open} />
    </TourContext.Provider>
  );
}
