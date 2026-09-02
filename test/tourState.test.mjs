import assert from 'node:assert/strict';
import test from 'node:test';

import { TOURS, runnableSteps, tourById, tourForPath } from '../src/components/onboarding/tourSteps.ts';

/**
 * The tour's pure decisions: which tab gets which tour, which stops can run,
 * and whether to offer one.
 *
 * All three matter more than they look. A tour that halts on a missing target
 * is a dead modal over the product; a tour that re-offers itself to somebody
 * who dismissed it is the exact behaviour that makes people hate onboarding;
 * and a tour keyed to the whole app rather than per tab would spend the Hub's
 * flag on everybody else.
 */

test('each tour is short on purpose, and stays short', () => {
  for (const tour of TOURS) {
    assert.ok(
      tour.steps.length > 0 && tour.steps.length <= 4,
      `${tour.id} has ${tour.steps.length} stops; length is the thing that loses people, so this ceiling is deliberate`,
    );
  }
});

test('no two tours claim the same tab, or the same id', () => {
  const paths = new Set();
  const ids = new Set();
  for (const tour of TOURS) {
    assert.ok(!paths.has(tour.path), `two tours claim ${tour.path}`);
    assert.ok(!ids.has(tour.id), `two tours share the id ${tour.id}`);
    paths.add(tour.path);
    ids.add(tour.id);
  }
});

test('every stop is distinct, aimed somewhere, and says something', () => {
  for (const tour of TOURS) {
    const ids = new Set();
    for (const step of tour.steps) {
      assert.ok(!ids.has(step.id), `${tour.id} has two stops called ${step.id}`);
      ids.add(step.id);
      assert.ok(step.selector.length > 0, `${tour.id}/${step.id} points at nothing`);
      assert.ok(step.title.length > 0 && step.body.length > 0, `${tour.id}/${step.id} is empty`);
      /* A card people actually read. Past this is a paragraph, and a
         paragraph in a coach mark is a paragraph nobody reads. */
      assert.ok(
        step.body.length <= 240,
        `${tour.id}/${step.id} runs to ${step.body.length} characters, which is a wall of text in a tooltip`,
      );
    }
  }
});

test('only the stop that asks you to press something leaves it pressable', () => {
  const live = TOURS.flatMap((tour) =>
    tour.steps.filter((step) => step.interactive).map((step) => `${tour.id}/${step.id}`),
  );
  assert.deepEqual(
    live,
    ['hub/format'],
    'a stop other than the format toggle is live, so a stray click can navigate out of the tour',
  );
});

test('a tour is found for each real tab, and for nothing else', () => {
  assert.equal(tourForPath('/matchup')?.id, 'hub');
  assert.equal(tourForPath('/league')?.id, 'league');
  assert.equal(tourForPath('/market')?.id, 'market');
  assert.equal(tourForPath('/rankings')?.id, 'board');
  assert.equal(tourForPath('/more'), null);
  assert.equal(tourForPath('/connect'), null);

  /* The design fixtures live under /design, so resolving by route finds
     nothing there. That is why the fixture flag names a tour outright, and
     why it once silently showed no tour at all. */
  assert.equal(tourForPath('/design/matchup'), null);
  assert.equal(tourById('hub')?.path, '/matchup');
  assert.equal(tourById('nonsense'), null);
});

test('a stop whose target is missing is dropped, not stopped on', () => {
  const hub = tourById('hub');
  const present = new Set([hub.steps[0].selector, hub.steps[1].selector]);
  const runnable = runnableSteps(hub.steps, (selector) => present.has(selector));

  assert.deepEqual(
    runnable.map((step) => step.id),
    [hub.steps[0].id, hub.steps[1].id],
    'the filter is not dropping the stops whose targets are absent',
  );
  assert.deepEqual(runnableSteps(hub.steps, () => false), []);
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

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    read: () => value,
  };
}

async function freshStorageModule() {
  /* A query suffix defeats the ESM cache, so each case gets a module that has
     not already read a different stub. */
  return import(`../src/components/onboarding/tourStorage.ts?case=${Math.random()}`);
}

test('a browser that has never seen a tour is offered every one of them', async () => {
  const mod = await freshStorageModule();
  withStorage(memoryStorage(), () => {
    for (const tour of TOURS) assert.equal(mod.shouldOfferTour(tour.id), true);
  });
});

test('finishing one tab does not spend the other tabs', async () => {
  const mod = await freshStorageModule();
  const store = memoryStorage();
  withStorage(store, () => {
    mod.markTourCompleted('hub');
    assert.equal(mod.shouldOfferTour('hub'), false, 'the finished tour is still being offered');
    assert.equal(
      mod.shouldOfferTour('league'),
      true,
      'finishing the Hub tour also spent the League tour, so that tab silently never explains itself',
    );
    assert.equal(mod.shouldOfferTour('board'), true);
  });
});

test('recording one tab keeps what the others already recorded', async () => {
  const mod = await freshStorageModule();
  const store = memoryStorage();
  withStorage(store, () => {
    mod.markTourCompleted('hub');
    mod.markTourSkipped('league');
    mod.markTourCompleted('board');

    assert.equal(mod.shouldOfferTour('hub'), false, 'the Hub was forgotten by a later write');
    assert.equal(mod.shouldOfferTour('league'), false);
    assert.equal(mod.shouldOfferTour('board'), false);
    assert.equal(mod.shouldOfferTour('market'), true);
  });
});

test('skipping counts as seen', async () => {
  const mod = await freshStorageModule();
  withStorage(memoryStorage(), () => {
    mod.markTourSkipped('market');
    assert.equal(mod.shouldOfferTour('market'), false);
  });
});

test('an older version of the tours is offered once more', async () => {
  const mod = await freshStorageModule();
  const stored = JSON.stringify({ version: 0, seen: { hub: { completedAt: Date.now() } } });
  withStorage(memoryStorage(stored), () => {
    assert.equal(mod.shouldOfferTour('hub'), true);
  });
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
    assert.equal(mod.shouldOfferTour('hub'), true, 'a browser that blocks storage should still be offered the tour');
    /* Recording must not throw either, or finishing the tour crashes the page
       it was explaining. */
    assert.doesNotThrow(() => mod.markTourCompleted('hub'));
    assert.doesNotThrow(() => mod.markTourSkipped('hub'));
  });
});

test('a corrupt stored value is treated as never seen rather than crashing', async () => {
  const mod = await freshStorageModule();
  for (const junk of ['{not json', '{"seen":"nope"}', '{"seen":{"hub":null}}', 'null']) {
    withStorage(memoryStorage(junk), () => {
      assert.equal(mod.shouldOfferTour('hub'), true, `${junk} was not handled`);
    });
  }
});
