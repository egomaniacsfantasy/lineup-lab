/**
 * What the app remembers about itself, so a bug report can answer questions
 * the reporter was never going to think to answer.
 *
 * "It didn't work" is what people send. What we need is which bundle they were
 * running, which league was open, which request failed and how long it took,
 * and what the console said. None of that is knowable after the fact, so it is
 * recorded continuously into small ring buffers and read out only when someone
 * files a report.
 *
 * Two rules this module does not bend:
 *
 *  1. It never breaks the app it observes. Every hook is wrapped so that a
 *     throw inside the recorder cannot become a throw inside a fetch or a
 *     render. A diagnostics bug that takes down the site would be a worse
 *     outcome than the bug it was installed to find.
 *
 *  2. It never records a secret. Request headers are the ESPN cookie pair
 *     (x-espn-s2 / x-espn-swid) and the admin password, so headers are not
 *     recorded at all — not filtered, not present. Bodies are not recorded.
 *     URLs are kept because a path with a league id in it is the whole point,
 *     but query values that look like credentials are masked.
 */

export interface LoggedRequest {
  method: string;
  url: string;
  status: number | 'network-error' | 'aborted';
  ms: number;
  at: number;
}

export interface LoggedError {
  kind: 'error' | 'unhandled-rejection' | 'console';
  message: string;
  stack?: string;
  at: number;
}

export interface Diagnostics {
  build: string;
  at: string;
  route: string;
  viewport: string;
  userAgent: string;
  language: string;
  timezone: string;
  online: boolean;
  apiBase: string;
  requests: LoggedRequest[];
  errors: LoggedError[];
}

/* Enough to cover the sequence that produced a failure, small enough that the
   report stays readable and the buffers stay cheap. A page load is ~8 requests,
   so 40 spans several navigations. */
const MAX_REQUESTS = 40;
const MAX_ERRORS = 25;

const requests: LoggedRequest[] = [];
const errors: LoggedError[] = [];

function push<T>(buffer: T[], item: T, max: number) {
  buffer.push(item);
  if (buffer.length > max) buffer.splice(0, buffer.length - max);
}

/* Query values worth masking. `code` and `state` are OAuth, `token`/`key`/
   `password`/`secret`/`s2`/`swid` are ours or ESPN's. leagueId, userId, season
   and week are deliberately NOT masked: they are the identifiers that make a
   report reproducible, and they are the reporter's own. */
const SECRET_PARAM = /^(code|state|token|key|password|secret|auth|s2|swid)$/i;

export function redactUrl(input: string): string {
  try {
    /* Relative URLs are normal here (the web build talks to a relative /api),
       so a base is supplied and then stripped back off. */
    const url = new URL(input, 'https://relative.invalid');
    let touched = false;
    for (const name of [...url.searchParams.keys()]) {
      if (SECRET_PARAM.test(name)) {
        url.searchParams.set(name, '***');
        touched = true;
      }
    }
    const rendered = url.origin === 'https://relative.invalid'
      ? `${url.pathname}${url.search}`
      : url.toString();
    return touched ? rendered : rendered;
  } catch {
    /* An unparseable URL is not worth a throw. Keep the path-looking prefix. */
    return String(input).split('?')[0];
  }
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    /* JSON.stringify returns undefined — not a string — for undefined, a
       function, or a symbol. `console.error(undefined)` and a rejection with no
       reason both reach here, and returning that straight out made the next
       .slice() throw from inside the recorder, which is the one thing this
       module promises never to do. */
    const encoded = JSON.stringify(value);
    return typeof encoded === 'string' ? encoded : String(value);
  } catch {
    /* Circular structures, and getters that throw. */
    return String(value);
  }
}

export function recordError(kind: LoggedError['kind'], value: unknown, stack?: string) {
  push(
    errors,
    { kind, message: messageOf(value).slice(0, 600), stack: stack?.slice(0, 2000), at: Date.now() },
    MAX_ERRORS,
  );
}

export function recordRequest(entry: LoggedRequest) {
  push(requests, entry, MAX_REQUESTS);
}

let installed = false;

/**
 * Idempotent: React strict mode mounts twice in development, and wrapping
 * fetch twice would double every entry.
 */
export function installDiagnostics() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    recordError('error', event.error ?? event.message, event.error?.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    recordError(
      'unhandled-rejection',
      reason,
      reason instanceof Error ? reason.stack : undefined,
    );
  });

  /* console.error is where React puts render warnings and where our own
     catch blocks report. Chained rather than replaced, so the browser console
     still shows everything it did before. */
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      recordError('console', args.map(messageOf).join(' '));
    } catch {
      /* recording must never suppress the log itself */
    }
    originalConsoleError(...args);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    /* Read the method and URL defensively: `input` may be a Request, a URL or
       a string, and getting this wrong must not cost the caller their fetch. */
    let method = 'GET';
    let url = '';
    try {
      method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      url = input instanceof Request ? input.url : String(input);
    } catch {
      /* fall through with the defaults */
    }

    try {
      const response = await originalFetch(input as RequestInfo, init);
      try {
        recordRequest({
          method,
          url: redactUrl(url),
          status: response.status,
          ms: Math.round(performance.now() - started),
          at: Date.now(),
        });
      } catch {
        /* never let bookkeeping change what the caller receives */
      }
      return response;
    } catch (error) {
      try {
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        recordRequest({
          method,
          url: redactUrl(url),
          status: aborted ? 'aborted' : 'network-error',
          ms: Math.round(performance.now() - started),
          at: Date.now(),
        });
      } catch {
        /* as above */
      }
      throw error;
    }
  };
}

declare const __BUILD_STAMP__: string | undefined;
declare const __API_BASE__: string | undefined;

/** A snapshot for a report. Safe to call at any time; never throws. */
export function collectDiagnostics(): Diagnostics {
  const safe = <T>(read: () => T, fallback: T): T => {
    try {
      return read();
    } catch {
      return fallback;
    }
  };

  return {
    build: typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'unknown',
    at: new Date().toISOString(),
    route: safe(() => `${window.location.pathname}${window.location.search}`, 'unknown'),
    /* innerWidth is 0 before the window has been sized, which a snapshot taken
       during the first render can catch. Reporting "0x0" would read as a
       collapsed window and send whoever picks the report up looking for a
       layout bug, so the document falls in behind it and an unusable pair is
       named as unknown rather than guessed at. */
    viewport: safe(() => {
      const width = window.innerWidth || document.documentElement?.clientWidth || 0;
      const height = window.innerHeight || document.documentElement?.clientHeight || 0;
      if (!width || !height) return 'unknown';
      return `${width}x${height} @${window.devicePixelRatio ?? 1}x`;
    }, 'unknown'),
    userAgent: safe(() => navigator.userAgent, 'unknown'),
    language: safe(() => navigator.language, 'unknown'),
    timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, 'unknown'),
    online: safe(() => navigator.onLine, true),
    apiBase: typeof __API_BASE__ === 'string' && __API_BASE__ ? __API_BASE__ : 'same-origin',
    requests: requests.slice(),
    errors: errors.slice(),
  };
}

/** Test seam: drops both buffers. */
export function resetDiagnostics() {
  requests.length = 0;
  errors.length = 0;
}
