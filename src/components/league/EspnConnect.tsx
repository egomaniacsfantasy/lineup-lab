import { useRef, useState } from 'react';
import {
  connectEspn,
  LeagueApiError,
  type EspnTeamSummary,
} from '../../services/leagueApi';
import type { StoredConnection } from '../../contexts/LeagueConnectionContext';
import {
  espnLoginEnabled,
  parseEspnLeagueInput,
  parseEspnSessionPaste,
} from '../../utils/espnConnect';
import './EspnConnect.css';

interface EspnConnectProps {
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

export function EspnConnect({ onConnected }: EspnConnectProps) {
  const [step, setStep] = useState<Step>({ name: 'league' });
  const [leagueInput, setLeagueInput] = useState('');
  const [privateLeagueId, setPrivateLeagueId] = useState('');
  const [privateSeason, setPrivateSeason] = useState('');
  const [cookiePaste, setCookiePaste] = useState('');
  const [showFallback, setShowFallback] = useState(false);
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
      if (caught instanceof LeagueApiError && caught.code === 'espn_private') {
        setPrivateLeagueId(id);
        setPrivateSeason(connectSeason);
        setShowFallback(true);
        setError(null);
      } else {
        setError(
          caught instanceof LeagueApiError
            ? caught.message
            : 'Could not reach ESPN. Try again in a minute.',
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const attemptConnect = () => {
    setPrivateLeagueId('');
    void doConnect();
  };

  const connectFromPaste = () => {
    const { creds, missing } = parseEspnSessionPaste(cookiePaste);
    if (!creds) {
      setError(`Missing ${missing.join(' and ')}. Paste the full ESPN session text and try again.`);
      return;
    }
    void doConnect(creds);
  };

  const openEspnLeague = () => {
    const id = privateLeagueId || leagueInputRef.current.leagueId;
    const connectSeason = privateSeason || leagueInputRef.current.season || CURRENT_SEASON;
    const url = id
      ? `https://fantasy.espn.com/football/league?leagueId=${encodeURIComponent(id)}&seasonId=${encodeURIComponent(connectSeason)}`
      : 'https://fantasy.espn.com/football/';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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
                  <p className="espn-connect__cookies-note">
                    Log in with ESPN is enabled for this environment, but the
                    Disney login worker is not mounted on this server yet.
                  </p>
                  <button
                    className="espn-connect__submit"
                    disabled
                    type="button"
                  >
                    Log in with ESPN
                  </button>
                </div>
              ) : null}

              <div className="espn-connect__fallback-card">
                <p className="espn-connect__fallback-title">Connect from ESPN&apos;s site</p>
                <ol className="espn-connect__steps">
                  <li>Open your league on ESPN in a browser where you&apos;re already signed in.</li>
                  <li>Paste the full ESPN session text here. We extract only what the sync needs.</li>
                  <li>Your password is never requested or stored.</li>
                </ol>
                <button className="espn-connect__linkbtn" onClick={openEspnLeague} type="button">
                  Open ESPN league ↗
                </button>
                <label className="espn-connect__field">
                  <span className="espn-connect__label">Paste anything</span>
                  <textarea
                    className="espn-connect__input espn-connect__textarea"
                    onChange={(event) => setCookiePaste(event.target.value)}
                    placeholder="SWID=...; espn_s2=..."
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
                  {isLoading ? 'Checking ESPN…' : 'Connect from ESPN session'}
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
              onClick={() =>
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
                })
              }
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
