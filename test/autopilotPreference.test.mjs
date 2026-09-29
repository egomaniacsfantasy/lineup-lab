import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The switch that decides whether the autopilot tools appear on the Hub.
 *
 * They act on a real league on somebody's behalf, so the rule is both: only an
 * admin account is offered the switch, and the switch is off until somebody
 * turns it on. Being allowed to see them is not the same as wanting them on the
 * screen every time the Hub opens, which is exactly how they ended up back in
 * front of the person who asked for them to go away.
 */

/* A browser's worth of globals, and no more than this module actually uses. */
function stubWindow({ throws = false } = {}) {
  const store = new Map();
  const listeners = new Map();
  const storage = {
    getItem: (k) => { if (throws) throw new Error('private window'); return store.get(k) ?? null; },
    setItem: (k, v) => { if (throws) throw new Error('private window'); store.set(k, v); },
    removeItem: (k) => { if (throws) throw new Error('private window'); store.delete(k); },
  };
  globalThis.window = {
    localStorage: storage,
    addEventListener: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    removeEventListener: () => {},
    dispatchEvent: (event) => {
      (listeners.get(event.type) ?? []).forEach((fn) => fn(event));
      return true;
    },
  };
  globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
  return { store, listeners };
}

async function loadFresh() {
  /* A fresh module each time: the cache would carry the previous test's window. */
  return import(`../src/utils/autopilotPreference.ts?t=${Math.random()}`);
}

test('off until somebody turns it on', async () => {
  stubWindow();
  const { autopilotEnabled } = await loadFresh();
  assert.equal(autopilotEnabled(), false, 'a fresh browser was shown the autopilots');
});

test('the switch holds, and clears again', async () => {
  stubWindow();
  const { autopilotEnabled, setAutopilotEnabled } = await loadFresh();
  setAutopilotEnabled(true);
  assert.equal(autopilotEnabled(), true);
  setAutopilotEnabled(false);
  assert.equal(autopilotEnabled(), false, 'turning it off left it on');
});

test('flipping it announces itself, so the Hub moves without a reload', async () => {
  const { listeners } = stubWindow();
  const { setAutopilotEnabled } = await loadFresh();
  let heard = 0;
  window.addEventListener('og:autopilot-changed', () => { heard += 1; });
  setAutopilotEnabled(true);
  assert.equal(heard, 1, 'the Hub would not learn about the change until a reload');
  assert.ok(listeners.has('og:autopilot-changed'));
});

test('a browser that refuses storage reads as off rather than breaking', async () => {
  /* Private windows and some embedded webviews throw on access rather than
     returning null. A settings preference is not worth a blank page. */
  stubWindow({ throws: true });
  const { autopilotEnabled, setAutopilotEnabled } = await loadFresh();
  assert.equal(autopilotEnabled(), false);
  assert.doesNotThrow(() => setAutopilotEnabled(true));
  assert.equal(autopilotEnabled(), false);
});
