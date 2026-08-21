import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import './MobileNotice.css';

const KEY = 'oddsgods.mobileNoticeDismissed';
/* Matches the breakpoint the rest of the app treats as "phone". */
const QUERY = '(max-width: 767px)';

/**
 * Says the quiet part out loud on a phone.
 *
 * The desktop layout is where the work has gone; the phone web layout is
 * behind and people are finding it before we tell them. Saying so costs less
 * trust than letting someone conclude it on their own, and it is dismissible
 * because a warning you cannot get rid of is worse than the thing it warns
 * about.
 *
 * Not shown in the native shell, where the app IS the phone and telling
 * someone to go find a desktop is not advice, it is an insult.
 */
export function MobileNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(KEY) === '1';
    } catch {
      /* Private browsing throws on storage; a notice is not worth a crash. */
    }
    if (dismissed) return;
    const mq = window.matchMedia(QUERY);
    const sync = () => setShow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  if (!show) return null;

  return (
    <aside className="mobile-notice" role="status">
      <p className="mobile-notice__copy">
        <strong>Mobile is still early.</strong> Everything works, but the board
        has a lot more room to breathe on a desktop or tablet.
      </p>
      <button
        aria-label="Dismiss"
        className="mobile-notice__close"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, '1');
          } catch {
            /* Fine. It comes back next visit, which is the harmless failure. */
          }
          setShow(false);
        }}
        type="button"
      >
        ×
      </button>
    </aside>
  );
}
