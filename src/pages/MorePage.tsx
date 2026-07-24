import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LeagueSettings } from '../components/league/LeagueSettings';
import { WelcomeCard } from '../components/onboarding/WelcomeCard';
import { useAuth } from '../contexts/AuthContext';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import {
  useDynastyTradesExperimental,
  usePlayerVotesEnabled,
  writeDynastyTradesExperimental,
} from '../hooks/useLabsFlags';
import { toLeagueConnection } from '../adapters/connectedLeague';
import { PROVIDER_LABEL } from '../utils/provider';
import './MorePage.css';
import '../components/league/LeagueSettings.css';

export function MorePage() {
  const { bootstrap, stored, disconnect } = useLeagueConnection();
  const { user, signOut } = useAuth();
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const navigate = useNavigate();
  const dynastyTradesExperimental = useDynastyTradesExperimental();
  const playerVotesEnabled = usePlayerVotesEnabled();
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
      title: 'Board · Sheet view',
      body: 'Player board plus the power-user spreadsheet view.',
      path: '/rankings?view=sheet',
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
      <section className="more-page__section">
        <p className="more-page__eyebrow">Labs</p>
        <div className="more-page__card more-page__labs-card">
          <div>
            <h3 className="more-page__card-title">Dynasty trades (experimental)</h3>
            <p className="more-page__card-body">
              Temporary override for product testing. Market opens in dynasty leagues, but pricing
              quality is still provisional.
            </p>
          </div>
          <button
            aria-pressed={dynastyTradesExperimental}
            className={[
              'more-page__toggle',
              dynastyTradesExperimental ? 'more-page__toggle--on' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => writeDynastyTradesExperimental(!dynastyTradesExperimental)}
            type="button"
          >
            <span />
          </button>
        </div>
        {playerVotesEnabled ? (
          <Link className="more-page__card" to="/rankings?labs=player-votes">
            <div>
              <h3 className="more-page__card-title">Player votes</h3>
              <p className="more-page__card-body">
                Dark-launched Keep / Trade / Cut prompt. Votes queue locally and do not touch Franco&apos;s pipeline.
              </p>
            </div>
            <span className="more-page__card-cta">Open</span>
          </Link>
        ) : null}
      </section>
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
