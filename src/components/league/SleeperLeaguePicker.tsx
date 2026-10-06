import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { connectUsername, type ApiLeagueSummary, type ProviderUser } from '../../services/leagueApi';
import { diffSelection, selectionLabel } from '../../contexts/leagueSelection';
import { LeagueChecklist } from './LeagueChecklist';
import './SleeperLeaguePicker.css';

/**
 * Which Sleeper leagues appear here.
 *
 * Sleeper answers a username with every league the account is in, and showing
 * all of them is the complaint this exists to end. The sheet lists them with
 * the ones already in the switcher ticked; ticking adds, unticking removes,
 * and nothing happens until Save. It opens from the account menu at any time,
 * and by itself once after the anonymous peek, where somebody has looked at
 * one league and has not yet been asked about the rest.
 */
export function SleeperLeaguePicker() {
  const { leaguePicker } = useLeagueConnection();
  if (!leaguePicker.open) return null;
  return <PickerSheet firstRun={leaguePicker.firstRun} />;
}

type Load =
  | { name: 'loading' }
  | { name: 'failed' }
  | { name: 'ready'; user: ProviderUser; available: ApiLeagueSummary[] };

function PickerSheet({ firstRun }: { firstRun: boolean }) {
  const { leagues, stored, sleeperUsername, closeLeaguePicker, applySleeperSelection } =
    useLeagueConnection();
  const [load, setLoad] = useState<Load>({ name: 'loading' });
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);

  const onAccount = useMemo(
    () => new Set(leagues.filter((league) => league.provider === 'sleeper').map((league) => league.leagueId)),
    [leagues],
  );

  useEffect(() => {
    if (!sleeperUsername) return undefined;
    let cancelled = false;
    setLoad({ name: 'loading' });
    connectUsername(sleeperUsername)
      .then((result) => {
        if (cancelled) return;
        const available = result.leagues ?? [];
        /* Arriving from the peek with nothing else to offer is not a
           question, so it is not a screen. */
        if (firstRun && available.every((league) => onAccount.has(league.id))) {
          closeLeaguePicker();
          return;
        }
        setTicked(new Set(available.filter((league) => onAccount.has(league.id)).map((league) => league.id)));
        setLoad({ name: 'ready', user: result.user, available });
      })
      .catch(() => {
        if (cancelled) return;
        if (firstRun) {
          closeLeaguePicker();
          return;
        }
        setLoad({ name: 'failed' });
      });
    return () => {
      cancelled = true;
    };
    /* `onAccount` is read once per load on purpose: the ticks are a draft, and
       re-seeding them whenever the list underneath changes would undo what the
       person is in the middle of choosing. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, closeLeaguePicker, firstRun, sleeperUsername]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLeaguePicker();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeLeaguePicker]);

  /* The first-run sheet stays out of the way until it has something to ask. */
  if (firstRun && load.name !== 'ready') return null;

  const toggle = (leagueId: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(leagueId)) next.delete(leagueId);
      else next.add(leagueId);
      return next;
    });

  const available = load.name === 'ready' ? load.available : [];
  const diff = diffSelection({ available, onAccount, ticked });
  const unchanged = diff.add.length === 0 && diff.removeIds.length === 0;
  const allTicked = available.length > 0 && available.every((league) => ticked.has(league.id));
  const activeUnticked =
    stored?.provider === 'sleeper' && diff.removeIds.includes(stored.leagueId) ? stored : null;

  const save = () => {
    if (load.name !== 'ready' || unchanged) return;
    applySleeperSelection({ user: load.user, add: diff.add, removeIds: diff.removeIds });
    closeLeaguePicker();
  };

  return createPortal(
    <div className="league-picker__scrim" onClick={closeLeaguePicker} role="presentation">
      <div
        aria-labelledby="league-picker-title"
        aria-modal="true"
        className="league-picker"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <span aria-hidden="true" className="league-picker__grip" />
        <div className="league-picker__head">
          <h2 className="league-picker__title" id="league-picker-title">
            {firstRun ? 'Which leagues do you want here?' : 'Your Sleeper leagues'}
          </h2>
          <p className="league-picker__sub">
            {load.name === 'ready'
              ? `${load.user.displayName} is in ${available.length} on Sleeper. Tick the ones you want to see here. You can come back and change this any time.`
              : sleeperUsername
                ? `Looking up ${sleeperUsername} on Sleeper.`
                : 'No Sleeper account is connected yet.'}
          </p>
        </div>

        {load.name === 'loading' && sleeperUsername ? (
          <div aria-hidden="true" className="league-picker__skeleton">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {load.name === 'failed' ? (
          <div className="league-picker__failed" role="status">
            <p>Sleeper did not answer. Your leagues are unchanged.</p>
            <button className="league-picker__link" onClick={() => setAttempt((n) => n + 1)} type="button">
              Try again
            </button>
          </div>
        ) : null}

        {load.name === 'ready' ? (
          <>
            <div className="league-picker__bar">
              <span className="league-picker__count">
                {ticked.size} of {available.length} ticked
              </span>
              <button
                className="league-picker__link"
                onClick={() =>
                  setTicked(allTicked ? new Set() : new Set(available.map((league) => league.id)))
                }
                type="button"
              >
                {allTicked ? 'Untick all' : 'Tick all'}
              </button>
            </div>
            <div className="league-picker__list">
              <LeagueChecklist leagues={available} onToggle={toggle} selected={ticked} />
            </div>
            {activeUnticked ? (
              <p className="league-picker__note" role="status">
                {activeUnticked.leagueName ?? 'The league you have open'} is open now. Removing it
                switches you to another league.
              </p>
            ) : null}
          </>
        ) : null}

        <div className="league-picker__actions">
          <button
            className="league-picker__save"
            disabled={load.name !== 'ready' || unchanged}
            onClick={save}
            type="button"
          >
            {selectionLabel(diff.add.length, diff.removeIds.length)}
          </button>
          <button className="league-picker__cancel" onClick={closeLeaguePicker} type="button">
            {firstRun ? 'Just this one for now' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
