import type { LeagueConnection } from '../../types';
import './LeagueSettings.css';

interface LeagueSettingsProps {
  connection: LeagueConnection;
  onSwitchLeague: () => void;
  onDisconnect: () => void;
}

export function LeagueSettings({
  connection,
  onSwitchLeague,
  onDisconnect,
}: LeagueSettingsProps) {
  return (
    <section aria-labelledby="league-settings-title" className="league-settings">
      <details className="league-settings__details">
        <summary className="league-settings__summary">
          <span className="league-settings__kicker">League settings</span>
          <span className="league-settings__toggle">Open</span>
        </summary>

        <div className="league-settings__content">
          <div className="league-settings__grid">
            <div className="league-settings__item">
              <span className="league-settings__label">Connected team</span>
              <span className="league-settings__value">{connection.teamName}</span>
            </div>
            <div className="league-settings__item">
              <span className="league-settings__label">Platform</span>
              <span className="league-settings__value">
                {connection.platform === 'sleeper' ? 'Sleeper' : 'ESPN'}
              </span>
            </div>
            <div className="league-settings__item">
              <span className="league-settings__label">Scoring</span>
              <span className="league-settings__value">{connection.scoringFormat.toUpperCase()}</span>
            </div>
            <div className="league-settings__item">
              <span className="league-settings__label">Roster slots</span>
              <span className="league-settings__value">
                {connection.rosterPositions.join(' / ')}
              </span>
            </div>
            <div className="league-settings__item">
              <span className="league-settings__label">League ID</span>
              <span className="league-settings__value">{connection.leagueId}</span>
            </div>
          </div>

          <div className="league-settings__actions">
            <button className="league-settings__action league-settings__action--primary" onClick={onSwitchLeague} type="button">
              Switch league
            </button>
            <button className="league-settings__action" onClick={onDisconnect} type="button">
              Disconnect
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
