import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * The native shell serves the bundle from https://localhost. A relative /api
 * resolves to an origin that does not exist there, so anything that skips
 * apiUrl() fails on iOS while looking perfectly fine on the web.
 *
 * This has already shipped broken twice, in two different ways, so both are
 * pinned here.
 */

async function sourceFiles(dir) {
  const found = [];
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) found.push(full);
  }
  return found;
}

test('every /api path literal is wrapped in apiUrl', async () => {
  /* Every call must go through apiUrl() so the native build can point it at
     the real origin. Seven call sites had drifted past it, including the one
     that loads the Hub, which is why the iOS app rendered an empty shell.

     This looks at the literal itself rather than at `fetch(` so that it cannot
     be sidestepped by an extra paren, an await, a variable, or a wrapper. */
  const offenders = [];
  for (const file of await sourceFiles('src')) {
    /* leagueApi.ts is the one place a bare /api literal is correct: its own
       get/post helpers pass every path through withContext(), which calls
       apiUrl(). Exempting the file by name keeps that funnel readable without
       blessing bare literals anywhere else. */
    if (file.endsWith(path.join('services', 'leagueApi.ts'))) continue;
    if (file.endsWith(path.join('services', 'apiBase.ts'))) continue;
    const source = await fsp.readFile(file, 'utf8');
    for (const match of source.matchAll(/['"`]\/api\//g)) {
      const before = source.slice(0, match.index);
      /* A literal is fine when apiUrl() opens immediately before it, or when
         it is handed to a wrapper proven below to apply apiUrl() itself
         (adminFetch, withContext). */
      if (/(?:apiUrl|adminFetch|withContext)\(\s*$/.test(before)) continue;
      const line = before.split('\n').length;
      offenders.push(`${file}:${line}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these use a relative /api and will fail in the native shell:\n${offenders.join('\n')}`,
  );
});

test('the API base survives Vite substitution', async () => {
  /* `import.meta.env?.VITE_API_BASE_URL` shipped dead: Vite substitutes the
     exact text `import.meta.env.VITE_API_BASE_URL`, so the optional chain
     defeated it and the bundle kept a lookup on an empty object. The base was
     then always '' and apiUrl() was an expensive no-op. A `define` is a plain
     identifier, so minification cannot break it. */
  const api = await fsp.readFile('src/services/apiBase.ts', 'utf8');
  assert.match(api, /__API_BASE__/, 'API base must come from the define');
  // Strip comments: this file explains the old bug in prose, and the prose
  // must not trip the guard that pins the fix.
  const code = api.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(
    /import\.meta\.env\s*\?\./.test(code),
    false,
    'optional chaining on import.meta.env is never substituted by Vite',
  );

  const viteConfig = await fsp.readFile('vite.config.ts', 'utf8');
  assert.match(
    viteConfig,
    /__API_BASE__:\s*JSON\.stringify/,
    'vite.config must define __API_BASE__ or the native build has no API origin',
  );
});

test('the native build sets an API origin', async () => {
  /* A plain `npm run build` is correct for the web (relative paths), so the
     native build needs its own entry point. Losing this script silently
     reintroduces the empty-shell bug. */
  const pkg = JSON.parse(await fsp.readFile('package.json', 'utf8'));
  assert.ok(pkg.scripts['build:ios'], 'build:ios must exist');
  assert.match(pkg.scripts['build:ios'], /VITE_API_BASE_URL/);
});

test('the admin wrapper really does apply apiUrl', async () => {
  /* The path guard above lets adminFetch('/api/...') through. That exemption
     is only safe while adminFetch itself rewrites the origin, so pin it — a
     silent revert there would break every admin call in the shell while the
     guard kept passing. */
  const source = await fsp.readFile('src/pages/AdminProjectionsPage.tsx', 'utf8');
  assert.match(
    source,
    /adminFetch = useCallback\(\s*\(path: string, init: RequestInit = \{\}\) =>\s*fetch\(apiUrl\(path\)/,
    'adminFetch must wrap its path in apiUrl',
  );
});

test('the withContext wrapper really does apply apiUrl', async () => {
  /* The path guard above lets withContext('/api/...') through (used by the
     Predictor's fetches so an ESPN league sends its provider context). That
     exemption is only safe while withContext itself routes through apiUrl —
     pin it, so a silent revert there can't break the native shell while the
     guard keeps passing. */
  const source = await fsp.readFile(path.join('src', 'services', 'leagueApi.ts'), 'utf8');
  const start = source.indexOf('export function withContext');
  assert.ok(start !== -1, 'withContext must exist and be exported');
  const body = source.slice(start, start + 1000);
  assert.match(body, /apiUrl\(/, 'withContext must wrap its path in apiUrl');
});

test('no source reads import.meta.env through an optional chain', async () => {
  /* Vite substitutes the exact text `import.meta.env.SOMETHING`. Written as
     `import.meta.env?.SOMETHING` it is not substituted, so the bundle keeps a
     runtime lookup on an object that is empty in production and the value is
     always undefined. This shipped three times: the API base (the iOS app
     rendered an empty shell), the ESPN connector store URL (publishing the
     extension and setting the env var would have changed nothing), and the
     ESPN login flag (which could never be turned off). It reads as
     defensive, which is exactly why it keeps coming back. */
  const offenders = [];
  for (const file of await sourceFiles('src')) {
    const source = await fsp.readFile(file, 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const match of code.matchAll(/import\.meta\.env\s*\?\./g)) {
      offenders.push(`${file}:${code.slice(0, match.index).split('\n').length}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these are never substituted by Vite and will read undefined in production:\n${offenders.join('\n')}`,
  );
});

test('every VITE_ flag the deploy sets is actually wired to a define', async () => {
  /* Render carries VITE_ESPN_LOGIN_ENABLED and will carry
     VITE_ESPN_EXTENSION_URL. A flag set on the deploy that no define reads is
     worse than no flag: it looks configured and does nothing. */
  const viteConfig = await fsp.readFile('vite.config.ts', 'utf8');
  for (const flag of ['VITE_API_BASE_URL', 'VITE_ESPN_EXTENSION_URL', 'VITE_ESPN_LOGIN_ENABLED']) {
    assert.match(viteConfig, new RegExp(`process\\.env\\.${flag}`), `${flag} has no define`);
  }
});
