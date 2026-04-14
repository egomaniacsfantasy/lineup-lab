import { NavLink } from 'react-router-dom';
import { useSeasonMode } from '../../hooks/useSeasonMode';
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
    label: 'Draft',
    path: '/draft',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M6 4h8v2a4 4 0 0 1-8 0V4Z" />
        <path d="M7.2 12.5h5.6M8.5 10.5v2M11.5 10.5v2M7 15.5h6" />
        <path d="M4 5.2c0 1.7.9 3 2.5 3.4M16 5.2c0 1.7-.9 3-2.5 3.4" />
      </svg>
    ),
  },
  {
    label: 'Rankings',
    path: '/rankings',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 15.5h12" />
        <rect x="4" y="10.5" width="2.5" height="5" rx="1" />
        <rect x="8.75" y="7.5" width="2.5" height="8" rx="1" />
        <rect x="13.5" y="4.5" width="2.5" height="11" rx="1" />
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
];

export function BottomTabBar() {
  const { mode } = useSeasonMode();
  const tabs = BASE_TABS.map((tab) =>
    tab.path === '/draft'
      ? { ...tab, label: mode === 'preseason' ? 'Draft' : 'Trade' }
      : tab,
  );

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
