# Acceptance Lingo Report

## Loud callout

Before this pass, the frontend did **not** have one acceptance vocabulary.

- The trade verdict panel had its **own local bucket map**.
- Matchup market rows used a **different helper map**.
- Trade lane cards and both `Why this trade?` text builders often showed the **raw percentage with no band at all**.
- A second helper in `src/utils/tradeSuggestionDisplay.ts` carried old labels that could drift again if reused.

That meant a 40% read could land as `Coin flip` on one surface, `Unlikely` on another, or show no label at all.

## Current source of truth

All acceptance words now route through one file:

- `src/utils/acceptanceLingo.ts:10-42`

Current default bands:

| Acceptance | Label |
| --- | --- |
| 0-9% | Long shot |
| 10-29% | Unlikely |
| 30-44% | Doubtful |
| 45-55% | Coin flip |
| 56-69% | Likely |
| 70-84% | Favored |
| 85-100% | Near lock |

## Inventory

| Surface | Pre-change behavior | Old map used before fix | Centralized before fix? | Ref / screenshot |
| --- | --- | --- | --- | --- |
| Trade verdict panel, `Will X accept?` | Showed `%` plus a local word label | `0-19 Long shot`, `20-39 Unlikely`, `40-59 Coin flip`, `60-79 Likely`, `80-100 Very likely` | No. Local to `TradeAnalyzerPanel` | `src/components/trade/TradeAnalyzerPanel.tsx:37-123` |
| Trade verdict details | No `Why this trade?` expander. Roster-limit banner and override select lived in the main flow | No acceptance band in prose | No | `src/components/trade/TradeAnalyzerPanel.tsx:64-71`, `106-133`, `190-200` |
| Deal lane cards in Market | Showed raw `% to accept` only | None, raw percentage only | No | `src/pages/TradePage.tsx:922-930`, `976-986` |
| Deal lane `Why this trade?` text | Added raw `X% to accept.` sentence only | None, raw percentage only | No | `src/pages/TradePage.tsx:620-627` |
| Matchup page, `The market` acceptance badge | Showed `%` and a helper-generated word | `0-24 Long shot`, `25-44 Unlikely`, `45-59 Coin flip`, `60-79 Likely`, `80-100 Very likely` | No. Came from a separate helper | `src/pages/MatchupPage.tsx:531-533`, `571-581` |
| Matchup page, `Why this trade?` text | Mentioned acceptance in free text, no shared band sentence | None, raw percentage only | No | `src/pages/MatchupPage.tsx:403-414` |
| Trade suggestion display helper | Held a second old label map plus low-acceptance tag logic | Same as matchup helper above | No | `src/utils/tradeSuggestionDisplay.ts:1-50` |

## Old to new

### Verdict panel old map

| Old band | Old label | New result |
| --- | --- | --- |
| 0-19% | Long shot | `0-9 Long shot`, `10-19 Unlikely` |
| 20-39% | Unlikely | `20-29 Unlikely`, `30-39 Doubtful` |
| 40-59% | Coin flip | `40-44 Doubtful`, `45-55 Coin flip`, `56-59 Likely` |
| 60-79% | Likely | `60-69 Likely`, `70-79 Favored` |
| 80-100% | Very likely | `80-84 Favored`, `85-100 Near lock` |

### Matchup helper old map

| Old band | Old label | New result |
| --- | --- | --- |
| 0-24% | Long shot | `0-9 Long shot`, `10-24 Unlikely` |
| 25-44% | Unlikely | `25-29 Unlikely`, `30-44 Doubtful` |
| 45-59% | Coin flip | `45-55 Coin flip`, `56-59 Likely` |
| 60-79% | Likely | `60-69 Likely`, `70-79 Favored` |
| 80-100% | Very likely | `80-84 Favored`, `85-100 Near lock` |

### Raw-percent surfaces

| Old behavior | New result |
| --- | --- |
| `% only` | `% + shared label from `acceptanceLingo.ts`` |
| `X% to accept.` in prose | `X% to accept, SharedLabel.` |

## Roster-limit notice

Removed from the user-facing verdict flow:

- No roster-limit banner
- No override dropdown
- No partner auto-drop line in the always-visible results area

Kept as passive disclosure only inside the expanded verdict details:

- `Sim assumes you drop E. Johnson.`
- Same pattern for partner drops when the sim assumes one

Refs:

- `src/components/trade/TradeAnalyzerPanel.tsx:64-71`
- `src/components/trade/TradeAnalyzerPanel.tsx:117-133`
- `src/components/trade/TradeAnalyzerPanel.tsx:190-200`

## Verification refs

- Public demo market screenshot: `artifacts/acceptance-lingo-demo-matchup.png`
- Public demo `Why this trade?` screenshot: `artifacts/acceptance-lingo-demo-why.png`
- Auth-gated trade screens were verified by source wiring and helper output because the in-app browser had no signed-in local session for DINK / Odds Frauds during this pass.

Helper spot-check:

- `3% -> Long shot`
- `40% -> Doubtful`
- `44% -> Doubtful`
- `45-55% -> Coin flip`
- `56% -> Likely`
- `85% -> Near lock`
