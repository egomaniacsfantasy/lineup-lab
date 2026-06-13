import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSeasonMode } from '../../hooks/useSeasonMode';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { useOddsFormat } from '../../contexts/OddsFormatContext';
import { MOCK_MATCHUP } from '../../mocks';
import type { ScoringFormat } from '../../types';
import { Gloss } from '../ui/Gloss';
import './AppHeader.css';

const SCORING_LABELS: Record<ScoringFormat, string> = {
  standard: 'STD',
  ppr: 'PPR',
  'half-ppr': 'HALF',
};

interface AppHeaderProps {
  onOpenWelcome: () => void;
}

const STATE_LABELS: Record<string, (season: string, week: number) => string> = {
  IN_SEASON: (_season, week) => `Week ${week}`,
  LEAGUE_PLAYOFFS: (_season, week) => `Playoffs · Week ${week}`,
  COMPLETE: (season) => `${season} final`,
};

export function AppHeader({ onOpenWelcome }: AppHeaderProps) {
  const { mode, seasonState, season, nflWeek } = useSeasonMode();
  const { bootstrap, refresh } = useLeagueConnection();
  const { format, toggleFormat } = useOddsFormat();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isSynced = bootstrap !== null;
  const scoringLabel = isSynced
    ? SCORING_LABELS[bootstrap.league.scoringFamily]
    : SCORING_LABELS[MOCK_MATCHUP.scoringFormat];
  const displayedWeek = isSynced ? Math.max(bootstrap.week, nflWeek) : Math.max(1, nflWeek);
  const stateLabel = (STATE_LABELS[seasonState] ?? STATE_LABELS.IN_SEASON)(
    season,
    displayedWeek,
  );
  // Trade tools are redraft-only for now; hide the tab in dynasty/keeper.
  const hideTrade = isSynced && bootstrap.league.leagueType !== 'redraft';
  const navItems = [
    { label: 'Matchup', path: '/matchup' },
    { label: 'Season', path: '/season' },
    ...(hideTrade ? [] : [{ label: 'Trade', path: '/trade' }]),
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
            {stateLabel}
          </span>
          {isSynced ? (
            <button
              className={[
                'app-header__sync',
                isRefreshing ? 'app-header__sync--busy' : '',
              ].join(' ')}
              disabled={isRefreshing}
              onClick={() => {
                setIsRefreshing(true);
                void refresh().finally(() => setIsRefreshing(false));
              }}
              title={`Last synced ${new Date(bootstrap.lastUpdated).toLocaleTimeString()}. Click to pull the latest from Sleeper.`}
              type="button"
            >
              <svg
                className="app-header__sync-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v5h-5" />
              </svg>
              <span className="app-header__sync-label">
                {isRefreshing ? 'Syncing' : 'Synced'}
              </span>
            </button>
          ) : (
            <span className="app-header__replay-chip">Not synced</span>
          )}
          <span className="app-header__scoring-pill">
            <Gloss term="ppr">{scoringLabel}</Gloss>
          </span>
          <button
            className="app-header__odds-toggle"
            onClick={toggleFormat}
            title={
              format === 'american'
                ? 'Showing betting odds. Click for plain win percentages.'
                : 'Showing win percentages. Click for betting odds.'
            }
            type="button"
          >
            {format === 'american' ? '+/−' : '%'}
          </button>
        </div>
      </div>
    </header>
  );
}
