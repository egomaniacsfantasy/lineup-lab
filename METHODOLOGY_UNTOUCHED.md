# Methodology Untouched

This rebuild pass was constrained by one rule: frontend presentation changed, pricing methodology did not.

## Constitution

- Frontend surfaces do not compute a trade metric.
- Suggestions render in engine order. Filters may hide rows, never re-rank them.
- Every rendered number must trace back to a payload field through the view-model layer.
- Allowed frontend transforms are limited to:
  - display rounding
  - percent to American, and American to percent, formatting
  - payload-provided before and after pairs rendered as a delta chip
  - sign-driven color only
- Franco-derived metrics lead. `pts/wk` remains secondary payload detail, never the headline currency.

## What This Pass Changed

- Dev-only screenshot harness and fixture routes
- Shared frontend design primitives and token tightening
- Matchup empty-state compaction and market digest presentation
- Market page composition and builder idle-state treatment
- League board right-rail alignment guard
- Futures hierarchy and chart-legibility pass
- Shared chart-system rebuild across Futures, League board drill-in, and Schedule pace
- League This week board v2 layout with docked right rail and fixed numeric columns
- Regression guards and documentation

## What This Pass Did Not Change

- Pricing engine logic
- Trade suggestion ordering
- Acceptance model math
- Futures math
- Matchup simulation math
- Server routes, persistence, or valuation formulas

## Files Touched

- `scripts/design-shots.mjs`
- `src/dev/designFixtures.ts`
- `src/pages/DesignFixturePage.tsx`
- `src/pages/DesignBoardRowPage.tsx`
- `src/App.tsx`
- `src/services/leagueApi.ts`
- `src/styles/tokens.css`
- `src/components/ui/DesignPrimitives.tsx`
- `src/components/ui/DesignPrimitives.css`
- `src/pages/MatchupPage.tsx`
- `src/pages/MatchupPage.css`
- `src/components/trade-display/TradeDisplay.tsx`
- `src/components/trade-display/TradeDisplay.css`
- `src/pages/TradePage.tsx`
- `src/pages/TradePage.css`
- `test/noTradeMath.test.mjs`
- `HANDOFF_NOTES.md`
- `src/components/charts/OddsChart.tsx`
- `src/components/charts/OddsChart.css`
- `src/components/league/MatchupSlate.css`
- `src/components/league/MatchupSlate.tsx`
- `src/components/league/LeagueFutures.tsx`
- `src/components/league/LeagueFutures.css`
- `src/components/season/ScheduleGrid.tsx`
- `src/components/season/ScheduleGrid.css`
- `src/pages/LeaguePage.css`
- `src/adapters/connectedLeague.ts`
- `src/mocks/league.ts`
- `src/components/league/LeagueMovementChip.tsx`
- `src/components/league/LeagueMovementChip.css`
- `test/matchupSlateAlignment.test.mjs`
- `test/matchupSlateBoardRowRegression.test.mjs`
- `DESIGN_PASS.md`

## Payload Map Additions

- Matchup confirmation strip:
  - Visibility is driven by existing Matchup view-model emptiness only: `!topSwapEvaluation?.bestBenchAlternative` and `movers.length === 0`
  - The right-hand as-of stamp is still display-only from `pricingMeta.lastUpdatedAt -> formatAsOfTime(...)`
- Biggest edge:
  - Player identities still come from the existing Matchup view-model's `topSwapEvaluation`
  - Before and after line reads still come from the already-priced line objects returned by `engine.getOptionLine(...)` inside the existing page flow
  - This pass only changed layout, labeling, and the display meter
- Matchup market digest:
  - Rows still consume `LeaguePricing.movers`
  - Acceptance labels, before/after prices, and `pts/wk` copy remain payload-driven display reads
- Market deals suggestions:
  - Manager chips are now seeded from `/trade-suggestions -> suggestions[].partnerRosterId`
  - Suggestion card partner name reads from `TradeSuggestion.partnerName` with the synced roster name as display fallback
  - Suggestion card `Title` row reads directly from `TradeSuggestion.youDelta`
  - `Playoffs` and `This week` lines are intentionally absent because `/trade-suggestions` does not currently provide those per-suggestion deltas
  - The `generated at h:mm` stamp remains display-only from the fetch completion time for the current suggestions response
- Futures board and chart:
  - Table rows still consume `LeaguePricing.futures`
  - Quiet movement text is derived only from existing `LineHistoryEntry.titleProb` / `playoffProb` histories already returned to the page
  - The shared chart samples day-closing points from existing `LineHistoryEntry.titleProb` / `playoffProb` values only
  - Range pills only filter to real sampled points already in the payload. No interpolation or fabricated midpoints are introduced
  - Endpoint tag repeats the same team identity and current price already shown by the selected futures row
- League This week board:
  - Team owner handles now read from `bootstrap.teams[].ownerName` through `toWeekMatchups(...)`
  - Board rows still render from existing board/history view-model fields in engine order
  - The board rail's `Highest total` card reads the existing priced matchup total through `PricedSide.total -> LeagueWeekMatchup.totalProjection`
  - The drill-in chart samples only real `LineHistoryEntry.lines[].sides[rosterId].winProbability` points, bucketed to day-closing display points with no interpolation
  - The July 24 board v2 pass only changes grid allocation, name presentation, and row drill-in layout
- Schedule pace chart:
  - Continues from the existing schedule view-model already built from priced weekly schedule items
  - This pass only changed scrub behavior, axis labeling, and presentation
  - The chart does not invent weekly probabilities or change schedule ordering
- Design fixtures:
  - `src/dev/designFixtures.ts` mirrors payload shapes for browser capture only
  - Fixtures never replace server methodology in connected-league runtime

## Guard Rails

- `test/noTradeMath.test.mjs` locks TradePage to the branded `oddsPairDelta` display helper instead of inline probability math.
- `src/utils/noTradeMath.ts` brands the only allowed frontend delta transform for engine-provided odds pairs.
- `test/noTradeMath.test.mjs` now also locks the Deals module away from the retired scan copy/path and the removed `Why this trade?` trigger.
- `test/matchupSlateAlignment.test.mjs` locks the League This week board to a fixed chip rail on desktop and tablet widths so `YOUR GAME` never shifts row alignment.
- `test/matchupSlateBoardRowRegression.test.mjs` launches the dev-only board-row fixture and checks that the right avatar never overlaps the fixed rail after the pill removal, while long left and right team names share width evenly before truncation pressure would appear.
