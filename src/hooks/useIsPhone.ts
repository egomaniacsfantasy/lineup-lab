import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Is this a phone we are turning away?
 *
 * Its own module because a file that exports both a component and a hook
 * breaks fast refresh, and because the three exemptions below are the part
 * worth reading on its own.
 *
 * Three things are never gated, and each for its own reason:
 *
 *   - The native shell. There the app IS the phone, and telling someone who
 *     downloaded it to go and find a laptop is not advice, it is an insult.
 *   - The design routes. They exist to render surfaces at chosen widths, most
 *     of them phone widths, which is exactly what a build has to keep doing
 *     while the phone version is being made.
 *   - Anyone who has asked to see it anyway, with ?desktop=1. There has to be
 *     a way to look at the real thing on a real phone while it is built, and
 *     the choice sticks so it survives every link you follow afterwards.
 */

const KEY = 'oddsgods.forceDesktop';

/**
 * A phone, by shape rather than by user agent.
 *
 * 767px is the line the rest of the app already treats as the tablet
 * boundary, which is what makes "a laptop or tablet" the honest advice.
 *
 * The second query is a phone lying on its side: 844 wide beats the first
 * test comfortably while leaving 390px of height, which is worse than the
 * portrait case rather than better. A coarse pointer is what separates that
 * from a desktop window someone has dragged short, and a desktop window is
 * not a phone however flat it gets.
 */
const PHONE = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';

function askedForItAnyway(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get('desktop');
    /* ?desktop=1 turns it on and it sticks, so it survives every link you
       follow afterwards. ?desktop=0 is the way back out, which the first
       version of this did not have: a sticky override with no off switch is
       one someone turns on once and can never see the real screen again. */
    if (asked === '1') {
      window.localStorage.setItem(KEY, '1');
      return true;
    }
    if (asked === '0') {
      window.localStorage.removeItem(KEY);
      return false;
    }
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    /* Storage throws in a private window. An override nobody can turn on is
       a smaller problem than a page that will not render. */
    return false;
  }
}

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (window.location.pathname.startsWith('/design/')) return;
    if (askedForItAnyway()) return;

    const mq = window.matchMedia(PHONE);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return phone;
}
