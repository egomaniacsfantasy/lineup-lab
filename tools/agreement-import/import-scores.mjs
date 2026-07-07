#!/usr/bin/env node
/**
 * Bulk-import a user's agreement scores into the Olympus per-user table.
 *
 * It signs in as the user (email + password), then upserts every row of a CSV
 * into `olympus_agreement`. Because it authenticates AS the user, Row-Level
 * Security is satisfied automatically — the rows land under that user's account,
 * exactly as if they'd typed each one in the Projections page.
 *
 * No npm install required: uses Node's built-in fetch (Node 18+).
 *
 * Usage (PowerShell):
 *   $env:OLYMPUS_EMAIL="you@example.com"
 *   $env:OLYMPUS_PASSWORD="your-password"
 *   node tools/agreement-import/import-scores.mjs tools/agreement-import/vlahakis_scores.csv
 *
 * Usage (bash):
 *   OLYMPUS_EMAIL=you@example.com OLYMPUS_PASSWORD=your-password \
 *     node tools/agreement-import/import-scores.mjs tools/agreement-import/vlahakis_scores.csv
 *
 * The CSV must have a header row: position,player,score
 *   position ∈ QB|RB|WR|TE|K|DEF   player = exact name   score = 0..100
 */

import { readFileSync } from 'node:fs';

// Public project config — same values the browser app ships with. The anon key
// is safe to expose; RLS is what protects the data.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ffilmwousdjjbvhztzqr.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_KEY || 'sb_publishable_QJRxVLfxx55CWUa6psE04g_RqEvnTSw';

const email = process.env.OLYMPUS_EMAIL;
const password = process.env.OLYMPUS_PASSWORD;
const csvPath = process.argv[2] || 'tools/agreement-import/vlahakis_scores.csv';

if (!email || !password) {
  console.error('ERROR: set OLYMPUS_EMAIL and OLYMPUS_PASSWORD env vars (the login you use on the app).');
  process.exit(1);
}

const VALID_POS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const hdr = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const iPos = hdr.indexOf('position');
  const iName = hdr.indexOf('player');
  const iScore = hdr.indexOf('score');
  if (iPos < 0 || iName < 0 || iScore < 0) {
    throw new Error('CSV header must contain: position,player,score');
  }
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const position = (c[iPos] ?? '').trim();
    const player = (c[iName] ?? '').trim();
    const score = Number((c[iScore] ?? '').trim());
    if (!VALID_POS.has(position) || !player) continue;
    if (!Number.isFinite(score) || score < 0 || score > 100) continue;
    rows.push({ position, player, score: Math.round(score) });
  }
  return rows;
}

async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sign-in failed (${res.status}): ${t}`);
  }
  const j = await res.json();
  if (!j.access_token || !j.user?.id) throw new Error('Sign-in returned no token/user.');
  return { token: j.access_token, userId: j.user.id };
}

async function upsertBatch(rows, token, userId) {
  const payload = rows.map((r) => ({ user_id: userId, ...r }));
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/olympus_agreement?on_conflict=user_id,position,player`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Upsert failed (${res.status}): ${t}`);
  }
}

async function main() {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  console.log(`Parsed ${rows.length} valid scores from ${csvPath}`);
  const { token, userId } = await signIn();
  console.log(`Signed in as ${email} (user ${userId.slice(0, 8)}…)`);

  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await upsertBatch(batch, token, userId);
    console.log(`  upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log(`Done. ${rows.length} scores are now under your account.`);
  console.log('Log into the app → Projections → Edit agreement to see them.');
}

main().catch((e) => {
  console.error('IMPORT FAILED:', e.message);
  process.exit(1);
});
