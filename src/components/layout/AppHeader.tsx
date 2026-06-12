import { NavLink } from 'react-router-dom';
import { useSeasonMode } from '../../hooks/useSeasonMode';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { MOCK_MATCHUP } from '../../mocks';
import type { ScoringFormat } from '../../types';
import { Gloss } from '../ui/Gloss';
import { SeasonToggle } from './SeasonToggle';
import './AppHeader.css';

const SCORING_LABELS: Record<ScoringFormat, string> = {
  standard: 'STD',
  ppr: 'PPR',
  'half-ppr': 'HALF',
};

interface AppHeaderProps {
  onOpenWelcome: () => void;
}

export function AppHeader({ onOpenWelcome }: AppHeaderProps) {
  const { mode } = useSeasonMode();
  const { bootstrap } = useLeagueConnection();
  const isSynced = bootstrap !== null;
  const scoringLabel = isSynced
    ? SCORING_LABELS[bootstrap.league.scoringFamily]
    : SCORING_LABELS[MOCK_MATCHUP.scoringFormat];
  const displayedWeek = isSynced
    ? bootstrap.week
    : mode === 'preseason'
      ? 1
      : MOCK_MATCHUP.week;
  const navItems = [
    { label: 'Matchup', path: '/matchup' },
    { label: 'Season', path: '/season' },
    { label: 'Trade', path: '/trade' },
    { label: 'League', path: '/league' },
    { label: 'More', path: '/more' },
  ];

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__brand" aria-label="Odds Gods Olympus">
          <span className="app-header__brand-kicker">ODDS GODS</span>
          <span className="app-header__brand-title">OLYMPUS</span>
        </div>

        <nav className="app-header__nav" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              className={({ isActive }) =>
                [
                  'app-header__nav-link',
                  isActive ? 'app-header__nav-link--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              }
              to={item.path}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="app-header__actions">
          <button
            className="app-header__help"
            onClick={onOpenWelcome}
            type="button"
          >
            How this works
          </button>
          <SeasonToggle />
          <span
            className={[
              'app-header__status',
              mode === 'preseason' ? 'app-header__status--preseason' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {mode === 'inseason' ? (
              <span className="app-header__status-dot" aria-hidden="true" />
            ) : null}
            Week {displayedWeek}
          </span>
          {isSynced ? (
            <span
              className="app-header__synced-chip"
              title={`Last updated ${new Date(bootstrap.lastUpdated).toLocaleTimeString()}`}
            >
              Synced
            </span>
          ) : (
            <span className="app-header__replay-chip">Replay</span>
          )}
          <span className="app-header__scoring-pill">
            <Gloss term="ppr">{scoringLabel}</Gloss>
          </span>
        </div>
      </div>
    </header>
  );
}
