import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/**
 * The hub's title-odds widget.
 *
 * Week one has no recorded history, so every row's move is null. The widget
 * used to print a "Move" header over a stack of empty cells, which is not a
 * quiet column, it is a broken one, and week one is when the most people are
 * looking. The column has to disappear entirely, header included.
 *
 * The other rule here is hierarchy: the price is the product, so it must never
 * be rendered as just another cell alongside the movement it outranks.
 */
async function loadTitleOdds() {
  const source = await fs.readFile(path.resolve('src/components/matchup/TitleOdds.tsx'), 'utf8');
  const out = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace("import './TitleOdds.css';", '')
    .replace("from '../../utils/formatOdds'", `from '${path.resolve('src/utils/formatOdds.ts')}'`)
    .replace("from '../../utils/leagueMovement'", `from '${path.resolve('src/utils/leagueMovement.ts')}'`);

  const tempRoot = path.resolve('.tmp-tests');
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, 'title-odds-'));
  const tempFile = path.join(tempDir, 'TitleOdds.mjs');
  await fs.writeFile(tempFile, out);
  try {
    return await import(`file://${tempFile}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const board = (move) => [
  { rosterId: 1, teamName: 'Apollo Archers', titleProb: 27.7, championOdds: 261, isUser: false, move: move?.[0] ?? null },
  { rosterId: 2, teamName: "Zeus's Bolts", titleProb: 20.4, championOdds: 390, isUser: true, move: move?.[1] ?? null },
  { rosterId: 3, teamName: 'Poseidon Waves', titleProb: 18.9, championOdds: 429, isUser: false, move: move?.[2] ?? null },
  { rosterId: 4, teamName: 'Hermes Express', titleProb: 17.1, championOdds: 485, isUser: false, move: move?.[3] ?? null },
];

test('week one hides the movement column entirely, header included', async () => {
  const { TitleOdds } = await loadTitleOdds();
  const html = renderToStaticMarkup(React.createElement(TitleOdds, { rows: board(null) }));

  assert.doesNotMatch(html, />Move</, 'a Move header with nothing under it');
  assert.equal(
    (html.match(/title-odds__move/g) ?? []).length,
    0,
    'empty movement cells are still being rendered',
  );
  /* The grid has to narrow too, or the row keeps a column of dead space where
     the movement used to be. */
  assert.match(html, /title-odds--still/);
  assert.match(html, /\+261/, 'prices should still be posted');
});

test('a board that has moved shows the column', async () => {
  const { TitleOdds } = await loadTitleOdds();
  const html = renderToStaticMarkup(React.createElement(TitleOdds, { rows: board([11.6, 12.6, 5.4, 4.6]) }));

  assert.match(html, />Move</);
  assert.doesNotMatch(html, /title-odds--still/);
  assert.match(html, /11\.6/);
});

test('movement below the material threshold leaves the column out', async () => {
  const { TitleOdds } = await loadTitleOdds();
  /* Under a point is noise, and the League tab already refuses to draw it.
     Four rows of noise must not resurrect the column. */
  const html = renderToStaticMarkup(React.createElement(TitleOdds, { rows: board([0.2, -0.4, 0.1, 0.3]) }));

  assert.match(html, /title-odds--still/);
  assert.doesNotMatch(html, />Move</);
});

test('the price outranks the movement it sits next to', async () => {
  const css = await fs.readFile(path.resolve('src/components/matchup/TitleOdds.css'), 'utf8');
  const sizeOf = (selector) => {
    const block = css.slice(css.indexOf(selector));
    const match = block.slice(0, block.indexOf('}')).match(/font-size:\s*([0-9.]+)px/);
    return match ? Number(match[1]) : null;
  };
  const price = sizeOf('.title-odds__price {');
  const move = sizeOf('.title-odds__move {');
  assert.ok(price != null && move != null, 'both need an explicit size to be comparable');
  assert.ok(price > move, `price ${price}px must outrank movement ${move}px`);

  /* Posted, not printed: the box is what makes it read as a quoted number
     rather than one more table cell. */
  const priceBlock = css.slice(css.indexOf('.title-odds__price {'));
  const rule = priceBlock.slice(0, priceBlock.indexOf('}'));
  assert.match(rule, /border:/, 'the price should be boxed');
  assert.match(rule, /var\(--text-amber\)/, 'the price should carry the house colour');
});
