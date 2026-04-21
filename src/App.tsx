import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SeasonModeProvider } from './contexts/SeasonModeContext';
import { useSeasonMode } from './hooks/useSeasonMode';
import { DraftPage } from './pages/DraftPage';
import { LeaguePage } from './pages/LeaguePage';
import { MatchupPage } from './pages/MatchupPage';
import { RankingsPage } from './pages/RankingsPage';
import { SeasonPage } from './pages/SeasonPage';
import { TradePage } from './pages/TradePage';

function DraftTradeRoute() {
  const { mode } = useSeasonMode();
  const location = useLocation();

  if (mode === 'inseason' && location.pathname === '/draft') {
    return <Navigate to="/trade" replace />;
  }

  if (mode === 'preseason' && location.pathname === '/trade') {
    return <Navigate to="/draft" replace />;
  }

  return mode === 'preseason' ? <DraftPage /> : <TradePage />;
}

export default function App() {
  return (
    <SeasonModeProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/matchup" replace />} />
          <Route path="/matchup" element={<MatchupPage />} />
          <Route path="/season" element={<SeasonPage />} />
          <Route path="/draft" element={<DraftTradeRoute />} />
          <Route path="/trade" element={<DraftTradeRoute />} />
          <Route path="/rankings" element={<RankingsPage />} />
          <Route path="/league" element={<LeaguePage />} />
        </Route>
      </Routes>
    </SeasonModeProvider>
  );
}
