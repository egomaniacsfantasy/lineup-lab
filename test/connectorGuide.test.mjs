import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * The page somebody lands on the instant the connector installs.
 *
 * It opened with three steps, and the first was "pin it, so you can see it
 * working": a thing nobody has to do, in the position of the thing everybody
 * has to do. The last step said "paste your league URL" without saying where a
 * league URL comes from, which is the only part anybody was ever stuck on. And
 * the middle step told people to sign in to ESPN whether or not they already
 * were, because the page never looked.
 *
 * These are read off the source rather than a rendered page: the extension
 * folder is not served by the app's dev server, and the two states are driven
 * by chrome.cookies, which only exists inside an extension. The states
 * themselves were checked by hand against a stub; what these guard is the
 * shape not sliding back.
 */

const html = readFileSync(new URL('../extension/welcome.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../extension/welcome.js', import.meta.url), 'utf8');

test('the guide is two steps, and neither of them is housekeeping', () => {
  const steps = html.match(/<li\b/g) ?? [];
  assert.equal(steps.length, 2, `the guide is back to ${steps.length} steps`);
  assert.ok(
    !/puzzle piece|pin the|click the pin/i.test(html),
    'pinning the extension is back in the instructions, and it is not a step',
  );
});

test('it says where a league link actually comes from', () => {
  /* The one thing people got stuck on. "Paste your league URL" assumes you
     know what that is and where it lives. */
  assert.match(html, /address bar/i, 'it still does not say where the link is');
  assert.match(html, /leagueId=/, 'there is no example of what the link looks like');
  assert.match(html, /Open your league on ESPN/i);
});

test('the first step ticks itself off when ESPN is already signed in', () => {
  /* An extension page can just look, so it should. Telling somebody to do a
     thing they have already done is how a two-step guide reads as four. */
  assert.match(js, /chrome\.cookies\.get/, 'the page never checks');
  assert.match(js, /espn_s2/);
  assert.match(js, /classList\.toggle\('done'/, 'a finished step never marks itself finished');
  assert.match(
    js,
    /signInAction'\)\.hidden = signedIn/,
    'the button for a completed step is still on screen',
  );
});

test('it re-checks rather than reading once', () => {
  /* People go and sign in with this tab still open. A page that needs a reload
     to notice is a page that tells them the thing they just did did not
     work. */
  assert.match(js, /setInterval/, 'the page cannot notice a sign in that happens after it loads');
});

test('the promise on this page matches what the manifest actually asks for', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(manifest.permissions, ['cookies']);
  assert.match(html, /two ESPN cookies/i, 'the page stopped saying what it reads');
  assert.match(html, /stores nothing/i);
});
