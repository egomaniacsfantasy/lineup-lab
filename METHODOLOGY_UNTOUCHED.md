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
- `src/components/league/MatchupSlate.css`
- `src/components/league/LeagueFutures.tsx`
- `src/components/league/LeagueFutures.css`
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
- Futures board and chart:
  - Table rows still consume `LeaguePricing.futures`
  - Quiet movement text is derived only from existing `LineHistoryEntry.titleProb` / `playoffProb` histories already returned to the page
  - Endpoint tag repeats the same team identity and current price already shown by the selected futures row
- League This week board:
  - The fixed chip rail changes layout only
  - Row prices, win percentages, and movement summaries still render from existing board/history view-model fields in engine order
  - The July 23 board-row fix only changes grid allocation, truncation behavior, and dev-only screenshot coverage
- Design fixtures:
  - `src/dev/designFixtures.ts` mirrors payload shapes for browser capture only
  - Fixtures never replace server methodology in connected-league runtime

## Guard Rails

- `test/noTradeMath.test.mjs` locks TradePage to the branded `oddsPairDelta` display helper instead of inline probability math.
- `src/utils/noTradeMath.ts` brands the only allowed frontend delta transform for engine-provided odds pairs.
- `test/matchupSlateAlignment.test.mjs` locks the League This week board to a fixed chip rail on desktop and tablet widths so `YOUR GAME` never shifts row alignment.
- `test/matchupSlateBoardRowRegression.test.mjs` launches the dev-only board-row fixture and checks that the right avatar never overlaps the fixed chip rail, while long left and right team names share width evenly before ellipsis kicks in.
