import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'server', 'espn-login-worker/src'];
const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

const failures = [];

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') return [];
      return walk(path.relative(ROOT, full));
    }
    return EXTENSIONS.has(path.extname(entry.name)) ? [full] : [];
  });
}

function lineAndColumn(text, index) {
  const before = text.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function pushFailure(file, text, index, reason, excerpt) {
  const { line, column } = lineAndColumn(text, index);
  failures.push(`${path.relative(ROOT, file)}:${line}:${column} ${reason}: ${excerpt.trim()}`);
}

function stripComments(text) {
  let output = '';
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quote) {
      output += char;
      if (char === '\\') {
        i += 1;
        output += text[i] ?? '';
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      i += 2;
      for (; i < text.length && text[i] !== '\n'; i += 1) output += ' ';
      i -= 1;
      continue;
    }

    if (char === '/' && next === '*') {
      output += '  ';
      i += 2;
      for (; i < text.length; i += 1) {
        if (text[i] === '\n') output += '\n';
        else output += ' ';
        if (text[i] === '*' && text[i + 1] === '/') {
          output += ' ';
          i += 1;
          break;
        }
      }
      continue;
    }

    output += char;
  }
  return output;
}

function scanStringLiterals(file, text) {
  for (let i = 0; i < text.length; i += 1) {
    const quote = text[i];
    if (quote !== '"' && quote !== "'" && quote !== '`') continue;

    let content = '';
    const start = i;
    i += 1;
    for (; i < text.length; i += 1) {
      const char = text[i];
      if (char === '\\') {
        content += char;
        i += 1;
        content += text[i] ?? '';
        continue;
      }
      if (quote === '`' && char === '$' && text[i + 1] === '{') {
        content += '${';
        i += 2;
        let depth = 1;
        for (; i < text.length && depth > 0; i += 1) {
          if (text[i] === '\\') {
            i += 1;
            continue;
          }
          if (text[i] === '{') depth += 1;
          if (text[i] === '}') depth -= 1;
        }
        i -= 1;
        continue;
      }
      if (char === quote) break;
      content += char;
    }

    const trimmed = content.trim();
    if (content.includes(' – ')) {
      pushFailure(file, text, start, 'spaced en dash in UI string', content);
    }
    if (content.includes('—') && trimmed !== '—') {
      pushFailure(file, text, start, 'em dash in UI string', content);
    }
  }
}

function scanJsxText(file, text) {
  if (!file.endsWith('.tsx') && !file.endsWith('.jsx')) return;
  let offset = 0;
  text.split('\n').forEach((line, index) => {
    const start = offset;
    offset += line.length + 1;
    if (!line.includes('—') && !line.includes(' – ')) return;
    if (!line.includes('<') && !line.includes('>')) return;
    const visible = line
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!visible || visible === '—') return;
    if (visible.includes(' – ')) {
      pushFailure(file, text, start, 'spaced en dash in JSX text', visible);
    }
    if (visible.includes('—')) {
      pushFailure(file, text, start, 'em dash in JSX text', visible);
    }
  });
}

for (const file of SCAN_DIRS.flatMap(walk)) {
  const text = fs.readFileSync(file, 'utf8');
  const code = stripComments(text);
  scanStringLiterals(file, code);
  scanJsxText(file, code);
}

if (failures.length > 0) {
  console.error('Copy scan failed. Replace sentence-break em/en dashes with commas, periods, colons, or parentheses.');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Copy scan passed.');
