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

/**
 * The connector's Chrome Web Store listing.
 *
 * The published id is a constant, not configuration. It is public, it is in
 * the extension's own manifest, and it does not change for the life of the
 * listing - so it is the DEFAULT here rather than something an environment
 * has to remember to supply.
 *
 * It was configuration, and that is exactly how it broke. The value lived in
 * `render.yaml`, which manages staging only; production is configured in the
 * Render dashboard and the frontend is a separately built CDN bundle. So the
 * variable was "set" and the production bundle still carried an empty string,
 * and the connect screen told every ESPN user the connector was unpublished
 * while it sat published in the store. Twenty minutes of polling production
 * returned the same bundle hash with the id absent from it: a build-time
 * variable also needs a REBUILD after it is set, which is one more step than
 * anyone remembers.
 *
 * A blank default is what made that silent. The failure mode of a missing
 * variable is now "staging cannot be pointed at a test listing" instead of
 * "the whole ESPN path is dead and says so politely".
 */
export const PUBLISHED_CONNECTOR_ID = 'hcjemdgdjdfdjcpjliffkfboolebbidn';

const PUBLISHED_CONNECTOR_URL = `https://chromewebstore.google.com/detail/${PUBLISHED_CONNECTOR_ID}`;

/* Read as the bare identifier: Vite substitutes the exact text and nothing
   else, so `import.meta.env?.VITE_ESPN_EXTENSION_URL` was left as a live
   optional chain against an object that is not there at runtime. */
declare const __ESPN_EXTENSION_URL__: string | undefined;

export const CONNECTOR_STORE_URL =
  typeof __ESPN_EXTENSION_URL__ === 'string' && __ESPN_EXTENSION_URL__.length > 0
    ? __ESPN_EXTENSION_URL__
    : PUBLISHED_CONNECTOR_URL;

/** Connecting needs a desktop browser that can run the connector. */
export function connectorSupported() {
  if (typeof navigator === 'undefined') return false;
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
