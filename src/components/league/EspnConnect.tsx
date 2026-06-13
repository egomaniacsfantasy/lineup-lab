import { useState } from 'react';
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
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [needsCookies, setNeedsCookies] = useState(false);
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              On ESPN, open your league and copy the number after{' '}
              <code>leagueId=</code> in the address bar.
            </span>
          </label>

          <label className="espn-connect__field">
            <span className="espn-connect__label">Season</span>
            <input
              className="espn-connect__input espn-connect__input--short"
              inputMode="numeric"
              onChange={(event) => setSeason(event.target.value.replace(/[^0-9]/g, ''))}
              value={season}
            />
          </label>

          {needsCookies ? (
            <div className="espn-connect__cookies">
              <p className="espn-connect__cookies-note">
                This league is private. Paste two cookies from your own ESPN
                session — they stay on your device and are read-only. In your
                browser, open espn.com while logged in, then DevTools →
                Application → Cookies → <code>espn_s2</code> and{' '}
                <code>SWID</code>.
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
