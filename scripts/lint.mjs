import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const tsApiUtils = require('ts-api-utils');

if (typeof tsApiUtils.iterateComments !== 'function') {
  tsApiUtils.iterateComments = function* iterateComments(sourceFile) {
    const text = sourceFile.getFullText();
    const comments = [];
    const seen = new Set();

    const collect = (pos, end, kind) => {
      const key = `${pos}:${end}:${kind}`;
      if (seen.has(key)) return;
      seen.add(key);

      const isLine = kind === ts.SyntaxKind.SingleLineCommentTrivia;
      comments.push({
        pos,
        end,
        kind,
        value: text.slice(pos + 2, isLine ? end : end - 2),
      });
    };

    const collectAroundNode = (node) => {
      ts.forEachLeadingCommentRange(text, node.pos, collect);
      ts.forEachTrailingCommentRange(text, node.end, collect);
      ts.forEachChild(node, collectAroundNode);
    };

    ts.forEachLeadingCommentRange(text, 0, collect);
    collectAroundNode(sourceFile);

    comments.sort((a, b) => a.pos - b.pos || a.end - b.end);
    yield* comments;
  };
}

const { ESLint } = await import('eslint');

const eslint = new ESLint();
const results = await eslint.lintFiles([
  'src/**/*.{ts,tsx}',
  'server/**/*.js',
  'test/**/*.mjs',
  'scripts/**/*.mjs',
  'espn-login-worker/src/**/*.js',
  'espn-login-worker/test/**/*.mjs',
  'espn-login-worker/scripts/**/*.mjs',
]);
const formatter = await eslint.loadFormatter('stylish');
const output = formatter.format(results);

if (output) {
  console.log(output);
}

const errorCount = results.reduce((sum, result) => sum + result.errorCount, 0);
if (errorCount > 0) {
  process.exitCode = 1;
}
