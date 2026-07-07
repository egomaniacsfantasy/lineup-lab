import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SeasonModeProvider } from './contexts/SeasonModeContext';
import {
  LeagueConnectionProvider,
  useLeagueConnection,
} from './contexts/LeagueConnectionContext';
import { OddsFormatProvider } from './contexts/OddsFormatContext';
import { ModelOverlayProvider } from './contexts/ModelOverlayContext';
import { AuthLanding } from './pages/AuthLanding';
import { ConnectPage } from './pages/ConnectPage';
import { DraftPage } from './pages/DraftPage';
import { DemoPage, LandingPage } from './pages/LandingPage';
import { LeaguePage } from './pages/LeaguePage';
import { MatchupPage } from './pages/MatchupPage';
import { MorePage } from './pages/MorePage';
import { MyBoardPage } from './pages/MyBoardPage';
import { SeasonPage } from './pages/SeasonPage';
import { TradePage } from './pages/TradePage';
import { AdminProjectionsPage } from './pages/AdminProjectionsPage';
import { ProjectionsPage } from './pages/ProjectionsPage';

/** League sync is the front door: no connection yet → /connect. */
function HomeGate() {
  const { stored } = useLeagueConnection();
  return <Navigate replace to={stored ? '/matchup' : '/connect'} />;
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
      <ModelOverlayProvider>
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
                <Route path="/draft" element={<DraftPage />} />
                <Route path="/trade" element={<Navigate replace to="/market?view=deals" />} />
                <Route path="/market" element={<TradePage />} />
                <Route path="/rankings" element={<MyBoardPage />} />
                <Route path="/league" element={<LeaguePage />} />
                <Route path="/more" element={<MorePage />} />
              </Route>
              <Route path="/projections" element={<ProjectionsPage />} />
              <Route path="/admin/projections" element={<AdminProjectionsPage />} />
            </Route>
          </Routes>
          </OddsFormatProvider>
        </LeagueConnectionProvider>
      </ModelOverlayProvider>
    </SeasonModeProvider>
  );
}

function PublicRoutes() {
  return (
    <SeasonModeProvider>
      <ModelOverlayProvider>
        <LeagueConnectionProvider>
          <OddsFormatProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/signin" element={<AuthLanding />} />
              <Route element={<AppShell />}>
                <Route path="/demo" element={<DemoPage />} />
              </Route>
              <Route path="*" element={<AuthLanding />} />
            </Routes>
          </OddsFormatProvider>
        </LeagueConnectionProvider>
      </ModelOverlayProvider>
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

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
