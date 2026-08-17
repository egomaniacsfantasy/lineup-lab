/**
 * Bridge to the Odds Gods ESPN connector extension.
 *
 * ESPN's `espn_s2` session cookie is HttpOnly, so no page script can read it —
 * `document.cookie` will never contain it, which is why the old bookmarklet
 * could not work and was removed. Only an extension with the `cookies`
 * permission (or a native webview) can read it.
 *
 * We need the cookie rather than just the league data because the server
 * reprices every six hours on its own. A content script that only fetched
 * league JSON while the user sat on espn.com would leave every league stale
 * the moment they closed the tab.
 *
 * Transport is `window.postMessage` both ways; the extension's content script
 * relays to its service worker. The page never touches a chrome API.
 */

const EXT_SOURCE = 'olympus-ext';
const PAGE_SOURCE = 'olympus-page';

export interface EspnExtensionSession {
  espnS2: string | null;
  swid: string | null;
}

interface ExtMessage {
  source?: string;
  type?: string;
  espnS2?: string | null;
  swid?: string | null;
}

function isExtMessage(event: MessageEvent): event is MessageEvent<ExtMessage> {
  return (
    event.source === window
    && typeof event.data === 'object'
    && event.data !== null
    && (event.data as ExtMessage).source === EXT_SOURCE
  );
}

/**
 * Resolves true when the extension answers a ping.
 *
 * The content script also announces itself unprompted on load, so this both
 * pings and listens: whichever arrives first wins. Callers poll this so the
 * install step can flip to "connected" the moment the user finishes, without
 * asking them to reload.
 */
export function detectEspnExtension(timeoutMs = 600): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (found: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(found);
    };

    const onMessage = (event: MessageEvent) => {
      if (!isExtMessage(event)) return;
      if (event.data.type === 'OLYMPUS_ESPN_READY') finish(true);
    };

    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    window.postMessage({ source: PAGE_SOURCE, type: 'OLYMPUS_ESPN_PING' }, window.location.origin);
  });
}

/**
 * Asks the extension for the ESPN session cookies.
 *
 * Returns nulls rather than throwing when the user is not signed in to ESPN,
 * so the caller can show "sign in to ESPN first" instead of an error.
 */
export function requestEspnSession(timeoutMs = 4000): Promise<EspnExtensionSession> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ espnS2: null, swid: null });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (session: EspnExtensionSession) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(session);
    };

    const onMessage = (event: MessageEvent) => {
      if (!isExtMessage(event)) return;
      if (event.data.type !== 'OLYMPUS_ESPN_RESULT') return;
      finish({
        espnS2: event.data.espnS2 ?? null,
        swid: event.data.swid ?? null,
      });
    };

    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(() => finish({ espnS2: null, swid: null }), timeoutMs);
    window.postMessage({ source: PAGE_SOURCE, type: 'OLYMPUS_ESPN_REQUEST' }, window.location.origin);
  });
}

/** Where the install button points. Set once the listing is live. */
export const ESPN_EXTENSION_STORE_URL =
  import.meta.env?.VITE_ESPN_EXTENSION_URL ?? '';
