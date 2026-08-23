import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * Every root-relative image the source asks for has to exist in public/.
 *
 * A provider logo went missing in production and the connect screen degraded
 * to two identical buttons reading "Connect" next to a broken-image glyph,
 * with nothing to say which was Sleeper and which was ESPN. That screen is the
 * front door and there is no tab bar behind it to escape to.
 *
 * A missing file is invisible to the type system and to every test that does
 * not actually paint, and moving one is a one-line change nobody reviews
 * carefully. So this walks the source for the paths and checks the disk.
 */

const SOURCE_DIRS = ['src'];
const PUBLIC = path.resolve('public');

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) yield full;
  }
}

test('every local image the app asks for is actually on disk', async () => {
  const missing = [];
  const seen = new Set();

  for (const dir of SOURCE_DIRS) {
    for await (const file of walk(path.resolve(dir))) {
      const source = await fs.readFile(file, 'utf8');
      /* Root-relative image paths only: bundler imports are resolved at build
         time and remote URLs are somebody else's problem. */
      const paths = source.matchAll(/["'`](\/[a-z0-9][a-z0-9/_-]*\.(?:png|jpg|jpeg|svg|webp|ico))["'`]/gi);
      for (const [, asset] of paths) {
        if (seen.has(`${file}|${asset}`)) continue;
        seen.add(`${file}|${asset}`);
        try {
          await fs.access(path.join(PUBLIC, asset));
        } catch {
          missing.push(`${path.relative(process.cwd(), file)} -> ${asset}`);
        }
      }
    }
  }

  assert.deepEqual(missing, [], `these point at files that do not exist:\n  ${missing.join('\n  ')}`);
  /* Non-vacuous: if the walk found nothing, the regex is broken, not the app. */
  assert.ok(seen.size > 0, 'no local image references were found at all');
});

test('a provider row does not put its whole identity in an image', async () => {
  const source = await fs.readFile(path.resolve('src/pages/ConnectPage.tsx'), 'utf8');

  /* The connect screen is the one place where a failed logo leaves the user
     with no way to tell the two buttons apart, so it renders a mark that falls
     back to the provider's name rather than a bare <img>. */
  assert.match(source, /ProviderMark/, 'connect rows should use the fallback-capable mark');
  assert.doesNotMatch(
    source,
    /<img[^>]*provider-logo/,
    'a raw <img> is carrying provider identity again',
  );
});

test('a missing file fails as a file, not as the app', async () => {
  const source = await fs.readFile(path.resolve('server/index.js'), 'utf8');

  /* The catch-all used to answer every unmatched path with index.html, so a
     missing or renamed asset returned HTML with a 200 to a request for a PNG.
     Browsers draw that as a broken image, and a 200 leaves no 404 anywhere to
     find, so the picture just disappears and nothing says why. A 200 is also
     cacheable, which is how it outlives the fix that put the file back. */
  const start = source.indexOf('app.get(/.*/');
  assert.ok(start > -1, 'could not find the catch-all route');
  const body = source.slice(start, source.indexOf('\n});', start));

  assert.match(body, /404/, 'a request for a file that is not there must 404');
  assert.match(
    body,
    /\\\.\[a-zA-Z0-9\]\+\$/,
    'the check should key off a file extension, so client routes still get the shell',
  );
  /* And the shell must still be reachable for extensionless routes. */
  assert.match(body, /sendFile/);
});
