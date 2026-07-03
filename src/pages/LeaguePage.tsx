import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConnectWizard } from '../components/league/ConnectWizard';
import { EspnConnect } from '../components/league/EspnConnect';
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
import { PROVIDER_LABEL } from '../utils/provider';
import './ConnectPage.css';
import './LeaguePage.css';

type ConnectFlow = 'none' | 'sleeper' | 'espn';

function flowFromHash(hash: string): ConnectFlow | null {
  if (hash === '#connect-sleeper') return 'sleeper';
  if (hash === '#connect-espn') return 'espn';
  return null;
}

export function LeaguePage() {
  const { mode } = useSeasonMode();
  const { stored, bootstrap, pricing, isLoading, error, connect, disconnect } =
    useLeagueConnection();
  const location = useLocation();
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(false);
  const [manualFlow, setManualFlow] = useState<ConnectFlow>('none');
  const isReconnectState = Boolean(stored && !bootstrap && !isLoading && error);
  const hasConnectHash = location.hash.startsWith('#connect');
  const isWizardOpen =
    showWizard || hasConnectHash || isReconnectState;
  const flow =
    flowFromHash(location.hash) ??
    (showWizard || hasConnectHash || isReconnectState ? manualFlow : 'none');

  const connected = useMemo(() => {
    if (!bootstrap) return null;
    return {
      connection: toLeagueConnection(bootstrap),
      futures: toLeagueFutures(bootstrap, pricing),
      slate: toWeekMatchups(bootstrap, pricing),
    };
  }, [bootstrap, pricing]);

  if (isWizardOpen) {
    return (
      <div className="league-page">
        <h1 className="visually-hidden">League market</h1>
        {error ? <SeasonalNotice>{error}</SeasonalNotice> : null}
        {flow === 'none' ? (
          <div className="connect-page">
            <section className="connect-page__hero">
              <p className="connect-page__kicker">
                {isReconnectState ? 'Reconnect your league' : 'Welcome to Olympus'}
              </p>
              <h1 className="connect-page__title">Choose a provider</h1>
            </section>

            <div className="connect-page__providers">
              <button
                className="connect-page__provider connect-page__provider--live"
                onClick={() => setManualFlow('sleeper')}
                type="button"
              >
                <img
                  alt="Sleeper"
                  className="connect-page__provider-logo connect-page__provider-logo--sleeper"
                  src="/providers/sleeper-logo.png"
                />
                <span className="connect-page__provider-action">Connect</span>
              </button>

              <button
                className="connect-page__provider connect-page__provider--live"
                onClick={() => setManualFlow('espn')}
                type="button"
              >
                <img
                  alt="ESPN"
                  className="connect-page__provider-logo connect-page__provider-logo--espn"
                  src="/providers/espn-logo.png"
                />
                <span className="connect-page__provider-action">Connect</span>
              </button>
            </div>

            <p className="connect-page__demo">
              Read-only. We never ask for your password.
            </p>
          </div>
        ) : null}

        {flow === 'sleeper' ? (
          <ConnectWizard
            onConnected={(connection) => {
              connect(connection);
              setManualFlow('none');
              setShowWizard(false);
              navigate('/league', { replace: true });
            }}
          />
        ) : null}

        {flow === 'espn' ? (
          <EspnConnect
            onConnected={(connection) => {
              connect(connection);
              setManualFlow('none');
              setShowWizard(false);
              navigate('/league', { replace: true });
            }}
          />
        ) : null}

        {flow !== 'none' ? (
          <button
            className="connect-page__back"
            onClick={() => {
              if (flowFromHash(location.hash) !== null) {
                navigate('/league#connect', { replace: true });
                return;
              }
              setManualFlow('none');
            }}
            type="button"
          >
            Back to providers
          </button>
        ) : null}
      </div>
    );
  }

  if (stored && isLoading) {
    return (
      <div className="league-page">
        <h1 className="visually-hidden">League market</h1>
        <SeasonalNotice>
          Syncing your league from {PROVIDER_LABEL[stored.provider]}…
        </SeasonalNotice>
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
            onClick={() => {
              setManualFlow('none');
              setShowWizard(true);
            }}
            type="button"
          >
            Connect a league
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
        playoffTeams={bootstrap?.league.playoffTeams ?? 6}
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
            // Removes this league; the context falls through to the next saved
            // one, or to the demo prompt when none remain.
            disconnect();
          }}
          onSwitchLeague={() => {
            setManualFlow('none');
            setShowWizard(true);
          }}
        />
      </div>
    </div>
  );
}
