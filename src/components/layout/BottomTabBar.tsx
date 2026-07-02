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
    label: 'Season',
    path: '/season',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <path d="M6.5 2.8v3M13.5 2.8v3M3 8h14" />
      </svg>
    ),
  },
  {
    label: 'Trade',
    path: '/trade',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 7h10.5M12 4.2 15 7l-3 2.8" />
        <path d="M16 13H5.5M8 10.2 5 13l3 2.8" />
      </svg>
    ),
  },
  {
    label: 'My Board',
    path: '/rankings',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 6h12M4 10h12M4 14h8" />
      </svg>
    ),
  },
  {
    label: 'Projections',
    path: '/projections',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 16.5 7.5 10l3.5 3 5-8" />
        <path d="M3 3v14h14" />
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
  const { bootstrap } = useLeagueConnection();
  // The trade tools price redraft value; they don't fit dynasty/keeper yet.
  const hideTrade = bootstrap != null && bootstrap.league.leagueType !== 'redraft';
  const tabs = hideTrade ? BASE_TABS.filter((t) => t.path !== '/trade') : BASE_TABS;

  return (
    <nav className="bottom-tab-bar" aria-label="Primary">
      <div className="bottom-tab-bar__grid">
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
