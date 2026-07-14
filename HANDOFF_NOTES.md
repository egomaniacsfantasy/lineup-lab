# Handoff Notes

## Dynasty trades override

- The Market gate is now reopened for dynasty leagues behind `More -> Labs -> Dynasty trades (experimental)`.
- Default is ON for local testing.
- The temporary client gate comment is in `TradePage.tsx`:
  - `// TEMPORARY - dynasty trade UX unvalidated`

## Known product caveat

- Dynasty pricing quality is still the open question owned outside this task.
- This frontend change does **not** price rookie picks, age curves, or dynasty-specific market value.
- Users can now reach the dynasty Market and trade flow for product testing, but the values may still be provisional.

## Sleeper client fetches

- No browser CORS failures were observed during this implementation work.
- The client dossier flow relies on these public endpoints:
  - `/v1/league/<id>`
  - `/v1/league/<id>/rosters`
  - `/v1/league/<id>/transactions/<week>`
  - `/v1/league/<id>/matchups/<week>`
  - `/v1/league/<id>/winners_bracket`
  - `/v1/user/<id>/leagues/nfl/<season>`

## DINK fixture note

- `DINK` is behaving as the deliberate unmanaged-roster edge-case fixture.
- The new scouting UI treats those vacant rosters as `No file. Unmanaged team.` instead of inventing persona data.
