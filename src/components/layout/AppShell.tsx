import { useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AmbientCanvas } from '../matchup/AmbientCanvas';
import { WelcomeCard } from '../onboarding/WelcomeCard';
import { PlayerDetailProvider } from '../../contexts/PlayerDetailContext';
import { useSeasonMode } from '../../hooks/useSeasonMode';
import { AppHeader } from './AppHeader';
import { BottomTabBar } from './BottomTabBar';
import './AppShell.css';

const WELCOME_STORAGE_KEY = 'og.lineuplab.welcome.dismissed';

export function AppShell() {
  const location = useLocation();
  const { mode } = useSeasonMode();
  const [isWelcomeManuallyOpen, setIsWelcomeManuallyOpen] = useState(false);
  const [isWelcomeDismissedThisSession, setIsWelcomeDismissedThisSession] = useState(false);
  const shouldAutoOpenWelcome =
    mode === 'inseason' &&
    location.pathname === '/matchup' &&
    !isWelcomeDismissedThisSession &&
    window.localStorage.getItem(WELCOME_STORAGE_KEY) !== 'true';
  const isWelcomeOpen = isWelcomeManuallyOpen || shouldAutoOpenWelcome;

  const dismissWelcome = useCallback(() => {
    window.localStorage.setItem(WELCOME_STORAGE_KEY, 'true');
    setIsWelcomeDismissedThisSession(true);
    setIsWelcomeManuallyOpen(false);
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AmbientCanvas />
      <PlayerDetailProvider>
        <AppHeader onOpenWelcome={() => setIsWelcomeManuallyOpen(true)} />
        <main className="app-content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <WelcomeCard isOpen={isWelcomeOpen} onDismiss={dismissWelcome} />
      </PlayerDetailProvider>
      <BottomTabBar />
    </div>
  );
}
