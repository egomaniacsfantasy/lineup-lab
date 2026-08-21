/**
 * The front door for anyone without a connected league. Sync-first:
 * pick a provider, type a username, and the whole league is priced.
 * The demo stays reachable, one click below.
 */
import { MobileNotice } from '../components/layout/MobileNotice';
import { ProviderMark } from '../components/league/ProviderMark';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ConnectWizard } from '../components/league/ConnectWizard';
import { EspnConnect } from '../components/league/EspnConnect';
import { useAuth } from '../contexts/AuthContext';
import { isEspnPluginRegistered } from '../utils/espnNativeAuth';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import './ConnectPage.css';

declare const __BUILD_STAMP__: string | undefined;
const buildStamp = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'dev';

export function ConnectPage() {
  const { stored, connect } = useLeagueConnection();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasEspnCapture = searchParams.has('espnCapture') || searchParams.has('espnLeagueId');
  const [flow, setFlow] = useState<'none' | 'sleeper' | 'espn'>(hasEspnCapture ? 'espn' : 'none');

  // already connected — straight to the board
  if (stored) {
    return <Navigate replace to="/matchup" />;
  }

  if (flow !== 'none') {
    return (
      <div className="connect-page">
        {flow === 'sleeper' ? (
          <ConnectWizard
            onConnected={(connection) => {
              connect(connection);
              navigate('/matchup', { replace: true });
            }}
          />
        ) : (
          <EspnConnect
            initialLeagueInput={searchParams.get('espnLeagueId') ?? ''}
            initialPaste={searchParams.get('espnCapture') ?? ''}
            initialSeason={searchParams.get('espnSeason') ?? ''}
            onConnected={(connection) => {
              connect(connection);
              navigate('/matchup', { replace: true });
            }}
          />
        )}
        <button
          className="connect-page__back"
          onClick={() => setFlow('none')}
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
        <p className="connect-page__kicker">Welcome to Odds Gods</p>
        <h1 className="connect-page__title">Sync a league to begin</h1>
      </section>

      <MobileNotice />

      <div className="connect-page__providers">
        <button
          className="connect-page__provider connect-page__provider--live"
          onClick={() => setFlow('sleeper')}
          type="button"
        >
          <ProviderMark className="connect-page__provider-logo connect-page__provider-logo--sleeper" provider="sleeper" />
          <span className="connect-page__provider-action">Connect</span>
        </button>

        <button
          className="connect-page__provider connect-page__provider--live"
          onClick={() => setFlow('espn')}
          type="button"
        >
          <ProviderMark className="connect-page__provider-logo connect-page__provider-logo--espn" provider="espn" />
          <span className="connect-page__provider-action">Connect</span>
        </button>
      </div>


      {/* The build line has to live here too. With no league connected there is
          no tab bar and so no route to More, which is where it was: the one
          screen you can always reach was the one screen that could not tell you
          what it was running. */}
      <p className="connect-page__build">
        Build {buildStamp}
        {isEspnPluginRegistered() ? ' · native sign-in ready' : ''}
      </p>

      {/* Signed in with no league, this screen is the whole app — and with the
          tab bar hidden until a league exists, there was no way off it and no
          way out of the account. */}
      {user ? (
        <button
          className="connect-page__signout"
          onClick={() => void signOut()}
          type="button"
        >
          Log out of {user.email}
        </button>
      ) : null}
    </div>
  );
}
