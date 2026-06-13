/**
 * The front door for anyone without a connected league. Sync-first:
 * pick a provider, type a username, and the whole league is priced.
 * The demo stays reachable, one click below.
 */
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ConnectWizard } from '../components/league/ConnectWizard';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import './ConnectPage.css';

export function ConnectPage() {
  const { stored, connect } = useLeagueConnection();
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(false);

  // already connected — straight to the board
  if (stored) {
    return <Navigate replace to="/matchup" />;
  }

  if (showWizard) {
    return (
      <div className="connect-page">
        <ConnectWizard
          onConnected={(connection) => {
            connect(connection);
            navigate('/matchup', { replace: true });
          }}
        />
        <button
          className="connect-page__back"
          onClick={() => setShowWizard(false)}
          type="button"
        >
          Back to providers
        </button>
      </div>
    );
  }

  return (
    <div className="connect-page">
      <section className="connect-page__hero">
        <p className="connect-page__kicker">Welcome to Olympus</p>
        <h1 className="connect-page__title">Sync a league to begin</h1>
      </section>

      <div className="connect-page__providers">
        <button
          className="connect-page__provider connect-page__provider--live"
          onClick={() => setShowWizard(true)}
          type="button"
        >
          <img
            alt="Sleeper"
            className="connect-page__provider-logo connect-page__provider-logo--sleeper"
            src="/providers/sleeper-logo.png"
          />
          <span className="connect-page__provider-action">Connect</span>
        </button>

        <div aria-disabled="true" className="connect-page__provider connect-page__provider--soon">
          <img
            alt="ESPN"
            className="connect-page__provider-logo connect-page__provider-logo--espn"
            src="/providers/espn-logo.png"
          />
          <span className="connect-page__provider-chip">Coming soon</span>
        </div>
      </div>

      <p className="connect-page__demo">
        Read-only. We never ask for your password.
      </p>
    </div>
  );
}
