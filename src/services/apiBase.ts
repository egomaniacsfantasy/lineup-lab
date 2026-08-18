/**
 * Where /api lives.
 *
 * On the web this is empty, so paths stay relative and resolve against
 * whatever host is serving the app. Inside the iOS shell the bundle is served
 * from https://localhost, where a relative /api resolves to an origin that
 * does not exist and every request fails. `npm run build:ios` sets
 * VITE_API_BASE_URL so the same code works in both.
 *
 * This lives apart from leagueApi so that leaf modules — image URL builders,
 * schedule helpers — can prefix a path without importing the whole API layer.
 */

/* `import.meta.env?.VITE_API_BASE_URL` looked right and shipped dead: Vite
   substitutes the exact text `import.meta.env.VITE_API_BASE_URL`, so the `?.`
   defeated it and the bundle kept a lookup on an empty object. The base was
   then always '' and apiUrl() was an expensive no-op. A define is a plain
   identifier, so minification cannot break it, and the typeof guard keeps this
   module importable outside a Vite build (the node test runner). */
declare const __API_BASE__: string | undefined;

const API_BASE = (typeof __API_BASE__ === 'string' ? __API_BASE__ : '').replace(/\/$/, '');

export function apiUrl(path: string) {
  if (!API_BASE) return path;
  return path.startsWith('/') ? `${API_BASE}${path}` : path;
}
