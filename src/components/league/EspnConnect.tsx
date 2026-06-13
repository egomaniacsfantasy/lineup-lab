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

// One-click cookie grab: run on espn.com, copies a token to the clipboard.
const BOOKMARKLET =
  "javascript:(function(){var g=function(n){var m=document.cookie.match(new RegExp(n+'=([^;]+)'));return m?m[1]:''};var s=g('espn_s2'),w=g('SWID');if(!s||!w){alert('Open espn.com (logged in) first, then click this. If it still fails, your browser hides the cookie — use manual entry in Olympus.');return}var t=btoa(s+'~~'+w);if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){alert('ESPN access copied. Paste it back in Olympus.')},function(){prompt('Copy this token into Olympus:',t)})}else{prompt('Copy this token into Olympus:',t)}})()";

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
  // Season is the current NFL year — no need to ask. (Past seasons are an
  // advanced case we can add later.)
  const season = CURRENT_SEASON;
  const [needsCookies, setNeedsCookies] = useState(false);
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [manual, setManual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // React 19 blocks javascript: hrefs in JSX, so set the bookmarklet via ref.
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (bookmarkletRef.current) bookmarkletRef.current.setAttribute('href', BOOKMARKLET);
  }, [needsCookies]);

  // Decode the clipboard token from the bookmarklet into the two cookies.
  const applyToken = (raw: string) => {
    try {
      const [s2, sw] = atob(raw.trim()).split('~~');
      if (s2 && sw) {
        setEspnS2(s2);
        setSwid(sw);
        return true;
      }
    } catch {
      // not a valid token yet
    }
    return false;
  };

  const attemptConnect = async () => {
    if (leagueId.trim().length === 0 || isLoading) return;
    setIsLoading(true);
    setError(null);

    const creds =
      needsCookies && espnS2.trim() && swid.trim()
        ? { espnS2: espnS2.trim(), swid: swid.trim() }
        : undefined;

    try {
      const result = await connectEspn(leagueId.trim(), season.trim(), creds);
      setStep({
        name: 'pick-team',
        leagueId: leagueId.trim(),
        season: season.trim(),
        leagueName: result.league.name,
        teams: result.teams,
        espnS2: creds?.espnS2 ?? null,
        swid: creds?.swid ?? null,
      });
    } catch (caught) {
      if (caught instanceof LeagueApiError && caught.code === 'espn_private') {
        setNeedsCookies(true);
        setError(caught.message);
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
            void attemptConnect();
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
                This league is private, so ESPN needs to know it&apos;s really
                you. One click does it — no passwords, read-only, stays on your
                device:
              </p>
              <ol className="espn-connect__steps">
                <li>
                  Drag this to your bookmarks bar:{' '}
                  <a
                    className="espn-connect__bookmarklet"
                    onClick={(event) => event.preventDefault()}
                    ref={bookmarkletRef}
                  >
                    🔑 Grab ESPN access
                  </a>
                </li>
                <li>Open espn.com (logged in) and click that bookmark.</li>
                <li>Come back here and paste:</li>
              </ol>
              <input
                className="espn-connect__input"
                onChange={(event) => {
                  setTokenInput(event.target.value);
                  applyToken(event.target.value);
                }}
                placeholder="Paste your ESPN access token"
                value={tokenInput}
              />
              {tokenInput && !espnS2 ? (
                <p className="espn-connect__hint">
                  That token didn&apos;t read. Use{' '}
                  <button
                    className="espn-connect__linkbtn"
                    onClick={() => setManual((m) => !m)}
                    type="button"
                  >
                    manual entry
                  </button>{' '}
                  instead.
                </p>
              ) : (
                <button
                  className="espn-connect__linkbtn espn-connect__linkbtn--block"
                  onClick={() => setManual((m) => !m)}
                  type="button"
                >
                  {manual ? 'Hide manual entry' : 'Or paste the two cookies manually'}
                </button>
              )}
              {manual ? (
                <div className="espn-connect__manual">
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

          <button className="espn-connect__submit" disabled={isLoading} type="submit">
            {isLoading
              ? 'Looking up your league…'
              : needsCookies
                ? 'Connect with cookies'
                : 'Find my league'}
          </button>

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
                  userId: team.ownerId ?? '',
                  username: team.ownerName,
                  displayName: team.ownerName,
                  allLeagueIds: [step.leagueId],
                  season: step.season,
                  espnS2: step.espnS2,
                  swid: step.swid,
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
