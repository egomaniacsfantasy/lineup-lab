import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tradeAssetFromCatalogPlayer } from '../src/utils/tradeDisplay.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');

async function loadTradeDisplayModule() {
  const source = await fs.readFile(path.resolve('src/components/trade-display/TradeDisplay.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const tempRoot = path.resolve('.tmp-tests');
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, 'trade-display-'));
  const tempFile = path.join(tempDir, 'TradeDisplay.mjs');
  await fs.writeFile(tempFile, outputText);
  try {
    return await import(`file://${tempFile}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function player(id, name, position, subtitle = null) {
  return { id, name, position, subtitle, kind: 'player' };
}

test('trade side falls back to Unknown player instead of raw ids', () => {
  const asset = tradeAssetFromCatalogPlayer('11533', {});
  assert.equal(asset.name, 'Unknown player');
  assert.ok(!/11533/.test(asset.name));
});

test('TradeRow snapshot: 1-for-1 renders both sides without overflow', async () => {
  const { TradeRow } = await loadTradeDisplayModule();
  const html = renderToStaticMarkup(React.createElement(TradeRow, {
    sendSide: { label: 'You send', assets: [player('a', 'Alpha Runner', 'RB')] },
    getSide: { label: 'You get', assets: [player('b', 'Beta Catcher', 'WR')] },
    valueLabel: '+0.2 pts/wk',
    acceptanceProbability: 66,
    acceptanceLabel: '66% · Likely',
  }));
  assert.match(html, /trade-display--row/);
  assert.match(html, /Alpha Runner/);
  assert.match(html, /Beta Catcher/);
  assert.ok(!/\+\d+ more/.test(html));
});

test('TradeRow snapshot: 2-for-1 keeps all names visible in a vertical stack', async () => {
  const { TradeRow } = await loadTradeDisplayModule();
  const html = renderToStaticMarkup(React.createElement(TradeRow, {
    sendSide: { label: 'You send', assets: [player('a', 'Alpha Runner', 'RB'), player('b', 'Bravo Runner', 'RB')] },
    getSide: { label: 'You get', assets: [player('c', 'Charlie Catcher', 'WR')] },
    valueLabel: '+0.3 pts/wk',
    acceptanceProbability: 57,
    acceptanceLabel: '57% · Likely',
  }));
  assert.equal((html.match(/trade-display__asset-name/g) ?? []).length, 3);
  assert.match(html, /Alpha Runner/);
  assert.match(html, /Bravo Runner/);
  assert.match(html, /Charlie Catcher/);
});

test('TradeCard snapshot: 3-for-3 renders every visible asset line without clipping markers', async () => {
  const { TradeCard } = await loadTradeDisplayModule();
  const html = renderToStaticMarkup(React.createElement(TradeCard, {
    sendSide: {
      label: 'You send',
      assets: [player('a', 'Alpha Runner', 'RB'), player('b', 'Bravo Wideout', 'WR'), player('c', 'Charlie Tight', 'TE')],
    },
    getSide: {
      label: 'You get',
      assets: [player('d', 'Delta Runner', 'RB'), player('e', 'Echo Wideout', 'WR'), player('f', 'Foxtrot Tight', 'TE')],
    },
    partnerLine: 'Roster 4',
    impactLine: 'your title +0.4% · them +1.2%',
    acceptanceProbability: 62,
    acceptanceLabel: '62% · Likely',
  }));
  assert.equal((html.match(/trade-display__asset-name/g) ?? []).length, 6);
  assert.ok(!/\+\d+ more/.test(html));
});

test('TradeCard snapshot: 6-for-2 collapses overflow into a final expansion line', async () => {
  const { TradeCard } = await loadTradeDisplayModule();
  const html = renderToStaticMarkup(React.createElement(TradeCard, {
    sendSide: {
      label: 'You send',
      assets: [
        player('a', 'Alpha Runner', 'RB'),
        player('b', 'Bravo Wideout', 'WR'),
        player('c', 'Charlie Tight', 'TE'),
        player('d', 'Delta Runner', 'RB'),
        { id: 'pick-2027-1', name: '2027 1st', kind: 'pick' },
        { id: 'pick-2028-2', name: '2028 2nd', kind: 'pick' },
      ],
    },
    getSide: {
      label: 'You get',
      assets: [player('e', 'Echo Quarterback', 'QB'), player('f', 'Foxtrot Wideout', 'WR')],
    },
    partnerLine: 'Roster 7',
    impactLine: 'your title +0.9% · them +1.7%',
    acceptanceProbability: 48,
    acceptanceLabel: '48% · Coin flip',
  }));
  assert.match(html, /\+2 more/);
  assert.ok(!/2028 2nd/.test(html));
  assert.equal((html.match(/trade-display__asset-name/g) ?? []).length, 6);
});
