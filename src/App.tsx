import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SeasonModeProvider } from './contexts/SeasonModeContext';
import { LeagueConnectionProvider } from './contexts/LeagueConnectionContext';
import { DraftPage } from './pages/DraftPage';
import { LeaguePage } from './pages/LeaguePage';
import { MatchupPage } from './pages/MatchupPage';
import { RankingsPage } from './pages/RankingsPage';
import { SeasonPage } from './pages/SeasonPage';
import { TradePage } from './pages/TradePage';
import { AdminProjectionsPage } from './pages/AdminProjectionsPage';

export default function App() {
  return (
    <SeasonModeProvider>
      <LeagueConnectionProvider>
        <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/matchup" replace />} />
          <Route path="/matchup" element={<MatchupPage />} />
          <Route path="/season" element={<SeasonPage />} />
          <Route path="/draft" element={<DraftPage />} />
          <Route path="/trade" element={<TradePage />} />
          <Route path="/rankings" element={<RankingsPage />} />
          <Route path="/league" element={<LeaguePage />} />
          <Route path="/admin/projections" element={<AdminProjectionsPage />} />
        </Route>
        </Routes>
      </LeagueConnectionProvider>
    </SeasonModeProvider>
  );
}
