import { useMemo, useState } from 'react';
import { ConnectWizard } from '../components/league/ConnectWizard';
import { LeagueFutures } from '../components/league/LeagueFutures';
import { LeagueSettings } from '../components/league/LeagueSettings';
import { MatchupSlate } from '../components/league/MatchupSlate';
import { TradeTargetTeaser } from '../components/league/TradeTargetTeaser';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { useSeasonMode } from '../hooks/useSeasonMode';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import {
  toLeagueConnection,
  toLeagueFutures,
  toWeekMatchups,
} from '../adapters/connectedLeague';
import {
  MOCK_LEAGUE,
  MOCK_LEAGUE_FUTURES,
  MOCK_TRADE_TARGET_GROUPS,
  MOCK_WEEK_MATCHUPS,
} from '../mocks';
import './LeaguePage.css';

export function LeaguePage() {
  const { mode } = useSeasonMode();
  const { stored, bootstrap, pricing, isLoading, error, connect, disconnect } =
    useLeagueConnection();
  const [showWizard, setShowWizard] = useState(false);

  const connected = useMemo(() => {
    if (!bootstrap) return null;
    return {
      connection: toLeagueConnection(bootstrap),
      futures: toLeagueFutures(bootstrap, pricing),
      slate: toWeekMatchups(bootstrap, pricing),
    };
  }, [bootstrap, pricing]);

  if (showWizard || (stored && !bootstrap && !isLoading && error)) {
    return (
      <div className="league-page">
        <h1 className="visually-hidden">League market</h1>
        {error ? <SeasonalNotice>{error}</SeasonalNotice> : null}
        <ConnectWizard
          onConnected={(connection) => {
            connect(connection);
            setShowWizard(false);
          }}
        />
      </div>
    );
  }

  if (stored && isLoading) {
    return (
      <div className="league-page">
        <h1 className="visually-hidden">League market</h1>
        <SeasonalNotice>Syncing your league from Sleeper…</SeasonalNotice>
      </div>
    );
  }

  const connection = connected?.connection ?? MOCK_LEAGUE;
  const futures = connected?.futures ?? MOCK_LEAGUE_FUTURES;
  const slate = connected?.slate ?? MOCK_WEEK_MATCHUPS;

  return (
    <div className="league-page">
      <h1 className="visually-hidden">League market</h1>

      {!connected ? (
        <SeasonalNotice>
          You&apos;re viewing the demo league.{' '}
          <button
            className="league-page__connect-link"
            onClick={() => setShowWizard(true)}
            type="button"
          >
            Connect your Sleeper league
          </button>{' '}
          to price your real season.
        </SeasonalNotice>
      ) : null}

      {connected && !pricing?.available ? (
        <SeasonalNotice>
          Futures and matchup odds are provisional (scoring history only) until
          projections are imported.
        </SeasonalNotice>
      ) : null}

      {connected && pricing?.available && pricing.scoringNote ? (
        <SeasonalNotice>{pricing.scoringNote}</SeasonalNotice>
      ) : null}

      <LeagueFutures
        currentWeek={connection.currentWeek}
        futures={futures}
        leagueName={connection.leagueName}
        mode={connected ? 'inseason' : mode}
        scoringFormat={connection.scoringFormat}
        totalTeams={connection.totalTeams}
      />

      {!connected ? <TradeTargetTeaser groups={MOCK_TRADE_TARGET_GROUPS} /> : null}

      {slate.length > 0 ? (
        <MatchupSlate currentWeek={connection.currentWeek} matchups={slate} />
      ) : null}

      <div className="league-page__settings">
        <LeagueSettings
          connection={connection}
          onDisconnect={() => {
            disconnect();
            setShowWizard(true);
          }}
          onSwitchLeague={() => setShowWizard(true)}
        />
      </div>
    </div>
  );
}
