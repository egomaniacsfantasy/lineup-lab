import { useEffect, useMemo, useRef, useState } from 'react';
import {
  connectEspn,
  LeagueApiError,
  startEspnLogin,
  trackEspnConnectEvent,
  type EspnTeamSummary,
} from '../../services/leagueApi';
import type { StoredConnection } from '../../contexts/LeagueConnectionContext';
import {
  buildEspnLaunchCode,
  espnSessionPasteError,
  espnLoginEnabled,
  parseEspnLeagueInput,
  parseEspnSessionPaste,
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
  const [cookiePaste, setCookiePaste] = useState(initialPaste);
  const [showFallback, setShowFallback] = useState(Boolean(initialPaste));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [loginChallengeId, setLoginChallengeId] = useState<string | null>(null);
  const [copiedConnector, setCopiedConnector] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTriedPaste = useRef(false);

  const leagueInputRef = useRef({ leagueId: '', season: '' });
  leagueInputRef.current = parseEspnLeagueInput(leagueInput);

  const connectorReturnUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/connect';
    return `${window.location.origin}/connect`;
  }, []);

  const launchCode = useMemo(
    () => buildEspnLaunchCode(connectorReturnUrl),
    [connectorReturnUrl],
  );

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

  const connectFromPaste = () => {
    const { creds, missing } = parseEspnSessionPaste(cookiePaste);
    void trackEspnConnectEvent('paste_submit', {
      missing: missing.join(',') || 'none',
      hasLeague: Boolean(privateLeagueId || leagueInputRef.current.leagueId),
    });
    if (!creds) {
      setError(espnSessionPasteError(missing) ?? 'Paste the connector output and try again.');
      return;
    }
    void doConnect(creds);
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

  const copyConnector = async () => {
    try {
      await navigator.clipboard.writeText(launchCode);
      setCopiedConnector(true);
      void trackEspnConnectEvent('connector_copy', {});
    } catch {
      setCopiedConnector(false);
      setError('Could not copy the launch code. Select the code box below, copy it, then paste it into ESPN.');
    }
  };

  useEffect(() => {
    void trackEspnConnectEvent('view', { hasCapture: Boolean(initialPaste) });
  }, [initialPaste]);

  useEffect(() => {
    if (!initialPaste || autoTriedPaste.current) return;
    autoTriedPaste.current = true;
    const parsed = parseEspnSessionPaste(initialPaste);
    if (parsed.creds) {
      void doConnect(parsed.creds);
      return;
    }
    setShowFallback(true);
    setError(espnSessionPasteError(parsed.missing));
    // doConnect is intentionally not a dependency; this effect is a one-shot
    // handoff from the ESPN launch code back into the connector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              Public leagues connect with just the URL. If ESPN says the league
              is private, we&apos;ll show the secure fallback.
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
                    Read-only. Your password is used once and never stored.
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
                <p className="espn-connect__fallback-title">Use the ESPN-page connector</p>
                <div className="espn-connect__capture-demo" aria-hidden="true">
                  <span className="espn-connect__capture-phone">
                    <span />
                  </span>
                  <span className="espn-connect__capture-arrow">→</span>
                  <span className="espn-connect__capture-ticket">Odds Gods</span>
                </div>
                <div className="espn-connect__method">
                  <p className="espn-connect__method-title">One-time ESPN capture</p>
                  <ol className="espn-connect__steps">
                    <li>Tap Copy launch code.</li>
                    <li>Open your ESPN league in this browser.</li>
                    <li>Paste the code into the address bar and hit Enter. Odds Gods fills the box below.</li>
                  </ol>
                  <button className="espn-connect__submit" onClick={copyConnector} type="button">
                    {copiedConnector ? 'Launch code copied' : 'Copy launch code'}
                  </button>
                  <textarea
                    aria-label="Odds Gods ESPN launch code"
                    className="espn-connect__input espn-connect__code"
                    onChange={() => undefined}
                    readOnly
                    rows={2}
                    value={launchCode}
                  />
                </div>
                <button className="espn-connect__linkbtn" onClick={openEspnLeague} type="button">
                  Open ESPN league ↗
                </button>
                <label className="espn-connect__field">
                  <span className="espn-connect__label">Connector output</span>
                  <textarea
                    className="espn-connect__input espn-connect__textarea"
                    onChange={(event) => setCookiePaste(event.target.value)}
                    placeholder="The connector fills this automatically. If it copied text instead, paste it here."
                    rows={5}
                    value={cookiePaste}
                  />
                </label>
                <button
                  className="espn-connect__submit"
                  disabled={isLoading}
                  onClick={connectFromPaste}
                  type="button"
                >
                  {isLoading ? 'Checking ESPN…' : 'Connect captured ESPN login'}
                </button>
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
              ? 'Read-only. Your password is used once and never stored.'
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
