import { useState } from 'react';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { ShellNotice } from './ShellNotices';

/**
 * What this product is not, yet, for a dynasty or keeper league.
 *
 * Trades are hidden entirely in these leagues, and that decision is right: the
 * engine simulates a rest-of-season, and half of what changes hands in dynasty
 * is draft picks and players valued for years the sim does not run. But hiding
 * a tab explains nothing. Somebody who came here because their league is a
 * dynasty league sees a product with a piece missing and no account of why, and
 * fills in the gap themselves, usually with "this is broken".
 *
 * The same applies to every number on the Board. Those are rest-of-season
 * values, which is the right basis for a redraft league and only half the
 * question in a league where a rookie is an asset for four more years. The
 * numbers are not wrong; their scope is narrower than the league is, and
 * saying so is the difference between a limitation and a defect.
 *
 * So it says both, once, at the top, in the brand's own colour rather than in
 * red: this is a scope note, not an alarm, and an alarm that fires on a healthy
 * league teaches people to stop reading alarms.
 *
 * Dismissible, and only for the session. It is not news after the first
 * screen, and it should not be an argument you have to win every morning.
 */

const DISMISS_KEY = 'og.olympus.dynasty-notice-dismissed';

function alreadyDismissed(leagueId: string | null): boolean {
  if (!leagueId) return false;
  try {
    return window.sessionStorage.getItem(`${DISMISS_KEY}:${leagueId}`) === '1';
  } catch {
    return false;
  }
}

export function DynastyNotice() {
  const { bootstrap, stored } = useLeagueConnection();
  const leagueId = stored?.leagueId ?? null;
  const [dismissed, setDismissed] = useState(() => alreadyDismissed(leagueId));

  const leagueType = bootstrap?.league.leagueType;
  if (!bootstrap || (leagueType !== 'dynasty' && leagueType !== 'keeper')) return null;
  if (dismissed) return null;

  const label = leagueType === 'dynasty' ? 'Dynasty' : 'Keeper';

  return (
    <ShellNotice
      onDismiss={() => {
        setDismissed(true);
        try {
          if (leagueId) window.sessionStorage.setItem(`${DISMISS_KEY}:${leagueId}`, '1');
        } catch {
          /* Private windows throw. Being asked again next visit is a smaller
             problem than a page that will not render. */
        }
      }}
      tone="note"
    >
      <strong>{label} league, and we are still building for it.</strong> Trade pricing is
      off here until the engine can value picks and future seasons, and every
      player value and ranking on this site is for this season alone.
    </ShellNotice>
  );
}
