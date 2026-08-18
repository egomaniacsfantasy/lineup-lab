import { NavLink } from 'react-router-dom';
import { useDynastyTradesExperimental } from '../../hooks/useLabsFlags';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import './BottomTabBar.css';

const BASE_TABS = [
  {
    label: 'Hub',
    path: '/matchup',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="7" height="9" rx="1.5" />
        <rect x="10" y="7" width="7" height="9" rx="1.5" />
      </svg>
    ),
  },
  {
    label: 'League',
    path: '/league',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="2.5" />
        <circle cx="13.2" cy="8.2" r="2" />
        <path d="M3.5 16c.7-2.6 2.5-4.1 4.7-4.1 2.1 0 3.8 1.3 4.5 3.7" />
        <path d="M11.5 16c.4-1.7 1.8-2.9 3.5-2.9 1.4 0 2.6.8 3.3 2.1" />
      </svg>
    ),
  },
  {
    label: 'Trades',
    path: '/market',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 7h10.5M12 4.2 15 7l-3 2.8" />
        <path d="M16 13H5.5M8 10.2 5 13l3 2.8" />
      </svg>
    ),
  },
  {
    label: 'Board',
    path: '/rankings',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 6h12M4 10h12M4 14h8" />
      </svg>
    ),
  },
  {
    label: 'More',
    path: '/more',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="4.5" cy="10" r="1.5" />
        <circle cx="10" cy="10" r="1.5" />
        <circle cx="15.5" cy="10" r="1.5" />
      </svg>
    ),
  },
];

export function BottomTabBar() {
  const { bootstrap, stored } = useLeagueConnection();
  const dynastyTradesExperimental = useDynastyTradesExperimental();
  const hideTrade =
    bootstrap != null &&
    (bootstrap.league.leagueType === 'keeper' ||
      (bootstrap.league.leagueType === 'dynasty' && !dynastyTradesExperimental));
  const showExperimentalMarketTag =
    bootstrap != null &&
    bootstrap.league.leagueType === 'dynasty' &&
    dynastyTradesExperimental;
  const tabs = stored
    ? hideTrade
      ? BASE_TABS.filter((t) => t.path !== '/market')
      : BASE_TABS.map((tab) =>
          tab.path === '/market'
            ? { ...tab, badge: showExperimentalMarketTag ? 'EXP' : null }
            : tab,
        )
    : BASE_TABS.filter((t) => t.path === '/league').map((tab) => ({
        ...tab,
        label: 'Connect',
        path: '/connect',
      }));

  /* Before a league is synced the bar holds a single "Connect" tab, which is a
     navigation control that navigates nowhere — the screen it points at is the
     screen you are on. */
  if (tabs.length < 2) return null;

  return (
    <nav className="bottom-tab-bar" aria-label="Primary">
      <div
        className="bottom-tab-bar__grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const badge = (tab as { badge?: string }).badge;
          return (
            <NavLink
              key={tab.path}
              className={({ isActive }) =>
                [
                  'bottom-tab-bar__link',
                  isActive ? 'bottom-tab-bar__link--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              }
              to={tab.path}
            >
              <span className="bottom-tab-bar__icon">{tab.icon}</span>
              <span className="bottom-tab-bar__label">
                {tab.label}
                {badge ? <span className="bottom-tab-bar__badge">{badge}</span> : null}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
