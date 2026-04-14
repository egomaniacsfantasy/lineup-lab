import { useState } from 'react';
import { ConnectWizard } from '../components/league/ConnectWizard';
import { LeagueFutures } from '../components/league/LeagueFutures';
import { LeagueSettings } from '../components/league/LeagueSettings';
import { MatchupSlate } from '../components/league/MatchupSlate';
import { TradeTargetTeaser } from '../components/league/TradeTargetTeaser';
import { useSeasonMode } from '../hooks/useSeasonMode';
import {
  MOCK_LEAGUE,
  MOCK_LEAGUE_FUTURES,
  MOCK_TRADE_TARGET_GROUPS,
  MOCK_WEEK_MATCHUPS,
} from '../mocks';
import type { LeagueConnection } from '../types';
import './LeaguePage.css';

export function LeaguePage() {
  const { mode } = useSeasonMode();
  const [connection, setConnection] = useState<LeagueConnection | null>(MOCK_LEAGUE);
  const [showWizard, setShowWizard] = useState(false);

  if (!connection || showWizard) {
    return (
      <div className="league-page">
        <h1 className="visually-hidden">League market</h1>
        <ConnectWizard
          onConnected={(nextConnection) => {
            setConnection(nextConnection);
            setShowWizard(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="league-page">
      <h1 className="visually-hidden">League market</h1>

      <LeagueFutures
        currentWeek={connection.currentWeek}
        futures={MOCK_LEAGUE_FUTURES}
        leagueName={connection.leagueName}
        mode={mode}
        scoringFormat={connection.scoringFormat}
        totalTeams={connection.totalTeams}
      />

      <TradeTargetTeaser groups={MOCK_TRADE_TARGET_GROUPS} />

      <MatchupSlate
        currentWeek={connection.currentWeek}
        matchups={MOCK_WEEK_MATCHUPS}
      />

      <div className="league-page__settings">
        <LeagueSettings
          connection={connection}
          onDisconnect={() => {
            setConnection(null);
            setShowWizard(true);
          }}
          onSwitchLeague={() => setShowWizard(true)}
        />
      </div>
    </div>
  );
}
