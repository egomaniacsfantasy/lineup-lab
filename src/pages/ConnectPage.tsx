/**
 * The front door for anyone without a connected league. Sync-first:
 * pick a provider, type a username, and the whole league is priced.
 * The demo stays reachable, one click below.
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
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
        <p className="connect-page__subtitle">
          One username. Every matchup, trade, and waiver claim in your league
          priced like a betting market — updated as the week moves.
        </p>
      </section>

      <div className="connect-page__providers">
        <button
          className="connect-page__provider connect-page__provider--live"
          onClick={() => setShowWizard(true)}
          type="button"
        >
          <span className="connect-page__provider-mark connect-page__provider-mark--sleeper" aria-hidden="true">
            <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
            </svg>
          </span>
          <span className="connect-page__provider-copy">
            <span className="connect-page__provider-name">Sleeper</span>
            <span className="connect-page__provider-note">
              Connect with your username — no password, read-only
            </span>
          </span>
          <span className="connect-page__provider-action">Connect</span>
        </button>

        <div aria-disabled="true" className="connect-page__provider connect-page__provider--soon">
          <span className="connect-page__provider-mark" aria-hidden="true">
            <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M3.5 12h17M12 3.5c2.5 2.3 2.5 14.7 0 17M12 3.5c-2.5 2.3-2.5 14.7 0 17" />
            </svg>
          </span>
          <span className="connect-page__provider-copy">
            <span className="connect-page__provider-name">ESPN</span>
            <span className="connect-page__provider-note">
              On the roadmap — Sleeper first
            </span>
          </span>
          <span className="connect-page__provider-chip">Coming soon</span>
        </div>
      </div>

      <p className="connect-page__demo">
        No league handy?{' '}
        <Link className="connect-page__demo-link" to="/matchup">
          Explore the demo
        </Link>
      </p>
    </div>
  );
}
