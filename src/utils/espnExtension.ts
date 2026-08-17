/**
 * Bridge to the Odds Gods ESPN connector extension.
 *
 * Why an extension at all: ESPN marks its `espn_s2` session cookie HttpOnly,
 * so no web page can read it. Only an extension (or a native app's webview)
 * can. There is no clever way around this; it is a browser security rule.
 *
 * Why we take the cookie rather than just scraping league JSON: the server
 * reprices every six hours on its own. A script that only ran while the user
 * sat on espn.com would leave every league stale the moment they closed the
 * tab. Holding the session is what makes "connect once, works on your phone"
 * true.
 */

const EXT = 'oddsgods-ext';
const PAGE = 'oddsgods-page';

export interface EspnSession {
  espnS2: string | null;
  swid: string | null;
}

interface ExtMessage {
  source?: string;
  type?: string;
  espnS2?: string | null;
  swid?: string | null;
}

function fromExtension(event: MessageEvent): event is MessageEvent<ExtMessage> {
  return (
    event.source === window
    && typeof event.data === 'object'
    && event.data !== null
    && (event.data as ExtMessage).source === EXT
  );
}

/**
 * True when the connector answers. The content script also announces itself
 * on load, so this both pings and listens: whichever lands first wins. Poll it
 * so the install step flips to "installed" without asking for a reload.
 */
export function detectConnector(timeoutMs = 600): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    let done = false;
    const finish = (found: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(found);
    };

    const onMessage = (event: MessageEvent) => {
      if (fromExtension(event) && event.data.type === 'ODDSGODS_READY') finish(true);
    };

    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    window.postMessage({ source: PAGE, type: 'ODDSGODS_PING' }, window.location.origin);
  });
}

/**
 * Asks the connector for the current ESPN session. Returns nulls rather than
 * throwing when the user is not signed in to ESPN, so the caller can say
 * "sign in to ESPN first" instead of showing an error.
 */
export function requestEspnSession(timeoutMs = 5000): Promise<EspnSession> {
  if (typeof window === 'undefined') return Promise.resolve({ espnS2: null, swid: null });

  return new Promise((resolve) => {
    let done = false;
    const finish = (session: EspnSession) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(session);
    };

    const onMessage = (event: MessageEvent) => {
      if (!fromExtension(event) || event.data.type !== 'ODDSGODS_SESSION') return;
      finish({ espnS2: event.data.espnS2 ?? null, swid: event.data.swid ?? null });
    };

    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(() => finish({ espnS2: null, swid: null }), timeoutMs);
    window.postMessage({ source: PAGE, type: 'ODDSGODS_GET_SESSION' }, window.location.origin);
  });
}

/** Chrome Web Store listing. Set once the listing is published. */
export const CONNECTOR_STORE_URL = import.meta.env?.VITE_ESPN_EXTENSION_URL ?? '';

/** Connecting needs a desktop browser that can run the connector. */
export function connectorSupported() {
  if (typeof navigator === 'undefined') return false;
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
