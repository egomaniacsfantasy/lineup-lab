import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/* A `var(--x)` with no fallback that names nothing does not fall back to
   something sensible — it makes the whole declaration invalid at computed-value
   time, and the property silently reverts to its initial value. That is how the
   sticky season band on the Hub ended up with no background at all: it asked
   for `--bg-base`, which is not a token and never has been, so the gradient
   that was meant to stop the page showing through the numbers never painted.
   Nothing errors, nothing warns, and it looks almost right.

   Same family as the missing brace that wiped the design tokens on desktop.
   Both are cheap to catch and expensive to find by eye. */

const SRC = new URL('../src/', import.meta.url).pathname;

function walk(dir, match, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, match, out);
    else if (match.test(entry)) out.push(full);
  }
  return out;
}

const cssFiles = walk(SRC, /\.css$/);
const codeFiles = walk(SRC, /\.tsx?$/);

const css = cssFiles.map((f) => readFileSync(f, 'utf8'));
const code = codeFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

/* Declared anywhere in the stylesheets. */
const declared = new Set();
for (const text of css) {
  for (const [, name] of text.matchAll(/(--[\w-]+)\s*:/g)) declared.add(name);
}

/* Or set at runtime from a component — `style={{ '--x': ... }}` or
   setProperty('--x', ...). Those are legitimate: the stylesheet reads a value
   the app supplies. */
const runtimeSet = new Set();
for (const [, name] of code.matchAll(/['"](--[\w-]+)['"]/g)) runtimeSet.add(name);

/* The selector of the rule a given offset sits inside: back up to the `{` that
   opened it, then to whatever punctuation closed the rule before it. */
function enclosingSelector(text, offset) {
  const open = text.lastIndexOf('{', offset);
  if (open === -1) return '';
  const prev = Math.max(
    text.lastIndexOf('}', open),
    text.lastIndexOf('{', open - 1),
    text.lastIndexOf(';', open),
  );
  return text.slice(prev + 1, open).trim();
}

/* A rule nothing can match cannot break anything. TradePage.css still carries
   the acceptance-meter rules for markup that was removed, and those reference
   tokens the removed markup used to set. Dead CSS is worth deleting, but it is
   a different job from this one, and allow-listing the exact tokens that expose
   the bug would hollow the guard out. So reachability decides: if a rule's
   classes appear nowhere in the components, it is not live and not our problem
   here. Nothing to maintain, and it re-arms itself the moment the markup
   comes back. */
function isReachable(selector) {
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  if (classes.length === 0) return true;
  return classes.some((name) => code.includes(name));
}

const missing = [];
cssFiles.forEach((file, index) => {
  const text = css[index];
  // var(--name) with NO fallback: the next non-space char after the name is ')'
  for (const match of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    const name = match[1];
    if (declared.has(name) || runtimeSet.has(name)) continue;
    if (!isReachable(enclosingSelector(text, match.index))) continue;
    const line = text.slice(0, match.index).split('\n').length;
    missing.push(`${file.replace(SRC, 'src/')}:${line} → ${name}`);
  }
});

test('every var(--token) without a fallback names a token that exists', () => {
  assert.deepEqual(
    missing,
    [],
    `A var() that names nothing voids its whole declaration:\n  ${missing.join('\n  ')}`,
  );
});
