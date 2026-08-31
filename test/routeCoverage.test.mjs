import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * No URL renders nothing.
 *
 * A React Router <Routes> with no matching child renders null: no error, no
 * redirect, a page painted in the background colour and left there. The
 * signed-in tree had no catch-all and no /demo, so following a marketing link
 * to /demo while already signed in produced a blank screen after twelve
 * seconds of looking at it.
 *
 * These read the route table rather than the rendered page on purpose. The
 * defect was structural, a missing entry in a list, and the signed-in tree
 * cannot be rendered by a browser test without a real Supabase session, which
 * is exactly why the gap survived a suite this size. The one thing a test can
 * check here without an account is that the list is complete.
 */

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

/** The body of a named route component, from its declaration to the next one. */
function treeFor(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone; this test needs rewriting, not deleting`);
  const open = source.indexOf('<Routes>', start);
  const close = source.indexOf('</Routes>', open);
  assert.ok(open !== -1 && close !== -1, `${name} has no <Routes> block`);
  return source.slice(open, close);
}

for (const tree of ['AppRoutes', 'PublicRoutes']) {
  test(`${tree} sends unknown paths somewhere real`, () => {
    assert.match(
      treeFor(tree),
      /path="\*"/,
      `${tree} has no catch-all, so any unmatched URL renders a blank page`,
    );
  });

  test(`${tree} answers for /demo`, () => {
    assert.match(
      treeFor(tree),
      /path="\/demo"/,
      `/demo is a marketing destination and must answer in ${tree} too`,
    );
  });
}

test('the two trees cover the same public entry points', () => {
  // Anything advertised has to work in both states. A link that works for a
  // stranger and breaks for someone who already signed up is the worst
  // version of a broken link, because only the converted users see it.
  const app = treeFor('AppRoutes');
  const pub = treeFor('PublicRoutes');
  for (const path of ['/demo']) {
    assert.ok(app.includes(`path="${path}"`), `AppRoutes is missing ${path}`);
    assert.ok(pub.includes(`path="${path}"`), `PublicRoutes is missing ${path}`);
  }
});
