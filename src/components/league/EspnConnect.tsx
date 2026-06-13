import { useEffect, useRef, useState } from 'react';
import {
  connectEspn,
  LeagueApiError,
  type EspnTeamSummary,
} from '../../services/leagueApi';
import type { StoredConnection } from '../../contexts/LeagueConnectionContext';
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
  const [leagueId, setLeagueId] = useState('');
  // Season is the current NFL year — no need to ask.
  const season = CURRENT_SEASON;
  const [needsCookies, setNeedsCookies] = useState(false);
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [manual, setManual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The browser extension that reads ESPN's HttpOnly cookie (FantasyPros-style).
  const [extInstalled, setExtInstalled] = useState(false);
  const [extSyncing, setExtSyncing] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  const leagueIdRef = useRef(leagueId);
  leagueIdRef.current = leagueId;

  // Core connect. Cookies are optional (public leagues need none).
  const doConnect = async (creds?: { espnS2: string; swid: string }) => {
    const id = leagueIdRef.current.trim();
    if (id.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await connectEspn(id, season, creds);
      setStep({
        name: 'pick-team',
        leagueId: id,
        season,
        leagueName: result.league.name,
        teams: result.teams,
        espnS2: creds?.espnS2 ?? null,
        swid: creds?.swid ?? null,
      });
    } catch (caught) {
      if (caught instanceof LeagueApiError && caught.code === 'espn_private') {
        setNeedsCookies(true);
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
      setExtSyncing(false);
    }
  };

  const attemptConnect = () => {
    const creds =
      needsCookies && espnS2.trim() && swid.trim()
        ? { espnS2: espnS2.trim(), swid: swid.trim() }
        : undefined;
    void doConnect(creds);
  };

  // Talk to the extension (if installed): it reads espn_s2 + SWID and sends
  // them straight back to this page; we never see a password.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== 'olympus-ext') return;
      if (data.type === 'OLYMPUS_ESPN_READY') {
        setExtInstalled(true);
      }
      if (data.type === 'OLYMPUS_ESPN_RESULT') {
        if (data.espnS2 && data.swid) {
          setEspnS2(data.espnS2);
          setSwid(data.swid);
          void doConnect({ espnS2: data.espnS2, swid: data.swid });
        } else {
          setExtSyncing(false);
          setError(
            'The extension could not read your ESPN login. Make sure you are signed in to espn.com in this browser.',
          );
        }
      }
    };
    window.addEventListener('message', onMessage);
    // Ping in case the extension's content script loaded before we mounted.
    window.postMessage({ source: 'olympus-page', type: 'OLYMPUS_ESPN_PING' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncWithExtension = () => {
    setExtSyncing(true);
    setError(null);
    window.postMessage({ source: 'olympus-page', type: 'OLYMPUS_ESPN_REQUEST' }, window.location.origin);
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
            <span className="espn-connect__label">League ID</span>
            <input
              className="espn-connect__input"
              inputMode="numeric"
              onChange={(event) => setLeagueId(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="From your league URL: leagueId=XXXXXXX"
              value={leagueId}
            />
            <span className="espn-connect__hint">
              In ESPN, open your league and copy the number after{' '}
              <code>leagueId=</code> in the address bar. Most leagues connect
              with just this.
            </span>
          </label>

          {needsCookies ? (
            <div className="espn-connect__cookies">
              <p className="espn-connect__cookies-note">
                This league is private. ESPN keeps its login locked away from
                web pages, so connecting needs the Olympus extension. One
                click, no passwords, read-only.
              </p>

              {extInstalled ? (
                <button
                  className="espn-connect__submit"
                  disabled={extSyncing || isLoading}
                  onClick={syncWithExtension}
                  type="button"
                >
                  {extSyncing ? 'Reading your ESPN login…' : 'Sync with the extension'}
                </button>
              ) : (
                <>
                  <button
                    className="espn-connect__submit"
                    onClick={() => setShowInstall((s) => !s)}
                    type="button"
                  >
                    Get the Olympus connector
                  </button>
                  {showInstall ? (
                    <ol className="espn-connect__steps">
                      <li>
                        Install the Olympus ESPN Connector extension and make
                        sure you&apos;re signed in to espn.com in this browser.
                      </li>
                      <li>Refresh this page. The button above becomes “Sync.”</li>
                    </ol>
                  ) : null}
                </>
              )}

              <button
                className="espn-connect__linkbtn espn-connect__linkbtn--block"
                onClick={() => setManual((m) => !m)}
                type="button"
              >
                {manual ? 'Hide manual entry' : 'Or paste the two cookies manually'}
              </button>

              {manual ? (
                <div className="espn-connect__manual">
                  <p className="espn-connect__hint">
                    In espn.com, open DevTools → Application → Cookies →{' '}
                    <code>espn_s2</code> and <code>SWID</code>.
                  </p>
                  <label className="espn-connect__field">
                    <span className="espn-connect__label">espn_s2</span>
                    <input
                      className="espn-connect__input"
                      onChange={(event) => setEspnS2(event.target.value)}
                      placeholder="Long value starting with AEB..."
                      value={espnS2}
                    />
                  </label>
                  <label className="espn-connect__field">
                    <span className="espn-connect__label">SWID</span>
                    <input
                      className="espn-connect__input"
                      onChange={(event) => setSwid(event.target.value)}
                      placeholder="{XXXXXXXX-XXXX-...}"
                      value={swid}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* The primary button only matters for public leagues or manual entry;
              the extension/manual sub-buttons drive the private path. */}
          {!needsCookies || manual ? (
            <button className="espn-connect__submit" disabled={isLoading} type="submit">
              {isLoading
                ? 'Looking up your league…'
                : needsCookies
                  ? 'Connect with cookies'
                  : 'Find my league'}
            </button>
          ) : null}

          <p className="espn-connect__privacy">
            Read-only. We never ask for your ESPN password.
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
