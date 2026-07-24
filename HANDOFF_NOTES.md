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

## Market suggestions payload gap

- Current `/trade-suggestions` payload shape is still the light lane contract:
  ```json
  {
    "available": true,
    "suggestions": [
      {
        "partnerRosterId": 2,
        "partnerName": "Hermes Express",
        "give": [{ "id": "t-mclaurin", "name": "Terry McLaurin" }],
        "get": [{ "id": "d-london", "name": "Drake London" }],
        "youDelta": 2.1,
        "partnerDelta": -1.2
      }
    ],
    "debug": { "enumerated": 18, "scanned": 18, "resimmed": 6, "positive": 3, "ms": 382 }
  }
  ```
- Missing per-suggestion fields for the Deals card right rail:
  - your playoff-odds delta
  - your current-week matchup win-probability delta
- Request for Franco's side:
  - add those two per-suggestion deltas directly to `/trade-suggestions` so the Deals rail can render `Playoffs` and `This week` without client derivation or per-card `/trade-analyze` fan-out
- Current UI status on Friday, July 24, 2026:
  - the Deals rail now labels the existing payload fields as `Your title` (`youDelta`) and `them` (`partnerDelta`)
  - `Playoffs` and `This week` remain intentionally absent because those fields are still not present in the payload

## Matchup optimality contradiction, resolved display-side

- The July 24, 2026 audit caught a contradiction on Matchup:
  - hero strip: `Your lineup is already the best play`
  - bench rows: visible moneyline improvements for bench starters
- Root cause on the frontend:
  - the hero strip was gated by the stricter starter-row urgency helper
  - the bench rows were showing any positive best-fit line move
  - both reads were using the same priced lineup view, but the page was applying two different display thresholds
- Frontend fix:
  - the hero `biggest edge` / `optimal` state now keys off the best positive bench-driven line move, so the page can no longer say `optimal` while a positive bench move is visible elsewhere on the same screen
- No engine handoff is needed here because this was not a disagreement between two server payloads

## Board adjusted-value payload gap

- The merged `Board` surface still has one frozen legacy exception: the headline `Adjusted value` number and Board ordering are coming from the pre-existing client-side computation that used to live inline in `MyBoardPage.tsx`.
- That logic is now quarantined in `src/pages/legacyAdjustedValue.ts` with an explicit frozen comment and no extensions.
- Request for Franco's side:
  - expose `adjustedValue` per player directly on `/api/rankings`
  - keep the existing ranking payload fields alongside it
- UI contract on our side:
  - the merged Board page is ready to prefer a payload `adjustedValue` field immediately
  - the legacy module can be deleted the same day that field lands

## Board trend payload gap

- The new Board rows were designed with a quiet trend slot, but the UI is shipping without a trend chip because the current payloads do not provide player-level board movement history.
- Missing field request:
  - a player-level board-history or trend delta field on `/api/rankings` or a companion endpoint
- Constraint held on the frontend:
  - no board movement was derived, approximated, or inferred from unrelated numbers

## Player votes lab handoff

- The KTC-style prompt is dark-launched behind `og.labs.player-votes`.
- Votes queue locally only in `localStorage["og.playerVotes.queue"]`.
- Current queued shape:
  ```json
  {
    "at": "2026-07-24T14:05:00.000Z",
    "keep": "9509",
    "keepName": "Bijan Robinson",
    "trade": "4035",
    "tradeName": "Ja'Marr Chase",
    "cut": "11672",
    "cutName": "Puka Nacua",
    "trio": ["9509", "4035", "11672"]
  }
  ```
- Proposed event interpretation for Franco's side:
  - ordered triple -> three pairwise facts
  - `keep > trade`
  - `keep > cut`
  - `trade > cut`
- Open question that stays on Franco's side:
  - if and how comparative vote facts should convert into his agreement inputs or a separate crowd signal
- Research note for why this exists:
  - comparative judgment tends to outperform absolute rating scales in crowd-ranking literature, which is why the UI explores it without touching the live agreement pipeline yet
