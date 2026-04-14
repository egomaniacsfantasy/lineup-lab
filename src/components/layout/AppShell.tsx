import { Outlet } from 'react-router-dom';
import { AmbientCanvas } from '../matchup/AmbientCanvas';
import { AppHeader } from './AppHeader';
import { BottomTabBar } from './BottomTabBar';
import { OddsStrip } from './OddsStrip';
import './AppShell.css';

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AmbientCanvas />
      <OddsStrip />
      <AppHeader />
      <main className="app-content" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
