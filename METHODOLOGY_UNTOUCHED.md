# Methodology Untouched

This rebuild pass was constrained by one rule: frontend presentation changed, pricing methodology did not.

## Legacy Exception

- A pre-existing client-side adjusted-value computation was found in the old `MyBoardPage.tsx`.
- It has been moved, untouched, into `src/pages/legacyAdjustedValue.ts` under a frozen comment block:
  - `LEGACY CLIENT-SIDE COMPUTATION — violates the display-verbatim rule, predates it. Frozen. Delete when /api/rankings exposes adjustedValue. Do not extend.`
- The merged Board surface still renders that exact legacy headline number and ordering so the live feature does not regress before Franco exposes a server-side `adjustedValue` field.
- No new client-side valuation math was added around it.

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
- Board + Projections merge into one `Board` surface with `Board` and `Sheet` views
- Legacy board math quarantined into one frozen module instead of being extended
- Labs-only Keep / Trade / Cut prompt with a local queue only
- League polish pass for board row presentation, shared chart interaction, futures movement hierarchy, and schedule chart readability
- Post-audit frontend fixes for Market manager selection, Matchup optimal-state display consistency, shared displayed-delta formatting, and Board/Sheet cleanup

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
- `src/components/trade/TradeAnalyzerPanel.tsx`
- `test/noTradeMath.test.mjs`
- `HANDOFF_NOTES.md`
- `src/components/charts/OddsChart.tsx`
- `src/components/charts/OddsChart.css`
- `src/components/league/MatchupSlate.css`
- `src/components/league/MatchupSlate.tsx`
- `src/components/league/LeagueFutures.tsx`
- `src/components/league/LeagueFutures.css`
- `src/components/season/ScheduleGrid.tsx`
- `src/pages/DesignBoardRowPage.tsx`
- `src/utils/leagueMovement.ts`
- `src/components/season/ScheduleGrid.css`
- `src/pages/LeaguePage.css`
- `src/adapters/connectedLeague.ts`
- `src/mocks/league.ts`
- `src/components/league/LeagueMovementChip.tsx`
- `src/components/league/LeagueMovementChip.css`
- `test/matchupSlateAlignment.test.mjs`
- `test/matchupSlateBoardRowRegression.test.mjs`
- `DESIGN_PASS.md`
- `src/pages/MyBoardPage.tsx`
- `src/pages/MyBoardPage.css`
- `src/pages/legacyAdjustedValue.ts`
- `src/pages/MorePage.tsx`
- `src/components/layout/AppHeader.tsx`
- `src/components/layout/BottomTabBar.tsx`
- `src/hooks/useLabsFlags.ts`
- `scripts/brand-check.mjs`
- `test/boardMergeRoutes.test.mjs`
- `src/utils/displayDelta.ts`
- `test/displayDelta.test.mjs`

## Payload Map Additions

- Matchup confirmation strip:
  - Visibility is driven by existing Matchup view-model emptiness only: `!topPositiveEvaluation?.bestBenchAlternative` and `movers.length === 0`
  - The right-hand as-of stamp is still display-only from `pricingMeta.lastUpdatedAt -> formatAsOfTime(...)`
- Biggest edge:
  - Player identities still come from the existing Matchup view-model built from `starterEvaluations`
  - Before and after line reads still come from the already-priced line objects returned by `engine.getOptionLine(...)` inside the existing page flow
  - This pass only changed layout, labeling, and the display trigger that decides whether the page shows `biggest edge` or `optimal`
- Matchup projection-sheet banner:
  - Count still reads from `PricedSide.unpricedStarters.length`
  - Singular copy now names the player through `PricedSide.unpricedStarters[] -> bootstrap.players[playerId].name`
- Matchup market digest:
  - Rows still consume `LeaguePricing.movers`
  - Acceptance labels, before/after prices, and `pts/wk` copy remain payload-driven display reads
