import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { MobileGate } from './components/layout/MobileGate';
import { MobileHub } from './components/layout/MobileHub';
import { useIsPhone } from './hooks/useIsPhone';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SeasonModeProvider } from './contexts/SeasonModeContext';
import {
  LeagueConnectionProvider,
  useLeagueConnection,
} from './contexts/LeagueConnectionContext';
import { OddsFormatProvider } from './contexts/OddsFormatContext';
import { AuthLanding } from './pages/AuthLanding';
import { ConnectPage } from './pages/ConnectPage';
import { DemoPage, LandingPage } from './pages/LandingPage';
import { DesignBoardRowPage } from './pages/DesignBoardRowPage';
import { DesignChartPage } from './pages/DesignChartPage';
import { DesignFixturePage } from './pages/DesignFixturePage';
import { EspnConnect } from './components/league/EspnConnect';
import { BugReportDialog } from './components/support/BugReportDialog';
import { LeaguePage } from './pages/LeaguePage';
import { MatchupPage } from './pages/MatchupPage';
import { MorePage } from './pages/MorePage';
import { MyBoardPage } from './pages/MyBoardPage';
import { SeasonPage } from './pages/SeasonPage';
import { TradePage } from './pages/TradePage';
import { AdminProjectionsPage } from './pages/AdminProjectionsPage';

/** League sync is the front door: no connection yet → /connect. */
function HomeGate() {
  const { stored } = useLeagueConnection();
  return <Navigate replace to={stored ? '/matchup' : '/connect'} />;
}

/**
 * Every path that is not a route still has to land somewhere.
 *
 * This tree had no catch-all, and a Routes with nothing to match renders
 * NOTHING: no error, no redirect, a page painted in the background colour and
 * left there. /demo was the case that surfaced it, because /demo is a real
 * route in the signed-out tree and was never added to this one, so following a
 * marketing link while already signed in produced a blank screen. But the bug
 * was never about /demo. Any typo, any stale bookmark, any link to a route
 * that has since been renamed did the same thing, and did it silently.
 */
function NotFoundGate() {
  return <Navigate replace to="/" />;
}

/** There is no demo: every app tab requires a synced league. */
function RequireLeague() {
  const { stored } = useLeagueConnection();
  if (!stored) return <Navigate replace to="/connect" />;
  return <Outlet />;
}

function AppRoutes() {
  return (
    <SeasonModeProvider>
        <LeagueConnectionProvider>
          <OddsFormatProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeGate />} />
              <Route path="/signin" element={<HomeGate />} />
              <Route path="/connect" element={<ConnectPage />} />
              <Route element={<RequireLeague />}>
                <Route path="/matchup" element={<MatchupPage />} />
                <Route path="/season" element={<SeasonPage />} />
                <Route path="/trade" element={<Navigate replace to="/market?view=deals" />} />
                <Route path="/market" element={<TradePage />} />
                <Route path="/rankings" element={<MyBoardPage />} />
                <Route path="/league" element={<LeaguePage />} />
                <Route path="/trade-analyzer" element={<Navigate replace to="/market?view=deals" />} />
                <Route path="/more" element={<MorePage />} />
              </Route>
              <Route path="/projections" element={<Navigate replace to="/rankings?view=sheet" />} />
              <Route path="/admin/projections" element={<AdminProjectionsPage />} />
              {/* The demo is a marketing destination, so it answers for
                  everybody. A link that works for a stranger and breaks for
                  the people who already signed up is the worst version of it,
                  and that is exactly what it was. */}
              <Route path="/demo" element={<DemoPage />} />
            </Route>
            <Route path="*" element={<NotFoundGate />} />
          </Routes>
          </OddsFormatProvider>
        </LeagueConnectionProvider>
    </SeasonModeProvider>
  );
}

