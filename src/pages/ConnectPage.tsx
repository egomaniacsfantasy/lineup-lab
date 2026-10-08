/**
 * The front door for anyone without a connected league. Sync-first:
 * pick a provider, type a username, and the whole league is priced.
 * The demo stays reachable, one click below.
 */
import { consumeEspnIdentityRecheck } from '../contexts/LeagueConnectionContext';
import { consumePendingConnection } from '../utils/pendingSleeper';
import { narrowToLeague } from '../contexts/leagueSelection';
import { ProviderMark } from '../components/league/ProviderMark';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ConnectWizard } from '../components/league/ConnectWizard';
import { EspnConnect } from '../components/league/EspnConnect';
import { useAuth } from '../contexts/AuthContext';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import './ConnectPage.css';

declare const __BUILD_STAMP__: string | undefined;
const buildStamp = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'dev';

const IDENTITY_RECHECK = consumeEspnIdentityRecheck();

export function ConnectPage() {
  const { stored, connect, openLeaguePicker } = useLeagueConnection();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasEspnCapture = searchParams.has('espnCapture') || searchParams.has('espnLeagueId');
  const [flow, setFlow] = useState<'none' | 'sleeper' | 'espn'>(hasEspnCapture ? 'espn' : 'none');

  /* A league the anonymous screens already resolved.
   *
   * Somebody who typed their username on the landing page or the phone gate,
   * picked their league and watched it get priced has done every step this
   * screen exists to walk them through. Making them do it again on the far
   * side of the sign-up form is the same sync twice, and it is the moment the
   * funnel stops feeling like a door.
   *
   * Consumed on read, so it can never reopen a league months later. */
  useEffect(() => {
    if (stored) return;
    const pending = consumePendingConnection();
    if (!pending) return;
    /* Narrowed on the way in as well as at the source: a connection written
       by an older build still carries every league on the account, and it
       can sit in storage across a deploy. */
    connect(pending.provider === 'sleeper'
      ? narrowToLeague(pending, {
          id: pending.leagueId,
          name: pending.leagueName ?? pending.allLeagues?.find((l) => l.id === pending.leagueId)?.name ?? 'Sleeper league',
          season: pending.season,
        })
      : pending);
    /* They looked at one league. Ask about the others once; the sheet closes
       itself when there are none. */
    if (pending.provider === 'sleeper') openLeaguePicker({ firstRun: true });
  }, [connect, openLeaguePicker, stored]);

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
        <h1 className="connect-page__title">Connect a league to begin</h1>
      </section>

      {IDENTITY_RECHECK ? (
        <aside className="connect-page__recheck" role="status">
          <p>
            <strong>Pick your team again.</strong> Some ESPN leagues were matched
            to the wrong team. Reconnect and choose yours.
          </p>
        </aside>
      ) : null}


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