- Market deals suggestions:
  - Manager chips are now seeded from `bootstrap.teams.filter((team) => !team.isUser)`
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
- Board + Sheet merge:
  - The merged Board list still starts from `/api/rankings -> rankings[]`
  - Board and Sheet headline values still use the existing ranking payload fields:
    - `BoardRow.seasonTotal` -> `Proj pts`
    - `BoardRow.floor` -> `Floor`
    - `BoardRow.ceiling` -> `Ceiling`
    - `BoardRow.tier` -> rendered tier bars
  - The expanded player card's stat strip reads only from `/api/projections -> players[].season`
  - The expanded player card's next-opponent line reads only from `/api/projections -> players[].weekly[]`
  - The Board view intentionally renders no trend chip because neither `/api/rankings` nor `/api/projections` currently provides a player-level board-movement field
  - The Sheet `Your rating` column and the player-card slider both write through the existing Supabase `olympus_agreement` save path and still trigger `/api/projections/refresh-adjusted`
  - The merged surface prefers a direct `/api/rankings` player-id join, then falls back to exact `position + name` matching only to connect existing payloads for display
  - The July 24 post-audit pass removes the Sheet presets only at the presentation layer. No payload fields or save paths changed
  - The July 24 post-audit pass changes row expansion only at the presentation layer:
    - Board rows now swap into the expanded card instead of repeating the collapsed row above it
    - Sheet rows keep the table row as the header and open the detail card beneath it without repeating player identity
- Player votes lab:
  - The prompt is gated by `og.labs.player-votes`
  - Votes are stored locally only in `localStorage["og.playerVotes.queue"]`
  - No vote writes hit a server route, Supabase table, engine input, or projection pipeline
- League This week board:
  - Team owner handles now read from `bootstrap.teams[].ownerName` through `toWeekMatchups(...)`
  - Board rows still render from existing board/history view-model fields in engine order
  - The board rail's `Highest total` card reads the existing priced matchup total through `PricedSide.total -> LeagueWeekMatchup.totalProjection`
  - The drill-in chart samples only real `LineHistoryEntry.lines[].sides[rosterId].winProbability` points, bucketed to day-closing display points with no interpolation
  - The July 24 board v2 pass only changes grid allocation, name presentation, and row drill-in layout
  - The July 24 post-audit pass keeps the same fixed board columns and rail widths while reallocating spare desktop width to the board shell before any team-name shortening tier engages
  - The July 24 polish pass adds display-only team-name tiering:
    - `LeagueWeekMatchup.teamA / teamB` -> board row display name (full, shortened suffix-free form, or monogram)
    - `LeagueWeekMatchup.teamAOwnerName / teamBOwnerName` plus existing record string -> board row owner meta line
  - Board movement text remains sourced from existing `LineHistoryEntry.lines[].sides[rosterId].winProbability`; the new footer copy only changes how the latest-threshold note is phrased
- Schedule pace chart:
  - Continues from the existing schedule view-model already built from priced weekly schedule items
  - This pass only changed scrub behavior, axis labeling, rounding display, and presentation
  - The chart does not invent weekly probabilities or change schedule ordering
- Shared chart system:
  - `OddsChart` still consumes only caller-provided point series and optional band series
  - The July 24 polish pass adds display-only behavior:
    - range filtering now includes the last real point before the range cutoff so held-value step charts do not fabricate a left-edge jump
    - scrub activation, snap-to-previous-point behavior, and tick de-collision are all presentation-only reads over existing point arrays
    - `displayValueForDelta(...)` lets a surface derive the delta chip from the same rounded display values already shown in the hero header. No new number enters the UI from this hook
    - `src/utils/displayDelta.ts` is the shared display-only rounding rule for before and after pairs. It rounds the displayed endpoints first, then computes the rendered delta from those displayed values
- Futures board and chart:
  - Quiet movement still reads only from existing `LineHistoryEntry.titleProb` / `playoffProb` history
  - The July 24 polish pass only splits that existing movement label into its own fixed display column and removes the per-row timeframe suffix from the rendered text
- Design fixtures:
  - `src/dev/designFixtures.ts` mirrors payload shapes for browser capture only
  - Fixtures never replace server methodology in connected-league runtime

## Guard Rails

- `test/noTradeMath.test.mjs` locks TradePage to the branded `oddsPairDelta` display helper instead of inline probability math.
- `src/utils/noTradeMath.ts` brands the only allowed frontend delta transform for engine-provided odds pairs.
- `test/noTradeMath.test.mjs` now also locks the Deals module away from the retired scan copy/path and the removed `Why this trade?` trigger.
- `test/matchupSlateAlignment.test.mjs` locks the League This week board to a fixed chip rail on desktop and tablet widths so `YOUR GAME` never shifts row alignment.
- `test/matchupSlateBoardRowRegression.test.mjs` launches the dev-only board-row fixture and checks that the right avatar never overlaps the fixed rail after the pill removal, while long left and right team names share width evenly before truncation pressure would appear.
- `test/boardMergeRoutes.test.mjs` locks the nav merge: no standalone Projections tab, `/projections` redirects to `Board · Sheet`, and the More-page tool card points at the merged surface.
- `test/displayDelta.test.mjs` locks the shared displayed-delta rule so the rendered delta always equals the difference of the rounded displayed endpoints.
