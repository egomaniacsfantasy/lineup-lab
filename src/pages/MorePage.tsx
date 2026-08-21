import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LeagueSettings } from '../components/league/LeagueSettings';
import { WelcomeCard } from '../components/onboarding/WelcomeCard';
import { useAuth } from '../contexts/AuthContext';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useOddsFormat } from '../contexts/OddsFormatContext';
import {
  useDynastyTradesExperimental,
  usePlayerVotesEnabled,
  writeDynastyTradesExperimental,
} from '../hooks/useLabsFlags';
import { toLeagueConnection } from '../adapters/connectedLeague';
import { PROVIDER_LABEL } from '../utils/provider';
import type { ScoringFormat } from '../types';
import './MorePage.css';
import '../components/league/LeagueSettings.css';

const SCORING_LABELS: Record<ScoringFormat, string> = {
  standard: 'STD',
  ppr: 'PPR',
  'half-ppr': 'HALF',
};

import { isEspnPluginRegistered } from '../utils/espnNativeAuth';
import { isAgreementAdmin } from '../utils/admin';

declare const __BUILD_STAMP__: string | undefined;
const buildStamp = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'dev';

export function MorePage() {
  const { bootstrap, stored, disconnect, refresh, isLoading, error } = useLeagueConnection();
  const { user, signOut } = useAuth();
  const { format, toggleFormat } = useOddsFormat();
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();
  const dynastyTradesExperimental = useDynastyTradesExperimental();
  const playerVotesEnabled = usePlayerVotesEnabled();
  /* The header's ADMIN pill and this link disagreed, so an account could be
     shown ADMIN in the chrome and still have no way to reach the projections
     import — the one screen the season actually depends on. One check now, the
     same one the pill uses; the older signals stay as a fallback so a machine
     that authenticated with the admin password keeps its link. */
  const isOwner =
    isAgreementAdmin(user?.email) ||
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
      title: 'Board · Sheet view',
      body: 'Player board plus the power-user spreadsheet view.',
      path: '/rankings?view=sheet',
    },
    ...(isOwner
      ? [
          {
            title: 'Projections admin',
            body: 'Owner import flow for the weekly projection workbooks.',
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
      /* Adding a second league had no entry of its own. The card here showed
         the league you were already in, and the only "add" was in an account
         menu that no longer exists on a phone — so connecting an ESPN league
         next to a Sleeper one looked impossible, and the workaround was making
         another account. */
      links: bootstrap
        ? [
            leagueDestination,
            {
              title: 'Connect another league',
              body: 'Add a Sleeper or ESPN league to this account and switch between them.',
              path: '/league#connect',
            },
          ]
        : [leagueDestination],
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

      {/* A phone has no header at all now, so sync state and the control for it
          live here. This is the only place either exists on a phone. */}
      {stored ? (
        <section className="more-page__section more-page__section--header-dupe">
          <p className="more-page__eyebrow">League sync</p>
          <div className="more-page__card more-page__labs-card">
            <div>
              <h3 className="more-page__card-title">
                {isRefreshing || isLoading
                  ? 'Syncing…'
                  : bootstrap
                    ? 'Synced'
                    : 'Not synced'}
              </h3>
              <p className="more-page__card-body">
                {isRefreshing || isLoading
                  ? `Reading your ${providerLabel ?? 'league'}.`
                  : bootstrap
                    ? `Last read at ${new Date(bootstrap.lastUpdated).toLocaleTimeString()}.`
                    : error ?? 'We could not reach your league.'}
              </p>
            </div>
            <button
              className="more-page__format"
              disabled={isRefreshing || isLoading}
              onClick={() => {
                setIsRefreshing(true);
                void refresh().finally(() => setIsRefreshing(false));
              }}
              type="button"
            >
              Sync
            </button>
          </div>
        </section>
      ) : null}

      {/* The header carries identity and state only on a phone, so the two
          display controls that used to sit up there live here now. */}
      <section className="more-page__section more-page__section--header-dupe">
        <p className="more-page__eyebrow">Display</p>
        <div className="more-page__card more-page__labs-card">
          <div>
            <h3 className="more-page__card-title">Odds format</h3>
            <p className="more-page__card-body">
              {format === 'american'
                ? 'Prices read as betting odds.'
                : 'Prices read as win percentages.'}
            </p>
          </div>
          <button
            className="more-page__format"
            onClick={toggleFormat}
            type="button"
          >
            {format === 'american' ? '+/\u2212' : '%'}
          </button>
        </div>
        {bootstrap ? (
          <div className="more-page__card more-page__labs-card">
            <div>
              <h3 className="more-page__card-title">Scoring</h3>
              <p className="more-page__card-body">
                Read from {providerLabel ?? 'your platform'}. Change it there, not here.
              </p>
            </div>
            <span className="more-page__format more-page__format--static">
              {SCORING_LABELS[bootstrap.league.scoringFamily]}
            </span>
          </div>
        ) : null}
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
                Dark-launched Keep / Trade / Cut prompt. Votes queue locally and do not touch the projection pipeline.
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
      {/* Which bundle this device is actually running. Stale builds cost this
          project real hours: a phone can hold an old bundle while the server is
          current, and every symptom then looks unfixed. */}
      <p className="more-page__build">
        Build {buildStamp}
        {isEspnPluginRegistered() ? ' · native sign-in ready' : ''}
      </p>

      <WelcomeCard isOpen={isWelcomeOpen} onDismiss={() => setIsWelcomeOpen(false)} />
    </div>
  );
}
