import { Outlet } from 'react-router-dom';
import { AmbientCanvas } from '../matchup/AmbientCanvas';
import { PlayerDetailProvider } from '../../contexts/PlayerDetailContext';
import { ScoutingCardProvider } from '../../contexts/ScoutingCardContext';
import { useOddsFormat } from '../../contexts/OddsFormatContext';
import { AppHeader } from './AppHeader';
import { BottomTabBar } from './BottomTabBar';
import { PricingCurtain } from './PricingCurtain';
import './AppShell.css';

export function AppShell() {
  const { format } = useOddsFormat();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AmbientCanvas />
      <PlayerDetailProvider>
        <ScoutingCardProvider>
          <AppHeader />
          {/* keyed on odds format: flipping it re-renders every number */}
          <main className="app-content" id="main-content" key={format} tabIndex={-1}>
            <Outlet />
          </main>
        </ScoutingCardProvider>
      </PlayerDetailProvider>
      <BottomTabBar />
      <PricingCurtain />
    </div>
  );
}
