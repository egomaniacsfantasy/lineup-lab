# Import your agreement scores in one shot

This folder lets you (or your Claude) load a whole CSV of agreement scores into
your Olympus account at once, instead of typing each player in the Projections
page. It signs in **as you** and writes the scores under your own account, so
only you can see/edit them (same as if you'd typed them by hand).

## What you need
- **Node 18+** (`node --version`). No `npm install` — the script uses built-in fetch.
- An **Olympus account** — the same email/password you log into the app with.
  (If you don't have one yet, sign up once in the app, then run this.)
- A CSV with header `position,player,score` (see `vlahakis_scores.csv`).

## Run it

**PowerShell (Windows):**
```powershell
$env:OLYMPUS_EMAIL="you@example.com"
$env:OLYMPUS_PASSWORD="your-password"
node tools/agreement-import/import-scores.mjs tools/agreement-import/vlahakis_scores.csv
```

**bash / macOS / Linux:**
```bash
OLYMPUS_EMAIL=you@example.com OLYMPUS_PASSWORD=your-password \
  node tools/agreement-import/import-scores.mjs tools/agreement-import/vlahakis_scores.csv
```

You'll see `upserted 100/343 … Done.` Then open the app → **Projections** →
**Edit agreement** and your numbers will be there.

## Notes
- Re-running is safe: it **upserts**, so it overwrites your existing score for a
  player rather than duplicating. Edit the CSV and re-run to update in bulk.
- `score` is 0–100. 50 = "model is right"; below 50 = underrated (boost),
  above 50 = overrated (cut). Blank/invalid rows are skipped.
- Only scores for real player names in the current dataset show up in the UI; a
  score for a name that isn't in this year's projections is stored but won't
  appear until that name exists.
