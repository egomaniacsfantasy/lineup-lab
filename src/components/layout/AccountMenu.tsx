import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import type { StoredConnection } from '../../contexts/LeagueConnectionContext';
import './AccountMenu.css';

const PROVIDER_LABEL: Record<StoredConnection['provider'], string> = {
  sleeper: 'Sleeper',
  espn: 'ESPN',
};

function leagueLabel(league: StoredConnection, activeName?: string | null) {
  return (
    activeName ||
    league.leagueName ||
    league.displayName ||
    `${PROVIDER_LABEL[league.provider]} league`
  );
}

/**
 * The signed-in indicator (an initial avatar) and the league switcher in one
 * popover: which league you're in, every other league on the account, a way
 * to add more, and sign out. This is the front door for account + league
 * context that used to be buried in the More tab.
 */
export function AccountMenu() {
  const { user, signOut } = useAuth();
  const { leagues, stored, bootstrap, switchLeague } = useLeagueConnection();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const initial = (user.email?.[0] ?? 'U').toUpperCase();
  const activeName = bootstrap?.league.name ?? stored?.leagueName ?? null;
  const activeLabel = stored ? leagueLabel(stored, activeName) : 'No league yet';

  const onAddLeague = () => {
    setOpen(false);
    navigate('/league#connect');
  };

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="account-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        title={`Signed in as ${user.email}`}
        type="button"
      >
        <span className="account-menu__avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="account-menu__league-name">{activeLabel}</span>
        <svg
          className="account-menu__chevron"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open ? (
        <div className="account-menu__popover" role="menu">
          <div className="account-menu__identity">
            <span className="account-menu__identity-label">Signed in as</span>
            <span className="account-menu__identity-email">{user.email}</span>
          </div>

          {leagues.length > 0 ? (
            <div className="account-menu__section">
              <p className="account-menu__section-label">Your leagues</p>
              {leagues.map((league) => {
                const isActive =
                  stored?.provider === league.provider &&
                  stored?.leagueId === league.leagueId;
                return (
                  <button
                    className={[
                      'account-menu__league',
                      isActive ? 'account-menu__league--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={`${league.provider}:${league.leagueId}`}
                    onClick={() => {
                      if (!isActive) switchLeague(league.leagueId);
                      setOpen(false);
                    }}
                    role="menuitemradio"
                    aria-checked={isActive}
                    type="button"
                  >
                    <span className="account-menu__league-text">
                      <span className="account-menu__league-title">
                        {leagueLabel(league, isActive ? activeName : null)}
                      </span>
                      <span className="account-menu__league-sub">
                        {PROVIDER_LABEL[league.provider]} · {league.displayName || 'you'}
                      </span>
                    </span>
                    {isActive ? (
                      <span className="account-menu__league-dot" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="account-menu__actions">
            <button
              className="account-menu__action"
              onClick={onAddLeague}
              role="menuitem"
              type="button"
            >
              + Add a league
            </button>
            <button
              className="account-menu__action account-menu__action--quiet"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              role="menuitem"
              type="button"
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
