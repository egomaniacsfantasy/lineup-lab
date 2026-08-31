import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
 *   - The sign-up screen, but ONLY when it arrives carrying a username from
 *     the peek. The gate's whole job is to end in an account, and an email and
 *     a password are two text fields, which a phone has; without this the
 *     button at the bottom of the pitch loops straight back to the pitch.
 *
 *     Narrow on purpose. A bare /signin on a phone is still gated, because the
 *     original complaint stands for anyone arriving cold: they would be asked
 *     to make an account and told at the END of it to go and find a laptop.
 *     ?sleeper= is proof that has already happened in the other order, since
 *     the only thing that sets it is the peek, and the peek only exists after
 *     someone has watched their own league get priced.
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

/**
 * Did the sign-up screen arrive from the peek, rather than cold?
 *
 * Read straight off the URL rather than from storage: a stored flag would keep
 * letting a phone past this screen long after the visit that earned it.
 */
function cameFromThePeek(search: string): boolean {
  try {
    return Boolean(new URLSearchParams(search).get('sleeper'));
  } catch {
    return false;
  }
}

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  /* From the router, not from window.location, so this re-runs when the app
     navigates.
     
     It used to read window.location once, in an effect with no dependencies.
     That was fine while every exemption was a property of the whole visit
     (native, a design route, an explicit override). The sign-up exemption is
     not: it is true of ONE path. Read once, it disabled the gate for the rest
     of the page load, so somebody who arrived at /signin from the peek and
     then moved on got the entire desktop app on their phone. Which is the one
     outcome this hook exists to prevent, reached through the door added to
     help them. */
  const { pathname, search } = useLocation();

  useEffect(() => {
    const exempt =
      Capacitor.isNativePlatform()
      || pathname.startsWith('/design/')
      || (pathname === '/signin' && cameFromThePeek(search))
      || askedForItAnyway();

    /* Set on every route, both ways. An early return could only ever leave
       the gate off, which is how the leak above survived: turning it back on
       when an exemption stops applying is the half that was missing. */
    if (exempt) {
      setPhone(false);
      return undefined;
    }

    const mq = window.matchMedia(PHONE);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [pathname, search]);

  return phone;
}
