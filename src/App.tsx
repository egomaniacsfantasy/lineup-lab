import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SeasonModeProvider } from './contexts/SeasonModeContext';
import {
  LeagueConnectionProvider,
  useLeagueConnection,
} from './contexts/LeagueConnectionContext';
import { ConnectPage } from './pages/ConnectPage';
import { DraftPage } from './pages/DraftPage';
import { LeaguePage } from './pages/LeaguePage';
import { MatchupPage } from './pages/MatchupPage';
import { MorePage } from './pages/MorePage';
import { RankingsPage } from './pages/RankingsPage';
import { SeasonPage } from './pages/SeasonPage';
import { TradePage } from './pages/TradePage';
import { AdminProjectionsPage } from './pages/AdminProjectionsPage';

/** League sync is the front door: no connection yet → /connect. */
function HomeGate() {
  const { stored } = useLeagueConnection();
  return <Navigate replace to={stored ? '/matchup' : '/connect'} />;
}

export default function App() {
  return (
    <SeasonModeProvider>
      <LeagueConnectionProvider>
        <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeGate />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/matchup" element={<MatchupPage />} />
          <Route path="/season" element={<SeasonPage />} />
          <Route path="/draft" element={<DraftPage />} />
          <Route path="/trade" element={<TradePage />} />
          <Route path="/rankings" element={<RankingsPage />} />
          <Route path="/league" element={<LeaguePage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/admin/projections" element={<AdminProjectionsPage />} />
        </Route>
        </Routes>
      </LeagueConnectionProvider>
    </SeasonModeProvider>
  );
}
