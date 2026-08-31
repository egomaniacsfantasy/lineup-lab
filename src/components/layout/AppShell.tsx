import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AmbientCanvas } from '../matchup/AmbientCanvas';
import { PlayerDetailProvider } from '../../contexts/PlayerDetailContext';
import { ScoutingCardProvider } from '../../contexts/ScoutingCardContext';
import { useOddsFormat } from '../../contexts/OddsFormatContext';
import { PlayerVotePrompt } from '../votes/PlayerVotePrompt';
import { canPromptForVote } from '../../utils/playerVotes';
import { AppHeader } from './AppHeader';
import { StaleSeasonNotice } from './StaleSeasonNotice';
import { BottomTabBar } from './BottomTabBar';
import { PricingCurtain } from './PricingCurtain';
import { AppErrorBoundary } from '../support/AppErrorBoundary';
import { BugReportProvider, useBugReport } from '../support/BugReportProvider';
import './AppShell.css';

/* Crowdsourced ranking is parked: we will not have the voter volume to make
   it meaningful yet. The prompt, its queue and its selection logic all stay
   in the tree, but nothing triggers them. Flip PROMPT_ENABLED to true to
   bring it back.

   The prompt is not allowed to open the session. It waits until someone has
   actually used the app for a while and has moved between screens, which
   means they finished whatever they came to do rather than being blocked on
   the way in. Combined with the once-a-day cap in canPromptForVote, a normal
   visit is never interrupted. */
const PROMPT_ENABLED = false;
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
    if (!PROMPT_ENABLED) return;
    if (open || !engaged || navigations < MIN_NAVIGATIONS) return;
    if (!canPromptForVote()) return;
    setOpen(true);
  }, [engaged, navigations, open]);

  return { open, close: () => setOpen(false) };
}

/* The boundary is a class (React offers no hook for catching render errors) and
   the opener is a hook, so this bridges the two. Only the routed content is
   wrapped: a crash in a page should leave the header and tabs alive so there is
   still a way out of it. */
function GuardedContent({ children }: { children: React.ReactNode }) {
  const { open } = useBugReport();
  return <AppErrorBoundary onReport={open}>{children}</AppErrorBoundary>;
}

export function AppShell() {
  const { format } = useOddsFormat();
  const votePrompt = useVotePromptTrigger();

  return (
    <BugReportProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AmbientCanvas />
        <PlayerDetailProvider>
          <ScoutingCardProvider>
            <AppHeader />
            {/* Inside the scroller, not beside it.

                As a flex child of the shell this sat at y=0 with the header
                fixed on top of it at z-index 21, so the warning that every
                number below is a year old was itself invisible. A fixed
                header contributes no height to the flex column; .app-content
                is the only thing that already accounts for it. */}
            <main className="app-content" id="main-content" key={format} tabIndex={-1}>
              <StaleSeasonNotice />
              <GuardedContent>
                <Outlet />
              </GuardedContent>
            </main>
          </ScoutingCardProvider>
        </PlayerDetailProvider>
        <BottomTabBar />
        <PricingCurtain />
        <PlayerVotePrompt onClose={votePrompt.close} open={votePrompt.open} />
      </div>
    </BugReportProvider>
  );
}
