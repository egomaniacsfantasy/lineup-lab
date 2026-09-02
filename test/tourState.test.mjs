import assert from 'node:assert/strict';
import test from 'node:test';

import { TOUR_STEPS, runnableSteps } from '../src/components/onboarding/tourSteps.ts';

/**
 * The tour's two pure decisions: which stops run, and whether to offer it.
 *
 * Both matter more than they look. A tour that halts on a missing target is
 * a dead modal over the product, and a tour that re-offers itself to somebody
 * who already dismissed it is the exact behaviour that makes people hate
 * onboarding.
 */

test('the tour is short on purpose, and stays short', () => {
  assert.ok(
    TOUR_STEPS.length <= 5,
    `the tour has grown to ${TOUR_STEPS.length} stops; length is the thing that loses people, so this ceiling is deliberate`,
  );
  assert.ok(TOUR_STEPS.length > 0);
});

test('every stop is distinct, aimed somewhere, and says something', () => {
  const ids = new Set();
  for (const step of TOUR_STEPS) {
    assert.ok(!ids.has(step.id), `two stops share the id ${step.id}`);
    ids.add(step.id);
    assert.ok(step.selector.length > 0, `${step.id} points at nothing`);
    assert.ok(step.title.length > 0 && step.body.length > 0, `${step.id} is empty`);
    /* A card people actually read. Anything past this is a paragraph, and a
       paragraph in a coach mark is a paragraph nobody reads. */
    assert.ok(
      step.body.length <= 240,
      `${step.id} runs to ${step.body.length} characters, which is a wall of text in a tooltip`,
    );
  }
});

test('only the stop that asks you to press something leaves it pressable', () => {
  const live = TOUR_STEPS.filter((step) => step.interactive);
  assert.equal(live.length, 1, 'more than one stop is live, so a stray click can navigate out of the tour');
  assert.equal(live[0].id, 'format');
});

test('a stop whose target is missing is dropped, not stopped on', () => {
  const present = new Set(['.matchup-page__module--hero', '.app-header__odds-toggle']);
  const runnable = runnableSteps(TOUR_STEPS, (selector) => present.has(selector));

  assert.deepEqual(
    runnable.map((step) => step.id),
    ['price', 'format'],
    'the filter is not dropping the stops whose targets are absent',
  );
});

test('a page with none of the targets yields no tour rather than an empty one', () => {
  assert.deepEqual(runnableSteps(TOUR_STEPS, () => false), []);
});

/* Storage runs against a stub, because node has no localStorage and the point
   of the module is that it survives one that misbehaves. */
function withStorage(impl, run) {
  const previous = globalThis.window;
  globalThis.window = { localStorage: impl };
  try {
    return run();
  } finally {
    globalThis.window = previous;
  }
}

async function freshStorageModule() {
  /* A query suffix defeats the ESM cache, so each case gets a module that
     has not already read a different stub. */
  return import(`../src/components/onboarding/tourStorage.ts?case=${Math.random()}`);
}

test('a browser that has never seen the tour is offered it', async () => {
  const mod = await freshStorageModule();
  const result = withStorage(
    { getItem: () => null, setItem: () => undefined },
    () => mod.shouldOfferTour(),
  );
  assert.equal(result, true);
});

test('finishing it and skipping it both count as seen', async () => {
  const mod = await freshStorageModule();
  for (const field of ['completedAt', 'skippedAt']) {
    const stored = JSON.stringify({ version: mod.TOUR_VERSION, [field]: Date.now() });
    const result = withStorage(
      { getItem: () => stored, setItem: () => undefined },
      () => mod.shouldOfferTour(),
    );
    assert.equal(result, false, `a tour recorded as ${field} is being offered again`);
  }
});

test('an older version of the tour is offered once more', async () => {
  const mod = await freshStorageModule();
  const stored = JSON.stringify({ version: 0, completedAt: Date.now() });
  const result = withStorage(
    { getItem: () => stored, setItem: () => undefined },
    () => mod.shouldOfferTour(),
  );
  assert.equal(result, true);
});

test('storage that throws does not take the app down with it', async () => {
  const mod = await freshStorageModule();
  const hostile = {
    getItem() {
      throw new Error('site data blocked');
    },
    setItem() {
      throw new Error('site data blocked');
    },
  };

  withStorage(hostile, () => {
    assert.equal(mod.shouldOfferTour(), true, 'a browser that blocks storage should still be offered the tour');
    /* And recording the result must not throw either, or finishing the tour
       crashes the page it was explaining. */
    assert.doesNotThrow(() => mod.markTourCompleted());
    assert.doesNotThrow(() => mod.markTourSkipped());
  });
});

test('a corrupt stored value is treated as never seen rather than crashing', async () => {
  const mod = await freshStorageModule();
  const result = withStorage(
    { getItem: () => '{not json', setItem: () => undefined },
    () => mod.shouldOfferTour(),
  );
  assert.equal(result, true);
});
