import { useState } from 'react';
import {
  connectUsername,
  fetchBootstrap,
  LeagueApiError,
  type ApiLeagueSummary,
  type LeagueBootstrap,
  type ProviderUser,
} from '../../services/leagueApi';
import type { StoredConnection } from '../../contexts/LeagueConnectionContext';
import './ConnectWizard.css';

interface ConnectWizardProps {
  onConnected: (connection: StoredConnection) => void;
}

const SCORING_LABELS: Record<string, string> = {
  ppr: 'PPR',
  'half-ppr': 'Half PPR',
  standard: 'Standard',
};

type Step =
  | { name: 'username' }
  | { name: 'pick-league'; user: ProviderUser; season: string; leagues: ApiLeagueSummary[] }
  | {
      name: 'confirm';
      user: ProviderUser;
      league: ApiLeagueSummary;
      bootstrap: LeagueBootstrap;
      allLeagueIds: string[];
    };

export function ConnectWizard({ onConnected }: ConnectWizardProps) {
  const [step, setStep] = useState<Step>({ name: 'username' });
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveUsername = async () => {
    if (username.trim().length === 0 || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await connectUsername(username.trim());
      setStep({ name: 'pick-league', ...result });
    } catch (caught) {
      setError(
        caught instanceof LeagueApiError
          ? caught.message
          : 'Could not reach the league service. Try again in a minute.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const pickLeague = async (
    user: ProviderUser,
    league: ApiLeagueSummary,
    allLeagueIds: string[],
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const bootstrap = await fetchBootstrap(league.id, user.id);
      setStep({ name: 'confirm', user, league, bootstrap, allLeagueIds });
    } catch (caught) {
      setError(
        caught instanceof LeagueApiError
          ? caught.message
          : 'Could not load that league. It may be archived on Sleeper.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section aria-labelledby="connect-wizard-title" className="connect-wizard">
      <div className="connect-wizard__header">
        <p className="connect-wizard__kicker">Connect your league</p>
        <h1 className="connect-wizard__title" id="connect-wizard-title">
          One username. Your whole league, priced.
        </h1>
      </div>

      {step.name === 'username' ? (
        <form
          className="connect-wizard__form"
          onSubmit={(event) => {
            event.preventDefault();
            void resolveUsername();
          }}
        >
          <label className="connect-wizard__field">
            <span className="connect-wizard__label">Sleeper username</span>
            <input
              autoCapitalize="none"
              autoCorrect="off"
              className="connect-wizard__input"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="The name you log in to Sleeper with"
              type="text"
              value={username}
            />
          </label>

          <div className="connect-wizard__actions">
            <button className="connect-wizard__connect" disabled={isLoading} type="submit">
              {isLoading ? 'Looking you up…' : 'Find my leagues'}
            </button>
          </div>

          <p className="connect-wizard__note">
            ESPN and Yahoo are coming later. Sleeper first.
          </p>
        </form>
      ) : null}

      {step.name === 'pick-league' ? (
        <div className="connect-wizard__leagues">
          <p className="connect-wizard__step-note">
            {step.user.displayName} · {step.season} season ·{' '}
            {step.leagues.length === 1 ? '1 league' : `${step.leagues.length} leagues`}
          </p>

          {step.leagues.map((league) => (
            <button
              className="connect-wizard__league-row"
              disabled={isLoading}
              key={league.id}
              onClick={() =>
                void pickLeague(step.user, league, step.leagues.map((l) => l.id))
              }
              type="button"
            >
              <span className="connect-wizard__league-name">{league.name}</span>
              <span className="connect-wizard__league-meta">
                {league.totalTeams} teams
                <span className="connect-wizard__scoring-badge">
                  {SCORING_LABELS[league.scoringFamily]}
                </span>
              </span>
            </button>
          ))}

          <button
            className="connect-wizard__back"
            onClick={() => setStep({ name: 'username' })}
            type="button"
          >
            Back
          </button>
        </div>
      ) : null}

      {step.name === 'confirm' ? (
        <ConfirmStep
          isLoading={isLoading}
          onBack={() =>
            setStep({
              name: 'pick-league',
              user: step.user,
              season: step.league.season,
              leagues: [step.league],
            })
          }
          onConfirm={() =>
            onConnected({
              provider: 'sleeper',
              leagueId: step.league.id,
              leagueName: step.league.name,
              userId: step.user.id,
              username: step.user.username,
              displayName: step.user.displayName,
              allLeagueIds: step.allLeagueIds,
            })
          }
          step={step}
        />
      ) : null}

      {error ? (
        <p className="connect-wizard__error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="connect-wizard__privacy">
        Read-only. We never ask for your Sleeper password. Olympus prices your
        league, it can&apos;t touch it.
      </p>
    </section>
  );
}

function ConfirmStep({
  step,
  isLoading,
  onConfirm,
  onBack,
}: {
  step: Extract<Step, { name: 'confirm' }>;
  isLoading: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const userTeam = step.bootstrap.teams.find((t) => t.isUser) ?? null;
  const isPreDraft =
    step.league.status === 'pre_draft' ||
    step.bootstrap.teams.every((t) => t.players.length === 0);
  const record = userTeam
    ? `${userTeam.record.wins}-${userTeam.record.losses}`
    : null;

  return (
    <div className="connect-wizard__confirm">
      {userTeam ? (
        <p className="connect-wizard__confirm-question">
          You&apos;re <strong>{userTeam.teamName}</strong>
          {record ? `, ${record}` : ''}?
        </p>
      ) : (
        <p className="connect-wizard__confirm-question">
          We couldn&apos;t match a roster to your account in this league. You can
          still connect and browse it.
        </p>
      )}

      {isPreDraft ? (
        <p className="connect-wizard__step-note">
          This league hasn&apos;t drafted yet. It connects fully after your draft.
          Until then you&apos;ll see league settings and members only.
        </p>
      ) : null}

      <div className="connect-wizard__actions">
        <button className="connect-wizard__back" onClick={onBack} type="button">
          Back
        </button>
        <button
          className="connect-wizard__connect"
          disabled={isLoading}
          onClick={onConfirm}
          type="button"
        >
          {userTeam ? `Yes, that's me` : 'Connect anyway'}
        </button>
      </div>
    </div>
  );
}
