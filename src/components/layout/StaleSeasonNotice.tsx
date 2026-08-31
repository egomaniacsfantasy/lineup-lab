import { useEffect, useRef, useState } from 'react';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { fetchLeagueSuccessor } from '../../services/leagueApi';
import { connectedSeasonIsStale } from '../../utils/leagueCapabilities';
import { ShellNotice } from './ShellNotices';

/**
 * You were looking at last season. You are not any more.
 *
 * Sleeper gives a dynasty or keeper league a NEW league id every year and
 * chains them by previous_league_id. A league connected last season keeps
 * answering for ever: last year's rosters, last year's records, and this
 * year's prices built on both. Nothing errors. It is a completely healthy
 * response to a question about the wrong year, which is why it can sit there
 * for months looking like a modelling problem.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THIS FOLLOWS THE CHAIN BY ITSELF
 *
 * The first version said the year was wrong and pointed at Connect, leaving
 * the person to work out which of their leagues was the right one. The second
 * found the right one and put it behind a button.
 *
 * Both were the same mistake in different sizes. We know what season it is,
 * Sleeper's league chain is public, and the answer is one walk up it. There is
 * nothing for a person to decide here: nobody wants to be looking at last
 * year, and being asked to confirm that is being asked to approve a repair
 * they did not ask to be broken. So it repairs itself and says what it did.
 *
 * What is left on screen is a receipt, not a warning: it names the league you
 * were moved to, and it goes away. The loud red version survives for the one
 * case where there is genuinely nothing to switch to, because that is the case
 * where the numbers really are a year old and the user really does need to
 * know before they read one.
 */

/** How long the "we moved you" receipt stays before it stops being news. */
const RECEIPT_MS = 12_000;

/**
 * The receipt outlives this component, because switching leagues remounts it.
 *
 * connect() changes the connection the whole shell is keyed on, so the element
 * that set the state is gone by the time the new board renders and useState is
 * back to its initial value. The first version of this therefore moved people
 * to the right season and told them nothing at all, which is the one thing an
 * automatic change must never do: a board full of different teams with no
 * explanation is indistinguishable from a bug.
 *
 * sessionStorage, not local: it is news for this visit, not for ever.
 */
const RECEIPT_KEY = 'og.olympus.moved-season';

interface Receipt {
  leagueId: string;
  leagueName: string;
  season: string;
  at: number;
}

function readReceipt(): Receipt | null {
  try {
    const raw = window.sessionStorage.getItem(RECEIPT_KEY);
    return raw ? (JSON.parse(raw) as Receipt) : null;
  } catch {
    return null;
  }
}

function writeReceipt(receipt: Receipt | null) {
  try {
    if (receipt) window.sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
    else window.sessionStorage.removeItem(RECEIPT_KEY);
  } catch {
    /* Private windows throw. A missing receipt is a smaller problem than a
       page that will not render. */
  }
}

type State =
  | { name: 'idle' }
  | { name: 'looking' }
  | { name: 'moved'; season: string; leagueName: string }
  | { name: 'stuck'; season: string };

export function StaleSeasonNotice() {
  const { bootstrap, stored, connect } = useLeagueConnection();
  const [state, setState] = useState<State>(() => {
    const receipt = readReceipt();
    if (!receipt) return { name: 'idle' };
    if (Date.now() - receipt.at > RECEIPT_MS) {
      writeReceipt(null);
      return { name: 'idle' };
    }
    return { name: 'moved', season: receipt.season, leagueName: receipt.leagueName };
  });

  const stale = connectedSeasonIsStale(bootstrap);
  const leagueId = stored?.leagueId ?? null;
  const userId = stored?.userId ?? null;

  /* Tried once per league. Without this the switch re-runs on every render
     caused by the switch, which is a loop that reconnects for ever. */
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!stale || !leagueId || !userId) return;
    if (attempted.current === leagueId) return;
    attempted.current = leagueId;

    let cancelled = false;
    setState({ name: 'looking' });

    fetchLeagueSuccessor(leagueId, userId)
      .then((result) => {
        if (cancelled) return;
        const season = String(result.season ?? bootstrap?.state.season ?? '');
        if (!result.successor) {
          /* Three ways to come back empty, and only one of them is worth
             alarming about.
             
             `already_current` means the league we just asked about IS this
             season, which happens on the render right after a switch, before
             the new bootstrap has landed and turned `stale` off. Treating that
             as "nobody has rolled your league over" put a red warning on a
             league that had just been correctly moved forward, which is the
             opposite of what happened. */
          if (result.reason === 'already_current') {
            /* And it must not clear a receipt that is already up. The switch
               changes the league id, which re-runs this effect against the NEW
               league, which is of course already current: the second answer
               was erasing the message the first one had just earned, so the
               app moved you forward and told you nothing. */
            setState((prev) => (prev.name === 'moved' ? prev : { name: 'idle' }));
            return;
          }
          setState({ name: 'stuck', season });
          return;
        }
        setState({ name: 'moved', season, leagueName: result.successor.name });
        writeReceipt({
          leagueId: result.successor.id,
          leagueName: result.successor.name,
          season: result.successor.season,
          at: Date.now(),
        });
        /* Everything else about the connection is the same account and the
           same person; only the league changes. Rebuilding it from scratch
           would drop the ESPN credentials a stored connection can carry. */
        connect({
          ...stored!,
          leagueId: result.successor.id,
          leagueName: result.successor.name,
          season: result.successor.season,
        });
      })
      /* A failed lookup is not worth an alarm of its own. The banner below
         still says the year is wrong, which is the part that matters. */
      .catch(() => {
        if (!cancelled) setState({ name: 'stuck', season: String(bootstrap?.state.season ?? '') });
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrap?.state.season, connect, leagueId, stale, stored, userId]);

  /* The receipt is news for a moment and then it is clutter. The warning is
     not: it stays until the league it is warning about is gone. */
  useEffect(() => {
    if (state.name !== 'moved') return;
    const receipt = readReceipt();
    const elapsed = receipt ? Date.now() - receipt.at : 0;
    const timer = window.setTimeout(
      () => {
        writeReceipt(null);
        setState({ name: 'idle' });
      },
      Math.max(0, RECEIPT_MS - elapsed),
    );
    return () => window.clearTimeout(timer);
  }, [state.name]);


  if (!stale && state.name !== 'moved') return null;
  if (!bootstrap || !stored) return null;
  if (state.name === 'idle' || state.name === 'looking') return null;

  if (state.name === 'moved') {
    return (
      <ShellNotice tone="note">
        <strong>Moved you to {state.season}.</strong> {state.leagueName} is the current
        season of this league, and everything below is priced from it.
      </ShellNotice>
    );
  }

  return (
    <ShellNotice role="alert" tone="alert">
      <strong>This is your {bootstrap.league.season} league.</strong> Nobody has started
      your {state.season || bootstrap.state.season} league on Sleeper yet, so there is
      nothing to move you to. Every roster, record and price below is from last year.
    </ShellNotice>
  );
}
