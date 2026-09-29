import { useEffect, useState } from 'react';

/**
 * Whether the autopilot tools are shown on the Hub.
 *
 * "Set optimal lineup on ESPN" and the trade sender act on somebody's league on
 * their behalf. They are hidden from everybody by default, including the three
 * of us: being allowed to see a thing is not the same as wanting it on the
 * screen every time you open the Hub.
 *
 * So it is a switch rather than a role. The role still gates the switch - only
 * an admin account is offered it in settings - but nothing appears on the Hub
 * until somebody turns it on, and it stays off for a fresh browser.
 *
 * Off is also the honest default for a half-finished tool: the cost of it being
 * off is a trip to settings, and the cost of it being on is a panel offering to
 * send trades from an account that did not ask.
 *
 * Per device, not per account. It is a "show me the workbench" preference, and
 * the machine you are demoing on is not the machine you develop on.
 */

const KEY = 'og.autopilot.enabled';
const EVENT = 'og:autopilot-changed';

export function autopilotEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    /* Private windows and some embedded webviews throw on access rather than
       returning null, and a settings preference is not worth a blank page. */
    return false;
  }
}

export function setAutopilotEnabled(enabled: boolean) {
  try {
    if (enabled) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the switch lasts for this render and no longer
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * The switch, live. The Hub and the settings page read the same value, so
 * flipping it in one place has to move the other without a reload.
 */
export function useAutopilotEnabled(): boolean {
  const [enabled, setEnabled] = useState(() =>
    (typeof window === 'undefined' ? false : autopilotEnabled()));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const read = () => setEnabled(autopilotEnabled());
    read();
    window.addEventListener(EVENT, read);
    /* Another tab flipping it counts too. */
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);

  return enabled;
}
