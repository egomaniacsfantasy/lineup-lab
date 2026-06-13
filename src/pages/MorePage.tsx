import { Link } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useSeasonMode } from '../hooks/useSeasonMode';
import './MorePage.css';

const MORE_LINKS = [
  {
    title: 'Draft tools',
    body: 'Draft-slot boards, availability windows, and August-only prep work.',
    path: '/draft',
  },
  {
    title: 'Rankings',
    body: 'Consensus boards and ranking mechanics that sit outside the weekly core flow.',
    path: '/rankings',
  },
  {
    title: 'Projections admin',
    body: "Owner-only: import the weekly rankings XLSX and every league's lines recompute.",
    path: '/admin/projections',
  },
];

export function MorePage() {
  const { mode } = useSeasonMode();
  const { bootstrap, stored } = useLeagueConnection();

  return (
    <div className="more-page">
      <h1 className="visually-hidden">More</h1>
      {mode === 'inseason' ? (
        <SeasonalNotice>
          Matchup, season, trade, and league stay in the main tab bar. Draft and rankings live here.
        </SeasonalNotice>
      ) : null}

      <section className="more-page__module">
        <p className="more-page__eyebrow">Your league</p>
        {bootstrap ? (
          <>
            <h2 className="more-page__title">{bootstrap.league.name}</h2>
            <p className="more-page__body">
              Synced from Sleeper as {stored?.displayName ?? 'you'}. Manage or
              switch leagues on the{' '}
              <Link className="more-page__inline-link" to="/league">
                League tab
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <h2 className="more-page__title">Connect your Sleeper league</h2>
            <p className="more-page__body">
              You&apos;re on the demo league. One username connects your real
              rosters, matchups, and standings. Read-only, no password.
            </p>
            <Link className="more-page__connect-cta" to="/league#connect">
              Connect with Sleeper
            </Link>
          </>
        )}
      </section>

      <section className="more-page__module">
        <p className="more-page__eyebrow">More</p>
        <h2 className="more-page__title">Seasonal tools and side books</h2>
        <p className="more-page__body">
          The weekly story stays in the main five tabs. Everything else lives here.
        </p>
      </section>

      <div className="more-page__grid">
        {MORE_LINKS.map((link) => (
          <Link className="more-page__card" key={link.path} to={link.path}>
            <div>
              <h3 className="more-page__card-title">{link.title}</h3>
              <p className="more-page__card-body">{link.body}</p>
            </div>
            <span className="more-page__card-cta">Open</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
