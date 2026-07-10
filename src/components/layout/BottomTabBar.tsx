import { NavLink } from 'react-router-dom';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import './BottomTabBar.css';

const BASE_TABS = [
  {
    label: 'Matchup',
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
    label: 'Market',
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
    label: 'Proj',
    path: '/projections',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 16V4M4 16h12" />
        <rect x="6.5" y="10" width="2.4" height="4" rx="0.5" />
        <rect x="10.3" y="7" width="2.4" height="7" rx="0.5" />
        <rect x="14.1" y="4.5" width="2.4" height="9.5" rx="0.5" />
      </svg>
    ),
  },
  {
    label: 'Trades',
    path: '/trade-analyzer',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 7h9M11 4.5 13.5 7 11 9.5" />
        <path d="M16 13H7M9 10.5 6.5 13 9 15.5" />
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
  // The market tools price redraft value; they don't fit dynasty/keeper yet.
  const hideTrade = bootstrap != null && bootstrap.league.leagueType !== 'redraft';
  const tabs = stored
    ? hideTrade
      ? BASE_TABS.filter((t) => t.path !== '/market' && t.path !== '/trade-analyzer')
      : BASE_TABS
    : BASE_TABS.filter((t) => t.path === '/league').map((tab) => ({
        ...tab,
        label: 'Connect',
        path: '/connect',
      }));

  return (
    <nav className="bottom-tab-bar" aria-label="Primary">
      <div
        className="bottom-tab-bar__grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => (
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
            <span className="bottom-tab-bar__indicator" aria-hidden="true" />
            <span className="bottom-tab-bar__icon">{tab.icon}</span>
            <span className="bottom-tab-bar__label">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
