import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * A stylesheet missing one closing brace does not fail to build and does not
 * fail to load. The bundler concatenates it, the browser parses it, and the
 * unclosed block silently swallows every rule after it — including whatever
 * file happens to be bundled next.
 *
 * That shipped: one `}` removed from a `@media (max-width: 1199px)` block in
 * MatchupPage.css nested the entire `:root` token block inside it, so above
 * 1199px the app had no design tokens at all and every font fell back to
 * Times. Mobile looked perfect the whole time.
 */

async function cssFiles(dir) {
  const out = [];
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await cssFiles(full)));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

/* Braces inside comments and strings are text, not structure. */
function structuralBraces(source) {
  let depth = 0;
  let i = 0;
  let min = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      min = Math.min(min, depth);
    }
    i += 1;
  }
  return { depth, min };
}

test('every stylesheet closes every block it opens', async () => {
  const offenders = [];
  for (const file of await cssFiles('src')) {
    const { depth, min } = structuralBraces(await fsp.readFile(file, 'utf8'));
    if (depth !== 0) offenders.push(`${file}: ${depth > 0 ? `${depth} unclosed block(s)` : `${-depth} extra closing brace(s)`}`);
    else if (min < 0) offenders.push(`${file}: closes a block it never opened`);
  }
  assert.deepEqual(
    offenders,
    [],
    `these will swallow whatever is bundled after them:\n${offenders.join('\n')}`,
  );
});
