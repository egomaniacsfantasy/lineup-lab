import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import {
  ACCEPTANCE_LINGO_BANDS,
  getAcceptanceLingo,
} from '../src/utils/acceptanceLingo.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const BAND_WORDS = ACCEPTANCE_LINGO_BANDS.map((band) => band.label);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const nextPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(nextPath);
      return nextPath;
    }),
  );
  return files.flat();
}

test('acceptance bands stay mapped to the shared export', () => {
  assert.equal(getAcceptanceLingo(42)?.label, 'Doubtful');
  assert.equal(getAcceptanceLingo(48)?.label, 'Coin flip');
  assert.equal(getAcceptanceLingo(57)?.label, 'Likely');
  assert.equal(getAcceptanceLingo(3)?.label, 'Long shot');
});

test('band words are not hardcoded outside the shared acceptance map', async () => {
  const files = (await walk(path.resolve('src')))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !file.endsWith(`${path.sep}acceptanceLingo.ts`));

  const offenders = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    let foundHardcodedBand = false;
    const visit = (node) => {
      if (foundHardcodedBand) return;
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node))
        && BAND_WORDS.includes(node.text.trim())
      ) {
        foundHardcodedBand = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (foundHardcodedBand) {
      offenders.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepEqual(offenders, []);
});
