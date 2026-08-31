/**
 * The Sleeper username someone typed on their phone, kept for the laptop.
 *
 * The phone gate ends in a real number about a real league, which means by the
 * time somebody presses the sign-up button they have already told us who they
 * are on Sleeper. Making them type it again on the next device is the one
 * avoidable step in a funnel that already spans two screens.
 *
 * Two carriers, because neither is sufficient alone:
 *
 *   - The URL, so the handoff survives a device change. Someone who sends
 *     themselves the link, or opens the same page on a laptop, arrives with it.
 *   - localStorage, so it survives the sign-up itself on THIS device. The URL
 *     is gone by the time the account exists and the connect screen renders.
 *
 * A username is not a secret: it is the same string that is public on every
 * league page the person is in, so there is nothing here that a query string
 * should not carry.
 */

const KEY = 'og.olympus.pending-sleeper';

/** Query parameter the phone gate hands to the sign-up screen. */
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