function PublicRoutes() {
  return (
    <SeasonModeProvider>
        <LeagueConnectionProvider>
          <OddsFormatProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/signin" element={<AuthLanding />} />
              <Route element={<AppShell />}>
                <Route path="/demo" element={<DemoPage />} />
                {/* Dev-only: the real /connect is auth-gated, so the ESPN flow
                    could not be reviewed at all without credentials. */}
                {import.meta.env.DEV ? (
                  <Route
                    path="/design/espn-connect"
                    element={
                      <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
                        {/* ?private=1 opens straight on the private-league
                            branch. Reaching it for real needs ESPN to answer
                            401 for a league id we do not have, so the branch
                            that decides whether to ask somebody for their ESPN
                            password could only be reviewed by borrowing a
                            private league and waiting on a network call. */}
                        <EspnConnect
                          initialPaste={
                            new URLSearchParams(window.location.search).has('private')
                              ? 'design-private'
                              : ''
                          }
                          onConnected={() => undefined}
                        />
                      </div>
                    }
                  />
                ) : null}
                {/* The connect screen is auth-gated, so it could not be reviewed
                    or measured without credentials — which is how it shipped
                    scrolling on both axes. */}
                {import.meta.env.DEV ? <Route path="/design/connect" element={<ConnectPage />} /> : null}
                {/* The report dialog is reachable only from a signed-in account
                    menu or after a crash, so without this it could not be
                    looked at or measured at all. That is exactly how the
                    connect screen above shipped scrolling on both axes. */}
                {import.meta.env.DEV ? (
                  <Route
                    path="/design/bug-report"
                    element={<BugReportDialog onClose={() => undefined} />}
                  />
                ) : null}
                {import.meta.env.DEV ? <Route path="/design/board-row/:variant" element={<DesignBoardRowPage />} /> : null}
                {import.meta.env.DEV ? <Route path="/design/chart/:variant" element={<DesignChartPage />} /> : null}
                {import.meta.env.DEV ? <Route path="/design/:scene" element={<DesignFixturePage />} /> : null}
              </Route>
              {/* Outside the shell, because the real thing is.
              
                  A signed-in phone gets MobileHub on its own: no header, no
                  tab bar, no shell. Reviewing it inside the shell would put a
                  five-tab bar under a screen whose whole premise is that there
                  is only one tab, which is the fixture disagreeing with the
                  product about the thing being designed. */}
              {import.meta.env.DEV ? (
                <Route
                  path="/design/mobile-hub"
                  element={<DesignFixturePage scene="mobile-hub" />}
                />
              ) : null}
              <Route path="*" element={<AuthLanding />} />
            </Routes>
          </OddsFormatProvider>
        </LeagueConnectionProvider>
    </SeasonModeProvider>
  );
}

/** Nothing in the app is reachable without an account. */
function AuthGate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="app-boot" aria-hidden="true" />;
  if (!session) return <PublicRoutes />;
  return <AppRoutes />;
}

/**
 * A phone, once it belongs to somebody.
 *
 * The gate turns an ANONYMOUS phone away, and that is still right: the desktop
 * layout is a book that does not fit one, and serving a cramped version of it
 * lets people decide for themselves that the product is bad.
 *
 * It was wrong for a phone with an account. The funnel ended in a wall: make
 * an account on your phone and the next thing you saw was the pitch again,
 * which is the product asking for a commitment and then refusing to honour it.
 *
 * So a signed-in phone gets the short version of the Hub. The providers mount
 * only on that branch, so an anonymous phone still costs no session fetch and
 * no league bootstrap, which is what putting the gate above them bought.
 */
function PhoneApp() {
  const { session, loading } = useAuth();
  if (loading) return <div className="app-boot" aria-hidden="true" />;
  if (!session) return <MobileGate />;

  return (
    <SeasonModeProvider>
      <LeagueConnectionProvider>
        <OddsFormatProvider>
          <MobileHub />
        </OddsFormatProvider>
      </LeagueConnectionProvider>
    </SeasonModeProvider>
  );
}

export default function App() {
  const phone = useIsPhone();

  return (
    <AuthProvider>
      {phone ? <PhoneApp /> : <AuthGate />}
    </AuthProvider>
  );
}
