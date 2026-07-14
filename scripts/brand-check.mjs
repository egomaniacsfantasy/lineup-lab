import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = process.cwd();
const TARGETS = [
  'src/pages/TradePage.tsx',
  'src/pages/TradePage.css',
  'src/pages/MatchupPage.tsx',
  'src/pages/MatchupPage.css',
  'src/components/trade-display/TradeDisplay.tsx',
  'src/components/trade-display/TradeDisplay.css',
  'src/components/trade/TradeAnalyzerPanel.tsx',
  'src/components/trade/TradeAnalyzerPanel.css',
  'src/components/ui/SimulationLoader.tsx',
  'src/components/ui/SimulationLoader.css',
  'src/utils/acceptanceLingo.ts',
  'src/utils/tradeDisplay.ts',
  'src/utils/tradeSuggestionDisplay.ts',
  'src/utils/deltaTone.ts',
  'src/utils/lineupRow.ts',
];
const DISALLOWED_DASHES = /[—–]/;
const DISALLOWED_COLORS = [
  /#f59e0b/gi,
  /#b87d18/gi,
  /rgb\s*\(\s*245\s*,\s*158\s*,\s*11\s*\)/gi,
  /(?<![-\w])amber-[\w-]+\b/gi,
];

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function pushIssue(issues, file, line, message) {
  issues.push(`${path.relative(ROOT, file)}:${line} ${message}`);
}

function checkTsTextNodes(file, sourceText, issues) {
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (
      ts.isStringLiteral(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isJsxText(node)
    ) {
      const value = node.getText(sourceFile).slice(1, -1);
      const match = value.match(DISALLOWED_DASHES);
      if (match?.index != null) {
        pushIssue(
          issues,
          file,
          lineNumberAt(sourceText, node.getStart(sourceFile) + match.index),
          'contains an em/en dash in user-facing copy',
        );
      }
    }
    if (ts.isTemplateExpression(node)) {
      const segments = [node.head, ...node.templateSpans.map((span) => span.literal)];
      segments.forEach((segment) => {
        const match = segment.text.match(DISALLOWED_DASHES);
        if (match?.index != null) {
          pushIssue(
            issues,
            file,
            lineNumberAt(sourceText, segment.getStart(sourceFile) + match.index),
            'contains an em/en dash in user-facing copy',
          );
        }
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function checkRawColors(file, sourceText, issues) {
  for (const pattern of DISALLOWED_COLORS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(sourceText)) !== null) {
      pushIssue(
        issues,
        file,
        lineNumberAt(sourceText, match.index),
        `contains disallowed gold/amber token "${match[0]}"`,
      );
    }
  }
}

const files = TARGETS.map((target) => path.join(ROOT, target));
const issues = [];

for (const file of files) {
  const sourceText = await fs.readFile(file, 'utf8');
  if (file.endsWith('.ts') || file.endsWith('.tsx')) {
    checkTsTextNodes(file, sourceText, issues);
  }
  checkRawColors(file, sourceText, issues);
}

if (issues.length > 0) {
  console.error('brand-check failed:\n');
  console.error(issues.join('\n'));
  process.exit(1);
}

console.log('brand-check passed.');
