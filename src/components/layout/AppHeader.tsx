import { NavLink } from 'react-router-dom';
import { useSeasonMode } from '../../hooks/useSeasonMode';
import { MOCK_MATCHUP } from '../../mocks';
import type { ScoringFormat } from '../../types';
import { SeasonToggle } from './SeasonToggle';
import './AppHeader.css';

const SCORING_LABELS: Record<ScoringFormat, string> = {
  standard: 'STD',
  ppr: 'PPR',
  'half-ppr': 'HALF',
};

export function AppHeader() {
  const { mode } = useSeasonMode();
  const scoringLabel = SCORING_LABELS[MOCK_MATCHUP.scoringFormat];
  const navItems = [
    { label: 'Matchup', path: '/matchup' },
    { label: 'Season', path: '/season' },
    {
      label: mode === 'preseason' ? 'Draft' : 'Trade',
      path: mode === 'preseason' ? '/draft' : '/trade',
    },
    { label: 'Rankings', path: '/rankings' },
    { label: 'League', path: '/league' },
  ];

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__brand" aria-label="Odds Gods The Lineup Lab">
          <span className="app-header__brand-kicker">ODDS GODS</span>
          <span className="app-header__brand-title">Lineup Lab</span>
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
            {mode === 'preseason' ? 'Pre-season' : `Week ${MOCK_MATCHUP.week}`}
          </span>
          <span className="app-header__scoring-pill">{scoringLabel}</span>
        </div>
      </div>
    </header>
  );
}
