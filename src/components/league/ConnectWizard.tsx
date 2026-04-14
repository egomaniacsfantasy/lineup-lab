import { useEffect, useRef, useState } from 'react';
import type { LeagueConnection, Platform } from '../../types';
import { MOCK_LEAGUE } from '../../mocks/league';
import './ConnectWizard.css';

interface ConnectWizardProps {
  onConnected: (connection: LeagueConnection) => void;
}

export function ConnectWizard({ onConnected }: ConnectWizardProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [leagueId, setLeagueId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <section aria-labelledby="connect-wizard-title" className="connect-wizard">
      <div className="connect-wizard__header">
        <p className="connect-wizard__kicker">Connect your league</p>
        <h1 className="connect-wizard__title" id="connect-wizard-title">
          Import from Sleeper or ESPN to unlock personalized pricing.
        </h1>
      </div>

      {selectedPlatform === null ? (
        <div className="connect-wizard__platforms">
          {(['sleeper', 'espn'] as Platform[]).map((platform) => (
            <article className="connect-wizard__platform-card" key={platform}>
              <p className="connect-wizard__platform-name">
                {platform === 'sleeper' ? 'Sleeper' : 'ESPN'}
              </p>
              <button
                className="connect-wizard__connect"
                onClick={() => setSelectedPlatform(platform)}
                type="button"
              >
                Connect
              </button>
            </article>
          ))}
        </div>
      ) : (
        <form
          className="connect-wizard__form"
          onSubmit={(event) => {
            event.preventDefault();

            if (leagueId.trim().length === 0 || isLoading) {
              return;
            }

            setIsLoading(true);
            timerRef.current = window.setTimeout(() => {
              onConnected({
                ...MOCK_LEAGUE,
                platform: selectedPlatform,
                leagueId,
              });
              setIsLoading(false);
              timerRef.current = null;
            }, 1500);
          }}
        >
          <label className="connect-wizard__field">
            <span className="connect-wizard__label">
              {selectedPlatform === 'sleeper' ? 'Sleeper' : 'ESPN'} League ID
            </span>
            <input
              className="connect-wizard__input"
              onChange={(event) => setLeagueId(event.target.value)}
              placeholder="Enter your league ID"
              type="text"
              value={leagueId}
            />
          </label>

          <div className="connect-wizard__actions">
            <button
              className="connect-wizard__back"
              onClick={() => {
                if (timerRef.current !== null) {
                  window.clearTimeout(timerRef.current);
                  timerRef.current = null;
                }
                setIsLoading(false);
                setSelectedPlatform(null);
                setLeagueId('');
              }}
              type="button"
            >
              Back
            </button>
            <button className="connect-wizard__connect" disabled={isLoading} type="submit">
              {isLoading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </form>
      )}

      <p className="connect-wizard__privacy">
        Your data stays private. We only read your roster and scoring settings.
      </p>
    </section>
  );
}
