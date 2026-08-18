import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * ESPN sign-in inside the native app.
 *
 * ESPN keeps a league session in `espn_s2`, which is HttpOnly, so no page
 * script can read it. That left two bad options: a browser extension, which
 * needs a computer and a store listing, or a server driving a headless browser,
 * which needs the user's Disney password to reach our servers and was slow
 * enough to time out.
 *
 * In the native app the user signs in on ESPN's own page inside a web view we
 * present, so their password never touches us, and the cookie is readable
 * afterwards because a native cookie store is not bound by the HttpOnly rule
 * that binds JavaScript.
 *
 * Browsers cannot do this. `isNativeEspnAuthAvailable` is how the connect
 * screen knows which path to offer.
 */
export interface EspnNativeAuthResult {
  status: 'ok' | 'cancelled' | 'failed';
  espnS2?: string;
  swid?: string;
  reason?: string;
}

interface EspnAuthPlugin {
  signIn(options: { leagueId: string; season: string }): Promise<EspnNativeAuthResult>;
}

const EspnAuth = registerPlugin<EspnAuthPlugin>('EspnAuth');

/* isPluginAvailable() only answers yes when the native bridge has published a
   header for the plugin, which makes a registration problem indistinguishable
   from "not native" — and silently falls back to asking for a password. On a
   native platform we offer the sheet and let the call itself fail loudly if the
   plugin is missing. */
export function isNativeEspnAuthAvailable() {
  return Capacitor.isNativePlatform();
}

/** Whether the native bridge actually published the plugin. Diagnostics only. */
export function isEspnPluginRegistered() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('EspnAuth');
}

export async function signInToEspnNatively(leagueId: string, season: string) {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'failed', reason: 'not-native' } satisfies EspnNativeAuthResult;
  }
  try {
    return await EspnAuth.signIn({ leagueId, season });
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'unknown',
    } satisfies EspnNativeAuthResult;
  }
}
