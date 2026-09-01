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
  isNativeEspnAuthAvailable,
  signInToEspnNatively,
} from '../../utils/espnNativeAuth';
import {
  espnLoginEnabled,
  parseEspnLeagueInput,
} from '../../utils/espnConnect';
import './EspnConnect.css';
import { managerLine } from '../../utils/managerLine';

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

/**
 * The ESPN email and password fields.
 *
 * One definition, two placements: it leads on a phone, where the connector
 * cannot run, and hides behind a disclosure on a desktop, where it is a last
 * resort. Two copies of a password form is two chances for one of them to stop
 * saying what happens to the password.
 */
function EspnPasswordFields({
  email,
  isLoading,
  onConnect,
  onEmail,
  onOtp,
  onPassword,
  otp,
  otpNeeded,
  password,
}: {
  email: string;
  isLoading: boolean;
  onConnect: () => void;
  onEmail: (value: string) => void;
  onOtp: (value: string) => void;
  onPassword: (value: string) => void;
  otp: string;
  otpNeeded: boolean;
  password: string;
}) {
  return (
    <>
      <label className="espn-connect__field">
        <span className="espn-connect__label">ESPN email</span>
        <input
          autoComplete="username"
          className="espn-connect__input"
          onChange={(event) => onEmail(event.target.value)}
          type="email"
          value={email}
        />
      </label>
      <label className="espn-connect__field">
        <span className="espn-connect__label">ESPN password</span>
        <input
          autoComplete="current-password"
          className="espn-connect__input"
          onChange={(event) => onPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>
      {otpNeeded ? (
        <label className="espn-connect__field">
          <span className="espn-connect__label">Code ESPN emailed you</span>
          <input
            autoComplete="one-time-code"
            className="espn-connect__input"
            inputMode="numeric"
            onChange={(event) => onOtp(event.target.value)}
            value={otp}
          />
        </label>
      ) : null}
      <button
        className="espn-connect__submit"
        disabled={isLoading}
        onClick={onConnect}
        type="button"
      >
        {isLoading ? 'Connecting…' : 'Connect with ESPN'}
      </button>
    </>
  );
}

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
  /* Whether ESPN is actually signed in, asked of the connector rather than
     assumed. Pressing Connect with a signed-out ESPN was the single most
     common way this failed, and the error came back looking like a broken
     league id. null = not asked yet. */
  const [espnSignedIn, setEspnSignedIn] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leagueInputRef = useRef({ leagueId: '', season: '' });
  leagueInputRef.current = parseEspnLeagueInput(leagueInput);


  /* The native path. ESPN's own sign-in page opens in a sheet, the user signs
     in there, and the session cookie comes back readable because a native
     cookie store is not bound by HttpOnly. No password reaches us, no
     extension, no headless browser. */
  const signInWithEspnNatively = async () => {
    const id = privateLeagueId || leagueInputRef.current.leagueId;
    const season = privateSeason || leagueInputRef.current.season || CURRENT_SEASON;
    if (id.length === 0) {
      setError('Paste an ESPN league URL or league ID.');
      return;
    }
    setError(null);
    const result = await signInToEspnNatively(id, season);
    if (result.status === 'ok' && result.espnS2 && result.swid) {
      void trackEspnConnectEvent('native_signin_ok', {});
      await doConnect({ espnS2: result.espnS2, swid: result.swid });
      return;
    }
    if (result.status === 'cancelled') return;
    void trackEspnConnectEvent('native_signin_failed', { reason: result.reason ?? 'unknown' });
    /* Say which failure it was. "That sign-in did not finish" covered a missing
       plugin, a rejected call and a sheet that closed with no cookie, so three
       different problems produced one sentence that fitted none of them and
       could not be reported back. */
    setError(
      `Sign-in could not start: ${result.reason ?? 'unknown'}. Tell me that reason and I can fix it directly.`,
    );
  };

  useEffect(() => {
    if (!extensionReady) return undefined;
    let cancelled = false;
    const check = () => {
      void requestEspnSession()
        .then((session) => {
          if (!cancelled) setEspnSignedIn(Boolean(session?.espnS2 && session?.swid));
        })
        .catch(() => {
          if (!cancelled) setEspnSignedIn(false);
        });
    };
    check();
    /* They will go and sign in with this tab still open, so the step has to
       notice on its own rather than needing a reload to catch up. */
    const timer = window.setInterval(check, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [extensionReady]);

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

      /* Do not ask a question we already have the answer to. The SWID cookie
         is the ESPN member id, and the server matched it against each team's
         owners, so a signed-in user's own team is known before the picker is
         drawn. It still draws for a public league (no cookie to match) and for
         someone who co-owns two teams in one league. */
      const known = result.yourRosterId != null
        ? result.teams.find((team) => team.rosterId === result.yourRosterId)
        : undefined;
      if (known?.ownerId) {
        onConnected({
          provider: 'espn',
          leagueId: id,
          leagueName: result.league.name,
          userId: known.ownerId,
          username: known.ownerName ?? known.teamName,
          displayName: known.ownerName ?? known.teamName,
          allLeagueIds: [id],
          season: connectSeason,
          espnS2: null,
          swid: null,
        });
        void trackEspnConnectEvent('success', {
          leagueId: id,
          season: connectSeason,
          teamPicked: true,
        });
        return;
      }

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
            /* A private league, and exactly one way forward on screen.
            
               This used to render the ESPN email and password form first and
               unconditionally, with the connector walkthrough underneath it. So
               somebody who had installed the connector, and whose ESPN session
               the page could already read, was asked for their ESPN password by
               a product whose own extension description promises the password
               never leaves ESPN. The thing that worked was below the thing that
               should not have been offered.
            
               Now the state decides. Everything needed already in hand means
               one button. Connector but no ESPN session means one step. No
               connector means install it. The password form is what is left
               when none of that is possible, which on a desktop is nothing, and
               on a phone is everything. */
            <div className="espn-connect__cookies">
              <p className="espn-connect__cookies-note">This ESPN league is private.</p>

              {isNativeEspnAuthAvailable() ? (
                <div className="espn-connect__login-card">
                  <div className="espn-connect__login-brand">
                    <img alt="ESPN" className="espn-connect__login-mark" src="/brand/espn-logo.png" />
                    <span className="espn-connect__login-lockup">Sign in</span>
                  </div>
                  <p className="espn-connect__cookies-note">
                    Opens ESPN&rsquo;s own sign-in. Your password goes to ESPN and
                    never passes through us.
                  </p>
                  <button
                    className="espn-connect__submit"
                    onClick={() => void signInWithEspnNatively()}
                    type="button"
                  >
                    Sign in with ESPN
                  </button>
                </div>
              ) : extensionReady && espnSignedIn ? (
                /* Nothing left to ask for. The connector is here and it can see
                   a live ESPN session, so the only honest thing on screen is
                   the button that finishes. */
                <div className="espn-connect__fallback-card">
                  <p className="espn-connect__fallback-title">Ready to connect</p>
                  <p className="espn-connect__method-note">
                    The connector is installed and your ESPN session is live in
                    this browser. We read the league above and match your team
                    automatically.
                  </p>
                  <button
                    className="espn-connect__submit"
                    disabled={isLoading}
                    onClick={connectWithExtension}
                    type="button"
                  >
                    {isLoading ? 'Checking ESPN…' : 'Connect my ESPN league'}
                  </button>
                </div>
              ) : extensionReady ? (
                /* The connector is here; ESPN is not signed in. One thing to do,
                   and it happens on ESPN's site, not ours. */
                <div className="espn-connect__fallback-card">
                  <p className="espn-connect__fallback-title">Sign in to ESPN</p>
                  <p className="espn-connect__method-note">
                    The connector is installed. Sign in on ESPN&rsquo;s own site, in
                    any tab, and come back. Your password never touches Odds
                    Gods, and this page notices on its own.
                  </p>
                  <button className="espn-connect__submit" onClick={openEspnLeague} type="button">
                    Open ESPN ↗︎
                  </button>
                </div>
              ) : connectorSupported() ? (
                /* No connector yet, and this browser can run one. */
                <div className="espn-connect__fallback-card">
                  <p className="espn-connect__fallback-title">Add the connector</p>
                  <p className="espn-connect__method-note">
                    ESPN keeps your sign-in in a cookie no website may read. A
                    small Chrome add-on hands that one cookie over, read-only.
                    Five seconds, once, ever. Your ESPN password is never
                    involved.
                  </p>
                  {CONNECTOR_STORE_URL ? (
                    <a
                      className="espn-connect__submit"
                      href={CONNECTOR_STORE_URL}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Add the connector ↗︎
                    </a>
                  ) : (
                    <p className="espn-connect__method-note">
                      The connector is not published yet.
                    </p>
                  )}
                  <p className="espn-connect__method-note">
                    This page notices the moment it is installed. Nothing to
                    reload.
                  </p>
                </div>
              ) : null}

              {/* The password path, and where it belongs.
              
                  On a phone it is the only way through, because a phone browser
                  cannot run the connector, so it leads. On a desktop it is a
                  last resort behind a disclosure: offering it beside a working
                  connector is how somebody ends up typing an ESPN password they
                  never needed to type. */}
              {espnLoginEnabled && !isNativeEspnAuthAvailable() ? (
                connectorSupported() ? (
                  /* The card styling sits on the INNER wrapper rather than on
                     the <details>.
                     
                     Chromium hides closed content with content-visibility, so
                     `display: grid` directly on the element is fine there. Not
                     every engine does it that way, and a layout mode on the
                     details itself is the documented way to break the closed
                     state elsewhere. A wrapper costs one element and removes
                     the question. */
                  <details className="espn-connect__disclosure">
                    <summary className="espn-connect__fallback-title">
                      Cannot install the connector?
                    </summary>
                    <div className="espn-connect__fallback-card">
                      <p className="espn-connect__method-note">
                        We can sign in to ESPN for you instead. Your password is
                        used once, stored nowhere, and kept out of our logs. The
                        connector is the better path if you can use it.
                      </p>
                      <EspnPasswordFields
                        email={loginEmail}
                        isLoading={isLoading}
                        onConnect={connectWithLogin}
                        onEmail={setLoginEmail}
                        onOtp={setLoginOtp}
                        onPassword={setLoginPassword}
                        otp={loginOtp}
                        otpNeeded={Boolean(loginChallengeId)}
                        password={loginPassword}
                      />
                    </div>
                  </details>
                ) : (
                  <div className="espn-connect__login-card">
                    {/* Asking for someone's ESPN password inside an unbranded
                        dark box reads exactly like phishing. Their mark, on
                        their red, at the top of the panel. */}
                    <div className="espn-connect__login-brand">
                      <img alt="ESPN" className="espn-connect__login-mark" src="/brand/espn-logo.png" />
                      <span className="espn-connect__login-lockup">Sign in</span>
                    </div>
                    <p className="espn-connect__cookies-note">
                      A phone browser cannot run the connector, so we sign in for
                      you. Your password is used once, stored nowhere, and kept
                      out of our logs.
                    </p>
                    <EspnPasswordFields
                      email={loginEmail}
                      isLoading={isLoading}
                      onConnect={connectWithLogin}
                      onEmail={setLoginEmail}
                      onOtp={setLoginOtp}
                      onPassword={setLoginPassword}
                      otp={loginOtp}
                      otpNeeded={Boolean(loginChallengeId)}
                      password={loginPassword}
                    />
                  </div>
                )
              ) : null}

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
                  /* The connection needs a label. When ESPN has no printable
                     name for the account, the team is how you know it. */
                  username: team.ownerName ?? team.teamName,
                  displayName: team.ownerName ?? team.teamName,
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
                {managerLine(
                  team.ownerName,
                  `${team.record.wins}-${team.record.losses}`,
                )}
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
