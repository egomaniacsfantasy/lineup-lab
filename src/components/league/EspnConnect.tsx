import { useEffect, useRef, useState } from 'react';
import {
  detectConnector,
  requestEspnSession,
  connectorSupported,
  CONNECTOR_STORE_URL,
} from '../../utils/espnExtension';
import {
  connectEspn,
  LeagueApiError,
  startEspnLogin,
  trackEspnConnectEvent,
  type EspnTeamSummary,
} from '../../services/leagueApi';
import type { StoredConnection } from '../../contexts/LeagueConnectionContext';
import {
  espnLoginEnabled,
  parseEspnLeagueInput,
} from '../../utils/espnConnect';
import './EspnConnect.css';

interface EspnConnectProps {
  initialLeagueInput?: string;
  initialPaste?: string;
  initialSeason?: string;
  onConnected: (connection: StoredConnection) => void;
}

const CURRENT_SEASON = String(new Date().getFullYear());

type Step =
  | { name: 'league' }
  | {
      name: 'pick-team';
      leagueId: string;
      season: string;
      leagueName: string;
      teams: EspnTeamSummary[];
      espnS2: string | null;
      swid: string | null;
    };

export function EspnConnect({
  initialLeagueInput = '',
  initialPaste = '',
  initialSeason = '',
  onConnected,
}: EspnConnectProps) {
  const [step, setStep] = useState<Step>({ name: 'league' });
  const [leagueInput, setLeagueInput] = useState(initialLeagueInput);
  const [privateLeagueId, setPrivateLeagueId] = useState(initialLeagueInput);
  const [privateSeason, setPrivateSeason] = useState(initialSeason);
  const [showFallback, setShowFallback] = useState(Boolean(initialPaste));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [loginChallengeId, setLoginChallengeId] = useState<string | null>(null);
  const [extensionReady, setExtensionReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leagueInputRef = useRef({ leagueId: '', season: '' });
  leagueInputRef.current = parseEspnLeagueInput(leagueInput);


  // Core connect. Cookies are optional (public leagues need none).
  const doConnect = async (creds?: { espnS2: string; swid: string }) => {
    const id = privateLeagueId || leagueInputRef.current.leagueId;
    const connectSeason = privateSeason || leagueInputRef.current.season || CURRENT_SEASON;
    if (id.length === 0) {
      setError('Paste an ESPN league URL or league ID.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await connectEspn(id, connectSeason, creds);
      setStep({
        name: 'pick-team',
        leagueId: id,
        season: connectSeason,
        leagueName: result.league.name,
        teams: result.teams,
        espnS2: creds?.espnS2 ?? null,
        swid: creds?.swid ?? null,
      });
    } catch (caught) {
      if (caught instanceof LeagueApiError && caught.code === 'espn_private' && creds) {
        setShowFallback(true);
        setError('ESPN rejected this login capture. It may be expired. Open ESPN again, run the connector, and paste the new output here.');
        void trackEspnConnectEvent('failure', { reason: 'private_rejected_capture' });
      } else if (caught instanceof LeagueApiError && caught.code === 'espn_private') {
        setPrivateLeagueId(id);
        setPrivateSeason(connectSeason);
        setShowFallback(true);
        setError(null);
        void trackEspnConnectEvent('privacy_escalation', { leagueId: id, season: connectSeason });
      } else {
        setError(
          caught instanceof LeagueApiError
            ? caught.message
            : 'Could not reach ESPN. Check your connection and try again.',
        );
        void trackEspnConnectEvent('failure', {
          reason: caught instanceof LeagueApiError ? caught.code : 'network',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const attemptConnect = () => {
    setPrivateLeagueId('');
    void trackEspnConnectEvent('league_submit', {
      hasUrl: leagueInput.includes('fantasy.espn.com'),
      hasSeason: Boolean(leagueInputRef.current.season),
    });
    void doConnect();
  };


  const connectWithLogin = async () => {
    const id = privateLeagueId || leagueInputRef.current.leagueId;
    const connectSeason = privateSeason || leagueInputRef.current.season || CURRENT_SEASON;
    if (!id) {
      setError('Paste an ESPN league URL or league ID first.');
      return;
    }
    if (!loginEmail || !loginPassword) {
      setError('Enter your ESPN email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    void trackEspnConnectEvent('login_submit', {
      leagueId: id,
      season: connectSeason,
      hasOtp: Boolean(loginOtp),
    });
    try {
      const result = await startEspnLogin({
        leagueId: id,
        season: connectSeason,
        email: loginEmail,
        password: loginPassword,
        otp: loginOtp || undefined,
        challengeId: loginChallengeId || undefined,
      });

      if (result.status === 'otp_required') {
        setLoginChallengeId(result.challengeId);
        setError(result.message || 'ESPN emailed you a code. Enter it below to continue.');
        void trackEspnConnectEvent('login_otp_required', { leagueId: id });
        return;
      }

      if (result.status === 'connected') {
        setStep({
          name: 'pick-team',
          leagueId: id,
          season: connectSeason,
          leagueName: result.league.name,
          teams: result.teams,
          espnS2: result.espnS2 ?? null,
          swid: result.swid ?? null,
        });
        setLoginPassword('');
        void trackEspnConnectEvent('login_success', { leagueId: id, teamCount: result.teams.length });
        return;
      }

      setShowFallback(true);
      setError(result.message);
      void trackEspnConnectEvent('login_fallback', { reason: result.reason });
    } catch (caught) {
      setShowFallback(true);
      setError(
        caught instanceof LeagueApiError
          ? caught.message
          : 'ESPN login could not finish. Use the ESPN-site connector below.',
      );
      void trackEspnConnectEvent('login_fallback', {
        reason: caught instanceof LeagueApiError ? caught.code : 'network',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openEspnLeague = () => {
    const id = privateLeagueId || leagueInputRef.current.leagueId;
    const connectSeason = privateSeason || leagueInputRef.current.season || CURRENT_SEASON;
    const url = id
      ? `https://fantasy.espn.com/football/league?leagueId=${encodeURIComponent(id)}&seasonId=${encodeURIComponent(connectSeason)}`
      : 'https://fantasy.espn.com/football/';
    window.open(url, '_blank', 'noopener,noreferrer');
    void trackEspnConnectEvent('open_espn', { hasLeague: Boolean(id) });
  };


  /* Poll for the connector so the install step flips to "installed" the moment
     the user finishes, without asking them to reload the page. Cheap: the
     extension answers a postMessage ping or it does not. */
  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const look = async () => {
      const found = await detectConnector();
      if (cancelled) return;
      setExtensionReady(found);
      if (!found) timer = window.setTimeout(look, 1500);
    };

    void look();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const connectWithExtension = async () => {
    setError(null);
    setIsLoading(true);
    void trackEspnConnectEvent('extension_request', {});
    try {
      const session = await requestEspnSession();
      if (!session.espnS2 || !session.swid) {
        setError('The connector could not find an ESPN session. Sign in to ESPN in this browser, then try again.');
        return;
      }
      await doConnect({ espnS2: session.espnS2, swid: session.swid });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void trackEspnConnectEvent('view', { hasCapture: Boolean(initialPaste) });
  }, [initialPaste]);


  return (
    <section aria-labelledby="espn-connect-title" className="espn-connect">
      <div className="espn-connect__header">
        <p className="espn-connect__kicker">Connect ESPN</p>
        <h1 className="espn-connect__title" id="espn-connect-title">
          Bring your ESPN league in.
        </h1>
      </div>

      {step.name === 'league' ? (
        <form
          className="espn-connect__form"
          onSubmit={(event) => {
            event.preventDefault();
            attemptConnect();
          }}
        >
          <label className="espn-connect__field">
            <span className="espn-connect__label">League URL or ID</span>
            <input
              className="espn-connect__input"
              autoComplete="off"
              inputMode="url"
              onChange={(event) => {
                setLeagueInput(event.target.value);
                setShowFallback(false);
                setPrivateLeagueId('');
                setPrivateSeason('');
              }}
              placeholder="https://fantasy.espn.com/football/league?leagueId=..."
              value={leagueInput}
            />
            <span className="espn-connect__hint">
              Public leagues connect with just the URL. Private ones need the
              connector, which is a one-time setup.
            </span>
          </label>

          {showFallback ? (
            <div className="espn-connect__cookies">
              <p className="espn-connect__cookies-note">
                This ESPN league is private.
              </p>

              {espnLoginEnabled ? (
                <div className="espn-connect__login-card">
                  <p className="espn-connect__fallback-title">Log in with ESPN</p>
                  <p className="espn-connect__cookies-note">
                    Read-only, and we never ask for your ESPN password.
                  </p>
                  <label className="espn-connect__field">
                    <span className="espn-connect__label">ESPN email</span>
                    <input
                      autoComplete="username"
                      className="espn-connect__input"
                      onChange={(event) => setLoginEmail(event.target.value)}
                      type="email"
                      value={loginEmail}
                    />
                  </label>
                  <label className="espn-connect__field">
                    <span className="espn-connect__label">ESPN password</span>
                    <input
                      autoComplete="current-password"
                      className="espn-connect__input"
                      onChange={(event) => setLoginPassword(event.target.value)}
                      type="password"
                      value={loginPassword}
                    />
                  </label>
                  {loginChallengeId ? (
                    <label className="espn-connect__field">
                      <span className="espn-connect__label">Code ESPN emailed you</span>
                      <input
                        autoComplete="one-time-code"
                        className="espn-connect__input"
                        inputMode="numeric"
                        onChange={(event) => setLoginOtp(event.target.value)}
                        value={loginOtp}
                      />
                    </label>
                  ) : null}
                  <button
                    className="espn-connect__submit"
                    disabled={isLoading}
                    onClick={connectWithLogin}
                    type="button"
                  >
                    {isLoading ? 'Connecting…' : 'Connect with ESPN'}
                  </button>
                </div>
              ) : null}

              <div className="espn-connect__fallback-card">
                <p className="espn-connect__fallback-title">This league is private</p>
                <p className="espn-connect__method-note">
                  ESPN keeps your league sign-in in a cookie that no website is
                  allowed to read, including this one. The connector is a small
                  read-only add-on that hands it over. We never see your ESPN
                  password.
                </p>

                {!connectorSupported() && espnLoginEnabled ? (
                  /* The sign-in above IS the phone path. This paragraph used to
                     say a private league needs a computer full stop, directly
                     under a form that connects one from a phone — the screen
                     contradicted itself. The connector is the fallback now, not
                     the requirement. */
                  <p className="espn-connect__method-note">
                    Signing in above is all a phone needs. If it does not go
                    through, the connector is a one-time setup on a computer,
                    after which this league works on every device.
                  </p>
                ) : !connectorSupported() ? (
                  <p className="espn-connect__method-note">
                    Connecting a private league needs a computer, because phone
                    browsers cannot run the connector. Do it once on a laptop
                    and this league then works on every device, including this
                    one.
                  </p>
                ) : extensionReady ? (
                  <>
                    <p className="espn-connect__method-title">Connector installed</p>
                    <ol className="espn-connect__steps">
                      <li>Be signed in to ESPN in this browser.</li>
                      <li>Press connect. That is the whole thing.</li>
                    </ol>
                    <button
                      className="espn-connect__submit"
                      disabled={isLoading}
                      onClick={connectWithExtension}
                      type="button"
                    >
                      {isLoading ? 'Checking ESPN…' : 'Connect my ESPN league'}
                    </button>
                    <button className="espn-connect__linkbtn" onClick={openEspnLeague} type="button">
                      Sign in to ESPN first ↗
                    </button>
                  </>
                ) : (
                  <>
                    <ol className="espn-connect__steps">
                      <li>Add the connector. Takes about five seconds.</li>
                      <li>Come back here. This page notices on its own.</li>
                    </ol>
                    {CONNECTOR_STORE_URL ? (
                      <a
                        className="espn-connect__submit"
                        href={CONNECTOR_STORE_URL}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Add the connector ↗
                      </a>
                    ) : (
                      <p className="espn-connect__method-note">
                        The connector is not published yet.
                      </p>
                    )}
                    <p className="espn-connect__method-note">
                      You only ever do this once. After it is linked, Odds Gods
                      keeps your league in sync on its own, on every device.
                    </p>
                  </>
                )}
              </div>

              <button
                className="espn-connect__linkbtn espn-connect__linkbtn--block"
                onClick={() => {
                  setShowFallback(false);
                  setError(null);
                }}
                type="button"
              >
                Try a different league URL
              </button>
            </div>
          ) : null}

          {!showFallback ? (
            <button className="espn-connect__submit" disabled={isLoading} type="submit">
              {isLoading ? 'Looking up your league…' : 'Find my league'}
            </button>
          ) : null}

          <p className="espn-connect__privacy">
            {espnLoginEnabled
              ? 'Read-only, and we never ask for your ESPN password.'
              : 'Read-only. Your password is never requested or stored.'}
          </p>
        </form>
      ) : null}

      {step.name === 'pick-team' ? (
        <div className="espn-connect__teams">
          <p className="espn-connect__step-note">
            {step.leagueName} · {step.season} · which team is yours?
          </p>
          {step.teams.map((team) => (
            <button
              className="espn-connect__team-row"
              disabled={!team.ownerId}
              key={team.rosterId}
              onClick={() => {
                onConnected({
                  provider: 'espn',
                  leagueId: step.leagueId,
                  leagueName: step.leagueName,
                  userId: team.ownerId ?? '',
                  username: team.ownerName,
                  displayName: team.ownerName,
                  allLeagueIds: [step.leagueId],
                  season: step.season,
                  // Cookies now live (encrypted) on the server, keyed by league.
                  // The connection stays cookie-free so it works on any device.
                  espnS2: null,
                  swid: null,
                });
                void trackEspnConnectEvent('success', {
                  leagueId: step.leagueId,
                  season: step.season,
                  teamPicked: Boolean(team.ownerId),
                });
              }}
              type="button"
            >
              <span className="espn-connect__team-name">{team.teamName}</span>
              <span className="espn-connect__team-meta">
                {team.ownerName} · {team.record.wins}-{team.record.losses}
              </span>
            </button>
          ))}
          <button
            className="espn-connect__back"
            onClick={() => setStep({ name: 'league' })}
            type="button"
          >
            Back
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="espn-connect__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
