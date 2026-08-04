import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useDynastyTradesExperimental } from '../../hooks/useLabsFlags';
import { useSeasonMode } from '../../hooks/useSeasonMode';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { useOddsFormat } from '../../contexts/OddsFormatContext';
import { MOCK_MATCHUP } from '../../mocks';
import type { ScoringFormat } from '../../types';
import { PROVIDER_LABEL } from '../../utils/provider';
import { isAgreementAdmin } from '../../utils/admin';
import { Gloss } from '../ui/Gloss';
import { AccountMenu } from './AccountMenu';
import './AppHeader.css';

const SCORING_LABELS: Record<ScoringFormat, string> = {
  standard: 'STD',
  ppr: 'PPR',
  'half-ppr': 'HALF',
};

const STATE_LABELS: Record<string, (season: string, week: number) => string> = {
  IN_SEASON: (_season, week) => `Week ${week}`,
  LEAGUE_PLAYOFFS: (_season, week) => `Playoffs · Week ${week}`,
  COMPLETE: (season) => `${season} final`,
};

export function AppHeader() {
  const { mode, seasonState, season, nflWeek } = useSeasonMode();
  const { bootstrap, refresh, stored, isLoading, error } = useLeagueConnection();
  const { format, toggleFormat } = useOddsFormat();
  const { user } = useAuth();
  const isAdmin = isAgreementAdmin(user?.email);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isSynced = bootstrap !== null;
  const dynastyTradesExperimental = useDynastyTradesExperimental();
  const providerLabel = stored ? PROVIDER_LABEL[stored.provider] : 'your league host';
  const scoringLabel = isSynced
    ? SCORING_LABELS[bootstrap.league.scoringFamily]
    : stored
      ? '...'
      : SCORING_LABELS[MOCK_MATCHUP.scoringFormat];
  const displayedWeek = isSynced ? Math.max(bootstrap.week, nflWeek) : Math.max(1, nflWeek);
  const stateLabel = (STATE_LABELS[seasonState] ?? STATE_LABELS.IN_SEASON)(
    season,
    displayedWeek,
  );
  const hideTrade =
    isSynced &&
    (bootstrap.league.leagueType === 'keeper' ||
      (bootstrap.league.leagueType === 'dynasty' && !dynastyTradesExperimental));
  const showExperimentalMarketTag =
    isSynced &&
    bootstrap.league.leagueType === 'dynasty' &&
    dynastyTradesExperimental;
  const navItems = stored
    ? [
        { label: 'Matchup', path: '/matchup' },
        { label: 'League', path: '/league' },
        ...(hideTrade ? [] : [{ label: 'Market', path: '/market', badge: showExperimentalMarketTag ? 'experimental' : null }]),
        { label: 'Board', path: '/rankings' },
        { label: 'More', path: '/more' },
      ]
    : [{ label: 'Connect', path: '/connect' }];
  const showSyncing = stored && !bootstrap && isLoading;
  const showSyncIssue = stored && !bootstrap && !isLoading && Boolean(error);

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__brand" aria-label="Odds Gods">
          <span className="app-header__brand-title">ODDS GODS</span>
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
              <span>{item.label}</span>
              {item.badge ? <span className="app-header__nav-badge">{item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className="app-header__actions">
          {isAdmin ? (
            <NavLink
              className="app-header__admin"
              title="Admin: import projections, live reprice"
              to="/admin/projections"
            >
              Admin
            </NavLink>
          ) : null}
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
              title={`Last synced ${new Date(bootstrap.lastUpdated).toLocaleTimeString()}. Click to pull the latest from ${providerLabel}.`}
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
          ) : showSyncing ? (
            <span className="app-header__replay-chip">Syncing</span>
          ) : showSyncIssue ? (
            <button
              className="app-header__sync"
              onClick={() => {
                setIsRefreshing(true);
                void refresh().finally(() => setIsRefreshing(false));
              }}
              title={error ?? 'We could not reload this league. Try syncing again.'}
              type="button"
            >
              <span className="app-header__sync-label">Sync issue</span>
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
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
