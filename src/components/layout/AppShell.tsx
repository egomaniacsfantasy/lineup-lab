import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AmbientCanvas } from '../matchup/AmbientCanvas';
import { PlayerDetailProvider } from '../../contexts/PlayerDetailContext';
import { ScoutingCardProvider } from '../../contexts/ScoutingCardContext';
import { useOddsFormat } from '../../contexts/OddsFormatContext';
import { PlayerVotePrompt } from '../votes/PlayerVotePrompt';
import { canPromptForVote } from '../../utils/playerVotes';
import { AppHeader } from './AppHeader';
import { BottomTabBar } from './BottomTabBar';
import { PricingCurtain } from './PricingCurtain';
import './AppShell.css';

/* The prompt is not allowed to open the session. It waits until someone has
   actually used the app for a while and has moved between screens, which
   means they finished whatever they came to do rather than being blocked on
   the way in. Combined with the once-a-day cap in canPromptForVote, a normal
   visit is never interrupted. */
const ENGAGED_MS = 75_000;
const MIN_NAVIGATIONS = 2;

function useVotePromptTrigger() {
  const location = useLocation();
  const [navigations, setNavigations] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setNavigations((current) => current + 1);
  }, [location.pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => setEngaged(true), ENGAGED_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (open || !engaged || navigations < MIN_NAVIGATIONS) return;
    if (!canPromptForVote()) return;
    setOpen(true);
  }, [engaged, navigations, open]);

  return { open, close: () => setOpen(false) };
}

export function AppShell() {
  const { format } = useOddsFormat();
  const votePrompt = useVotePromptTrigger();

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
      <PlayerVotePrompt onClose={votePrompt.close} open={votePrompt.open} />
    </div>
  );
}
