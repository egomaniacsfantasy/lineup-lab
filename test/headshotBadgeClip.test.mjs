import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A team badge must not be clipped by the circle it hangs off.
 *
 * PlayerHeadshot puts the team mark at the bottom-right, overhanging the edge
 * on purpose, and says so in its own CSS: the container stays `overflow:
 * visible` and the round crop lives on the image instead. Seven trade surfaces
 * then set `overflow: hidden` on that same element, and a circular clip cuts
 * the badge along the curve - a logo jammed inside the ring with a slice taken
 * off it. Reported from the trade analyzer, but it was every trade surface.
 *
 * Static rather than rendered, because this is a property of the stylesheet and
 * a browser test would need every one of those surfaces on screen at once.
 *
 * It finds the classes the way a reader would: every className handed to a
 * PlayerHeadshot, then the rule that defines it. A new surface that makes the
 * same mistake is caught without being added to a list here.
 */

const SRC = 'src';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(SRC);
const css = files.filter((f) => f.endsWith('.css')).map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));
const tsx = files.filter((f) => f.endsWith('.tsx')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/** Every class a PlayerHeadshot is rendered with, as its outer element. */
function headshotContainerClasses() {
  const classes = new Set();
  for (const match of tsx.matchAll(/<PlayerHeadshot\b([\s\S]{0,400}?)\/>/g)) {
    const props = match[1];
    /* `className` is the outer element; imageClassName and fallbackClassName
       are the inner ones and may clip freely.

       Both spellings, because the one that actually shipped the bug was built
       with a template literal: `trade-finder__face trade-finder__face--${size}`
       slipped past a pattern that only read quoted strings, and that class is
       the 112px circle in the report. Anything class-shaped inside the prop
       counts; a name that is not really a class simply has no rule to check. */
    const named = props.match(/(?<![a-zA-Z])className=(?:["']([^"']+)["']|\{`([^`]+)`\})/);
    if (!named) continue;
    for (const token of (named[1] ?? named[2]).split(/[\s${}`]+/)) {
      /* Drop the interpolated half of `face--${size}`, which is not a class. */
      if (/^[a-z][a-z0-9_-]*$/.test(token) && !token.endsWith('--')) classes.add(token);
    }
  }
  return [...classes];
}

function ruleBody(className) {
  for (const { f, text } of css) {
    const match = text.match(new RegExp(`^\\.${className}\\s*\\{([\\s\\S]*?)^\\}`, 'm'));
    if (match) return { file: f, body: match[1] };
  }
  return null;
}

test('the component itself keeps the badge unclipped', () => {
  const own = fs.readFileSync('src/components/player/PlayerHeadshot.css', 'utf8');
  const match = own.match(/^\.player-headshot\s*\{([\s\S]*?)^\}/m);
  assert.ok(match, '.player-headshot rule not found');
  assert.match(match[1], /overflow:\s*visible/, 'the headshot root stopped allowing the badge to overhang');
  /* And the crop it gives up has to live on the image, or photos go square. */
  assert.match(own, /\.player-headshot__image,\n\.player-headshot__fallback \{[\s\S]*?border-radius: 50%/);
});

test('no surface clips the circle its team badge hangs off', () => {
  const offenders = [];
  for (const className of headshotContainerClasses()) {
    const rule = ruleBody(className);
    if (!rule) continue;
    if (!/overflow:\s*hidden/.test(rule.body)) continue;
    /* A clip only bites when the container is round: a square crop cuts the
       badge off at the corner it already sits in. */
    offenders.push(`.${className} (${rule.file})`);
  }
  assert.deepEqual(
    offenders,
    [],
    `these clip the team badge against their own circle:\n  ${offenders.join('\n  ')}`,
  );
});

test('the audit is actually looking at something', () => {
  /* A regex that matched nothing would make the test above pass for ever. */
  const classes = headshotContainerClasses();
  assert.ok(classes.length >= 10, `only found ${classes.length} headshot containers`);
  assert.ok(
    classes.some((c) => ruleBody(c) != null),
    'none of the headshot classes resolve to a CSS rule, so nothing was checked',
  );
});
