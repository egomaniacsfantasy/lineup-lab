import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { needsEspnTeamPick, useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import type { StoredConnection } from '../../contexts/LeagueConnectionContext';
import { PROVIDER_LABEL } from '../../utils/provider';
import './AccountMenu.css';
import { WelcomeCard } from '../onboarding/WelcomeCard';

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
  const { leagues, stored, bootstrap, switchLeague, removeLeague, changeEspnTeam, refresh, isLoading, error } =
    useLeagueConnection();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  /* Removing a league is destructive and one row away from switching to it, so
     it asks once rather than trusting a small target next to a common one. */
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  /* More is admin-only now, and the walkthrough was the one thing in it that a
     normal user might want. It follows the account rather than disappearing. */
  const [showWelcome, setShowWelcome] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setConfirmRemove(null);
      }
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
  /* On a phone the header carries no sync control, so the avatar reports it:
     green synced, amber working, red needs attention. */
  const syncState = !stored
    ? null
    : isRefreshing || isLoading
      ? 'busy'
      : bootstrap
        ? 'ok'
        : error
          ? 'issue'
          : null;
  const syncLabel =
    syncState === 'busy'
      ? 'Syncing your league'
      : syncState === 'ok'
        ? `Synced${bootstrap ? ` at ${new Date(bootstrap.lastUpdated).toLocaleTimeString()}` : ''}`
        : syncState === 'issue'
          ? error ?? 'We could not reload this league.'
          : '';
  const onSyncNow = () => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
  };
  /* The bootstrap belongs to whichever league finished loading, which during a
     switch is still the PREVIOUS one: `stored` changes the instant you click,
     the fetch lands a moment later. Naming the active row from a bootstrap that
     is not its own put a Sleeper league's name under an ESPN league until the
     request returned. It is only a valid name once it is a name for this
     league. */
  const bootstrapIsForActive =
    bootstrap != null
    && stored != null
    && String(bootstrap.league.id) === String(stored.leagueId);
  const activeName =
    (bootstrapIsForActive ? bootstrap.league.name : null) ?? stored?.leagueName ?? null;
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
        {syncState ? (
          <span
            aria-hidden="true"
            className={`account-menu__sync-dot account-menu__sync-dot--${syncState}`}
          />
        ) : null}
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
              <p className="account-menu__section-label">
                Your leagues
                <span className="account-menu__section-count">{leagues.length}</span>
              </p>
              {leagues.map((league) => {
                const isActive =
                  stored?.provider === league.provider &&
                  stored?.leagueId === league.leagueId;
                const key = `${league.provider}:${league.leagueId}`;
                const title = leagueLabel(league, isActive ? activeName : null);
                const isConfirming = confirmRemove === key;
                /* An ESPN league linked before the team confirmation existed
                   cannot be opened until its team is picked here. It used to
                   look like every other row and simply not respond. */
                const needsPick = needsEspnTeamPick(league);
                return (
                  <div
                    className={[
                      'account-menu__league-row',
                      isActive ? 'account-menu__league-row--active' : '',
                    ].filter(Boolean).join(' ')}
                    key={key}
                  >
                    <button
                      className="account-menu__league"
                      onClick={() => {
                        if (!isActive) switchLeague(league.provider, league.leagueId);
                        setOpen(false);
                      }}
                      role="menuitemradio"
                      aria-checked={isActive}
                      type="button"
                    >
                      {/* Two providers on one account look identical in a list
                          of names. The badge is the first thing read. */}
                      <span
                        aria-hidden="true"
                        className={`account-menu__badge account-menu__badge--${league.provider}`}
                      >
                        {title.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <span className="account-menu__league-text">
                        <span className="account-menu__league-title">{title}</span>
                        {/* The season, not the username. Connecting merges the
                            current and previous season, so the same league
                            appears twice under one name — four of thirteen
                            rows on a real account — and the only thing that
                            told them apart was a league id nobody sees. The
                            username was on every row identically: it is always
                            you, so it distinguished nothing. */}
                        <span className="account-menu__league-sub">
                          {needsPick
                            ? 'Tap to pick your team'
                            : `${PROVIDER_LABEL[league.provider]}${league.season ? ` · ${league.season}` : ''}`}
                        </span>
                      </span>
                      {needsPick ? (
                        <span className="account-menu__league-flag">Action needed</span>
                      ) : isActive ? (
                        <span className="account-menu__league-dot" aria-hidden="true" />
                      ) : null}
                    </button>
                    {isConfirming ? (
                      <span className="account-menu__confirm">
                        <button
                          className="account-menu__confirm-yes"
                          onClick={() => {
                            removeLeague(league);
                            setConfirmRemove(null);
                          }}
                          type="button"
                        >
                          Remove
                        </button>
                        <button
                          className="account-menu__confirm-no"
                          onClick={() => setConfirmRemove(null)}
                          type="button"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        aria-label={`Remove ${title}`}
                        className="account-menu__league-remove"
                        onClick={() => setConfirmRemove(key)}
                        title={`Remove ${title}`}
                        type="button"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="account-menu__actions">
            {stored ? (
              <button
                className="account-menu__action"
                disabled={syncState === 'busy'}
                onClick={onSyncNow}
                role="menuitem"
                type="button"
              >
                {syncState === 'busy' ? 'Syncing…' : 'Sync now'}
                <span className="account-menu__action-note">{syncLabel}</span>
              </button>
            ) : null}
            {/* Picking the wrong team out of ESPN's list is easy and used to be
                permanent: the league kept opening on somebody else's roster with
                no way back short of removing it and starting over. */}
            {stored?.provider === 'espn' ? (
              <button
                className="account-menu__action"
                onClick={() => {
                  setOpen(false);
                  changeEspnTeam(stored);
                }}
                role="menuitem"
                type="button"
              >
                Change my team
                <span className="account-menu__action-note">
                  Pick again in {activeLabel}
                </span>
              </button>
            ) : null}
            <button
              className="account-menu__action"
              onClick={onAddLeague}
              role="menuitem"
              type="button"
            >
              + Add a league
            </button>
            <button
              className="account-menu__action"
              onClick={() => {
                setOpen(false);
                setShowWelcome(true);
              }}
              role="menuitem"
              type="button"
            >
              How this works
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

      <WelcomeCard isOpen={showWelcome} onDismiss={() => setShowWelcome(false)} />
    </div>
  );
}
