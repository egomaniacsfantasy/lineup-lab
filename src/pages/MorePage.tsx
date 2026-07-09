import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LeagueSettings } from '../components/league/LeagueSettings';
import { WelcomeCard } from '../components/onboarding/WelcomeCard';
import { useAuth } from '../contexts/AuthContext';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { toLeagueConnection } from '../adapters/connectedLeague';
import { PROVIDER_LABEL } from '../utils/provider';
import './MorePage.css';
import '../components/league/LeagueSettings.css';

export function MorePage() {
  const { bootstrap, stored, disconnect } = useLeagueConnection();
  const { user, signOut } = useAuth();
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const navigate = useNavigate();
  const isOwner =
    user?.app_metadata?.role === 'owner' ||
    user?.user_metadata?.role === 'owner' ||
    Boolean(window.localStorage.getItem('og.projections.adminpw'));
  const providerLabel = stored ? PROVIDER_LABEL[stored.provider] : null;
  const leagueDestination = bootstrap
    ? {
        title: bootstrap.league.name,
        body: `Synced from ${providerLabel ?? 'your platform'} as ${stored?.displayName ?? 'you'}.`,
        path: '/league',
      }
    : {
        title: 'Connect a league',
        body: 'Add or switch to a synced Sleeper or ESPN league.',
        path: '/league#connect',
      };
  const toolLinks = [
    {
      title: 'Draft tools',
      body: 'Draft-slot boards and availability windows.',
      path: '/draft',
    },
    {
      title: 'Projections',
      body: 'Player projection table and agreement columns.',
      path: '/projections',
    },
    ...(isOwner
      ? [
          {
            title: 'Projections admin',
            body: 'Owner import flow for weekly Franco workbooks.',
            path: '/admin/projections',
          },
        ]
      : []),
  ];
  const groups = [
    {
      title: 'Tools',
      links: toolLinks,
    },
    {
      title: 'League',
      links: [leagueDestination],
    },
    {
      title: 'Help',
      links: [
        {
          title: 'How this works',
          body: 'Open the matchup walkthrough.',
          action: () => setIsWelcomeOpen(true),
        },
      ],
    },
  ];

  return (
    <div className="more-page">
      <h1 className="visually-hidden">More</h1>

      <section className="more-page__module">
        <p className="more-page__eyebrow">Account</p>
        <h2 className="more-page__title">{user?.email ?? 'Signed in'}</h2>
        <button
          className="more-page__connect-cta more-page__signout"
          onClick={() => void signOut()}
          type="button"
        >
          Log out
        </button>
      </section>

      {groups.map((group) => (
        <section className="more-page__section" key={group.title}>
          <p className="more-page__eyebrow">{group.title}</p>
          <div className="more-page__grid">
            {group.links.map((link) =>
              'path' in link ? (
                <Link className="more-page__card" key={link.title} to={link.path}>
                  <div>
                    <h3 className="more-page__card-title">{link.title}</h3>
                    <p className="more-page__card-body">{link.body}</p>
                  </div>
                  <span className="more-page__card-cta">Open</span>
                </Link>
              ) : (
                <button
                  className="more-page__card more-page__card--button"
                  key={link.title}
                  onClick={link.action}
                  type="button"
                >
                  <div>
                    <h3 className="more-page__card-title">{link.title}</h3>
                    <p className="more-page__card-body">{link.body}</p>
                  </div>
                  <span className="more-page__card-cta">Open</span>
                </button>
              ),
            )}
          </div>
        </section>
      ))}
      {bootstrap ? (
        <section className="more-page__section">
          <p className="more-page__eyebrow">League settings</p>
          <LeagueSettings
            connection={toLeagueConnection(bootstrap)}
            onDisconnect={() => {
              disconnect();
            }}
            onSwitchLeague={() => {
              navigate('/league#connect');
            }}
          />
        </section>
      ) : null}
      <WelcomeCard isOpen={isWelcomeOpen} onDismiss={() => setIsWelcomeOpen(false)} />
    </div>
  );
}
