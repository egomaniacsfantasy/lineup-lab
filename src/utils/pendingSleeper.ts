import type { StoredConnection } from '../contexts/LeagueConnectionContext';

/**
 * The league somebody already showed us, kept for the other side of sign-up.
 *
 * The anonymous screens end in a real number about a real league, which means
 * by the time anybody presses the sign-up button we have already resolved
 * everything a connection needs: who they are on Sleeper, their user id, which
 * league they picked, its name and its season.
 *
 * Storing only the username, which is what this did first, meant the app then
 * asked them to type it again and pick the league again on the other side of
 * the form. That is the same sync twice, and it is the step that makes the
 * funnel feel like a form rather than a door. Somebody who has already watched
 * their own league get priced has done the work; the account should land them
 * on it.
 *
 * Two carriers, because neither is sufficient alone:
 *
 *   - The URL, so the handoff survives a device change. Someone who sends
 *     themselves the link, or opens the page on a laptop, arrives with the
 *     username at least. It carries the handle ONLY: a league id and a user id
 *     in a query string are somebody else's to copy, and a username is already
 *     public on every league page they are in.
 *   - localStorage, which carries the whole connection, because it never
 *     leaves the device that resolved it.
 */

const KEY = 'og.olympus.pending-sleeper';
const CONNECTION_KEY = 'og.olympus.pending-connection';

/** Query parameter the anonymous screens hand to the sign-up screen. */
export const PENDING_SLEEPER_PARAM = 'sleeper';

export function rememberPendingSleeper(username: string): void {
  const handle = username.trim();
  if (!handle) return;
  try {
    window.localStorage.setItem(KEY, handle);
  } catch {
    /* Private windows throw. A prefilled field is a convenience, never a
       reason to take the page down. */
  }
}

/**
 * Keep the whole resolved connection, so sign-up lands on the league rather
 * than on the form that finds it again.
 */
export function rememberPendingConnection(connection: StoredConnection): void {
  try {
    window.localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection));
  } catch {
    /* Same as above: the username alone still gets them most of the way. */
  }
}

export function readPendingSleeper(): string {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Read it once and clear it.
 *
 * Used by the connect screen, because a remembered username that outlives the
 * connection it was for is a field that mysteriously refills months later with
 * a name the person may no longer use.
 */
export function consumePendingSleeper(): string {
  const handle = readPendingSleeper();
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to undo */
  }
  return handle;
}

/**
 * The connection, read once and cleared.
 *
 * Validated rather than trusted: this is JSON out of local storage, which any
 * older build of the app may have written in a different shape, and connecting
 * to a half-built object is a worse failure than asking for the username
 * again.
 */
export function consumePendingConnection(): StoredConnection | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CONNECTION_KEY);
    window.localStorage.removeItem(CONNECTION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredConnection>;
    if (
      (parsed.provider !== 'sleeper' && parsed.provider !== 'espn')
      || typeof parsed.leagueId !== 'string'
      || typeof parsed.userId !== 'string'
      || !Array.isArray(parsed.allLeagueIds)
    ) {
      return null;
    }
    return parsed as StoredConnection;
  } catch {
    return null;
  }
}
