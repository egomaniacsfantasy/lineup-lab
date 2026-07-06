#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_COLUMNS = ['vlahakis', 'williams'];

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.AGREEMENT_BASE_URL || '',
    password: process.env.ADMIN_PASSWORD || process.env.PROJECTIONS_ADMIN_PASSWORD || '',
    columns: DEFAULT_COLUMNS,
    write: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base-url') {
      args.baseUrl = next ?? '';
      i += 1;
    } else if (arg === '--password') {
      args.password = next ?? '';
      i += 1;
    } else if (arg === '--columns') {
      args.columns = (next ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--dry-run') {
      args.write = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, '');
  return args;
}

function printHelp() {
  console.log(`Reverse Projections agreement values around 50.

Examples:
  node scripts/reverseAgreementValues.mjs --base-url https://example.onrender.com
  node scripts/reverseAgreementValues.mjs --base-url https://example.onrender.com --columns vlahakis --write

Options:
  --base-url <url>       App origin to update. Can also use AGREEMENT_BASE_URL.
  --password <password>  Admin password. Can also use ADMIN_PASSWORD or PROJECTIONS_ADMIN_PASSWORD.
  --columns <list>       Comma-separated columns. Default: vlahakis,williams.
  --write                Actually POST reversed values. Default is dry-run only.
  --dry-run              Preview only.

Reverse math is: new value = 100 - old value, so 80 -> 20, 20 -> 80, 50 -> 50.
`);
}

function assertValidArgs(args) {
  if (!args.baseUrl) throw new Error('Missing --base-url or AGREEMENT_BASE_URL.');
  if (args.write && !args.password) {
    throw new Error('Missing admin password for --write. Use --password or ADMIN_PASSWORD.');
  }
  for (const col of args.columns) {
    if (!DEFAULT_COLUMNS.includes(col)) {
      throw new Error(`Unknown column "${col}". Expected one of: ${DEFAULT_COLUMNS.join(', ')}`);
    }
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${options?.method ?? 'GET'} ${url} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

function collectChanges(agreement, columns) {
  const changes = [];
  const skipped = [];

  for (const [position, players] of Object.entries(agreement)) {
    for (const [name, cell] of Object.entries(players ?? {})) {
      for (const column of columns) {
        const raw = cell?.[column];
        if (raw == null || String(raw).trim() === '') continue;

        const original = Number(String(raw).trim());
        if (!Number.isFinite(original)) {
          skipped.push({ position, name, column, raw, reason: 'not numeric' });
          continue;
        }

        const reversed = 100 - original;
        const value = String(Number.isInteger(reversed) ? reversed : Number(reversed.toFixed(4)));
        if (value === String(raw).trim()) continue;
        changes.push({ position, name, column, raw: String(raw), value });
      }
    }
  }

  return { changes, skipped };
}

function writeBackup(agreement) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(process.cwd(), 'server', 'data', 'agreement-backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `agreement-export-before-reverse-${stamp}.json`);
  fs.writeFileSync(file, `${JSON.stringify(agreement, null, 2)}\n`);
  return file;
}

async function postChange(baseUrl, password, change) {
  await fetchJson(`${baseUrl}/api/projections/agreement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': password,
    },
    body: JSON.stringify({
      position: change.position,
      name: change.name,
      column: change.column,
      value: change.value,
    }),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertValidArgs(args);

  const agreement = await fetchJson(`${args.baseUrl}/api/projections/agreement/export`);
  const backupFile = writeBackup(agreement);
  const { changes, skipped } = collectChanges(agreement, args.columns);

  console.log(`Base URL: ${args.baseUrl}`);
  console.log(`Columns: ${args.columns.join(', ')}`);
  console.log(`Mode: ${args.write ? 'WRITE' : 'DRY RUN'}`);
  console.log(`Backup: ${backupFile}`);
  console.log(`Changes: ${changes.length}`);
  console.log(`Skipped: ${skipped.length}`);

  for (const change of changes.slice(0, 20)) {
    console.log(`- ${change.position} ${change.name} [${change.column}]: ${change.raw} -> ${change.value}`);
  }
  if (changes.length > 20) console.log(`...and ${changes.length - 20} more`);

  if (!args.write) {
    console.log('Dry run only. Re-run with --write to save these reversals.');
    return;
  }

  let completed = 0;
  for (const change of changes) {
    await postChange(args.baseUrl, args.password, change);
    completed += 1;
    if (completed % 25 === 0) console.log(`Posted ${completed}/${changes.length}`);
  }
  console.log(`Done. Posted ${completed} reversed agreement values.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
