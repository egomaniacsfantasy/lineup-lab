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
- Rating-loop frontend fixes for Board search, agreement save feedback, refetch-on-save display, and display-only `My calls` artifacts
- Composition and energy pass for Matchup, League, and Market page framing, plus a public-Sleeper H2H strip and elastic activity rails
- Handoff first pass (2026-07-25): Matchup single-frame rebuild (legacy two-column root scoped to the cold skeleton), glance rebuild on payload-only items, Biggest-edge card restack, shared my-call marker util plus tests, Scouting page removal (data layer kept), Market composition fixes, bye-window exclusion from lock timing, and removal of the client-computed "downside line" sentence (a pre-existing frontend probability fabrication; deleted, not replaced)

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
- `src/pages/DesignChartPage.tsx`
- `src/pages/DesignChartPage.css`
- `src/services/headToHead.ts`
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
- `test/oddsChartDeltaFill.test.mjs`
- `src/pages/DesignBoardLoopPage.tsx`
- `test/boardInteractionLoop.test.mjs`
- `src/utils/myCalls.ts`
- `test/myCalls.test.mjs`
- `src/utils/playerGameContext.ts`
- `src/pages/market/ScoutingView.tsx` (deleted)
- `src/pages/market/ScoutingView.module.css` (deleted)
- `FRONTEND_DRIFT.md`
- `METHODOLOGY_UNTOUCHED.md`

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
- Matchup slot-by-slot board:
  - Starter identities still read from the existing matchup engine roster arrays:
    - `engine.roster[]`
    - `matchup.opponentTeam.roster[]`
  - Slot edge chips render only the difference of the two displayed starter projections:
    - `RosterSlot.projection - opponent RosterSlot.projection`
  - No win%, odds, or score math is derived in this board
- Matchup head-to-head strip:
  - Source is the public Sleeper API only, fetched client-side through `src/services/headToHead.ts`
- Matchup week-at-a-glance (2026-07-25 rebuild):
  - `Next lock` -> `buildExposureWindows(...)` share + day label; timing data only (Sleeper schedule), no pricing
  - `First kickoff` -> `getPlayerContext(starter).kickoff` + starter `shortName`; earliest-ISO selection, no numbers derived
  - `Tightest game` -> latest `lineHistory` entry `line.sides[rosterId].winProbability` pairs, names from `bootstrap.teams`; the argmin pick is a display SELECTION of which already-priced matchup to surface (the gap itself is never rendered); both displayed win%s are payload values rounded
  - Removed from this module: live line (hero dupe), best slot edge (edge-card dupe), "N plays" count
- Matchup hero baseline row (pre-existing, verified this pass):
  - `Franco ±X` -> `/lines?house=true` payload side (`moneyline`, `winProbability`); rendered through the same odds-format toggle, nothing recomputed
- Removed rendering (2026-07-25): the lock panel's "A bad Thursday drops your line to X -> Y" sentence. Its `to` value was computed client-side (`winProbability - share * 0.35` -> moneyline conversion) and traced to no payload field. Deleted; if this number should exist it must ship from the engine.
  - Reads:
    - `/v1/league/:id`
    - `/v1/league/:id/rosters`
    - `/v1/league/:id/matchups/:week`
    - the `previous_league_id` chain for prior seasons
  - Rendered facts:
    - all-time record
    - current streak
    - average score line
    - last-eight result timeline
  - No engine field or client-side projection math feeds this strip
- Matchup activity rail:
  - Reprice items read only from existing `lineHistory[] -> lines[] -> sides[rosterId].winProbability`
  - Market items read only from existing `LeaguePricing.movers`
  - The feed is chronological presentation only, not a ranked model
- Market deals suggestions:
  - Manager selection cards are seeded from `bootstrap.teams.filter((team) => !team.isUser)`
  - Each manager card title price reads directly from `LeaguePricing.futures[].championOdds` matched by `rosterId`
  - Suggestion card partner name reads from `TradeSuggestion.partnerName` with the synced roster name as display fallback
  - Suggestion card `Your title` row reads directly from `TradeSuggestion.youDelta`
  - Suggestion card quiet `them` row reads directly from `TradeSuggestion.partnerDelta`
  - `Playoffs` and `This week` lines are intentionally absent because `/trade-suggestions` does not currently provide those per-suggestion deltas
  - The `generated at h:mm` stamp remains display-only from the fetch completion time for the current suggestions response
- Futures board and chart:
  - Table rows still consume `LeaguePricing.futures`
  - Quiet movement text is derived only from existing `LineHistoryEntry.titleProb` / `playoffProb` histories already returned to the page
  - The shared chart samples day-closing points from existing `LineHistoryEntry.titleProb` / `playoffProb` values only
  - Range pills only filter to real sampled points already in the payload. No interpolation or fabricated midpoints are introduced
  - Endpoint tag repeats the same team identity and current price already shown by the selected futures row
  - The new in-plot `League range` label is presentation only over the same existing envelope band points
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
  - The July 24 rating-loop pass keeps that exact save path but now also scopes reads to the signed-in user through `olympus_agreement.user_id`, so the saved value shown after reload is still the same persisted field the existing write path updates
  - The merged surface prefers a direct `/api/rankings` player-id join, then falls back to exact `position + name` matching only to connect existing payloads for display
  - The July 24 post-audit pass removes the Sheet presets only at the presentation layer. No payload fields or save paths changed
  - The July 24 post-audit pass changes row expansion only at the presentation layer:
    - Board rows now swap into the expanded card instead of repeating the collapsed row above it
    - Sheet rows keep the table row as the header and open the detail card beneath it without repeating player identity
  - The July 24 rating-loop pass adds display-only Board artifacts on top of those same stored agreement values:
    - `olympus_agreement.score` -> Board row `YOU ▲` / `YOU ▼` marker whenever the persisted rating is above or below the existing aligned baseline of `50`
    - `olympus_agreement.score` -> `My calls (N)` count and filter, where `N` is the number of loaded players whose persisted rating is not `50`
    - `olympus_agreement.score` -> player-card `Your rating: X` summary copy and the saved-value chip after reload
  - The July 24 rating-loop pass does not preview or derive a future Board value client-side:
    - after a confirmed save, the page refetches the existing Board payload and only then highlights the row if the returned `adjustedValue` or visible rank actually changed
    - until that payload change arrives, the UI may show `Recalculating…` rather than claiming a number movement it has not received
  - The Board search box now keeps an in-progress local draft while the URL query param syncs behind it. This is input-state protection only, not a new data source
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
  - The July 24 composition pass keeps the same fixed board columns and rail widths while moving the team-name line to a true two-line stack:
    - `LeagueWeekMatchup.teamA / teamB` -> board row display name
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
    - the chart header now reserves fixed-width display slots for the delta chip and `Open → Now` summary, but the chip itself remains intrinsic-width inside that slot
    - `heroFillMode="zero"` now splits the existing point series into positive and negative rendered fill paths at the zero line. This is a drawing change only; the underlying point arrays are untouched
    - the futures envelope band still renders the same payload band points, but the left-edge fade now keys off chart-space x coordinates so the band starts where the payload starts without a detached slab
- Futures board and chart:
  - Quiet movement still reads only from existing `LineHistoryEntry.titleProb` / `playoffProb` history
  - The July 24 polish pass only splits that existing movement label into its own fixed display column and removes the per-row timeframe suffix from the rendered text
- Design fixtures:
  - `src/dev/designFixtures.ts` mirrors payload shapes for browser capture only
  - Fixtures never replace server methodology in connected-league runtime
  - `src/pages/DesignChartPage.tsx` adds synthetic positive-only and negative-only pace fixtures for visual regression of fill rendering only

## Guard Rails

- `test/noTradeMath.test.mjs` locks TradePage to the branded `oddsPairDelta` display helper instead of inline probability math.
- `src/utils/noTradeMath.ts` brands the only allowed frontend delta transform for engine-provided odds pairs.
- `test/noTradeMath.test.mjs` now also locks the Deals module away from the retired scan copy/path and the removed `Why this trade?` trigger.
- `test/matchupSlateAlignment.test.mjs` locks the League This week board to a fixed chip rail on desktop and tablet widths so `YOUR GAME` never shifts row alignment.
- `test/matchupSlateBoardRowRegression.test.mjs` launches the dev-only board-row fixture and checks that the right avatar never overlaps the fixed rail after the pill removal, while long left and right team names share width evenly before truncation pressure would appear.
- `test/boardMergeRoutes.test.mjs` locks the nav merge: no standalone Projections tab, `/projections` redirects to `Board · Sheet`, and the More-page tool card points at the merged surface.
- `test/displayDelta.test.mjs` locks the shared displayed-delta rule so the rendered delta always equals the difference of the rounded displayed endpoints.
- `test/oddsChartDeltaFill.test.mjs` launches the synthetic chart fixtures and samples rendered fill pixels so all-negative pace charts cannot leak green fill and all-positive pace charts cannot leak red fill.
- `test/boardInteractionLoop.test.mjs` launches the dev-only Board rerender harness and locks the two regression paths from the July 24 rating-loop audit:
  - a realistic-speed typed search string must survive rerenders intact
  - a committed slider rating must survive rerenders and keep the confirmed saved value visible

---

## 2026-07-25 — Board sorting (FLAG FOR FRANCO)

The board now exposes a user-facing Sort control: Board order (default),
Proj pts, Floor, Ceiling, Your rating.

Why this was judged safe, and where the line was drawn:

- The DEFAULT is unchanged and is the board's own order. The `sort` URL
  param is omitted entirely when it is the default, so nothing sorts
  differently unless a user explicitly asks.
- Every alternative sorts on a value already displayed in that row and
  already served by `/api/rankings` (`seasonTotal`, `floor`, `ceiling`) or
  by the user's own saved agreement rating. No new value is derived and
  nothing is recomputed.
- Every comparator falls back to board order on ties, so board order is
  never fully discarded.
- This is NOT the forbidden case. The rule that triggered the revert was
  re-ranking the engine's own recommendation list (trade suggestions
  ordered by title-gain x acceptance). This is a user-initiated lens on a
  reference table of players, which is the core purpose of a board.

Authorised by Andre on 2026-07-25 after the boundary question was raised
explicitly. Franco should still confirm. If he wants it gone, deleting
`SORT_OPTIONS`, `parseSort`, `activeSort` and the switch inside
`visibleRows` in `src/pages/MyBoardPage.tsx` restores the previous single
ordering exactly.

Also on the board: `WeeklyProjectionStrip` renders `board.weekly`, which
`/api/rankings` already returns scoring-adjusted. Bar heights scale to the
player's own peak for display; no weekly value is derived, averaged, or
converted.

---

## 2026-07-25 — Personal rankings removed

Andre's decision: the product will not store or create rankings for users.
Crowdsourced player ranking that feeds Franco's ratings system is the
future direction, and its design is still to come.

Removed from the frontend:

- The model overlay entirely (`ModelOverlayContext` provider detached from
  the app): named ranking sets, per-player point overrides, PRICED ON YOUR
  BOARD, its popover, Reset to Franco, and the Franco baseline row on the
  matchup hero. The overlay is no longer constructed, so the
  `x-olympus-overlay` header is never set and every request is priced on
  Franco's numbers.
- The whole rating surface on the board: the 0 to 100 slider, MY CALLS
  filter and count, YOU up/down chips, rapid-entry keyboard mode, the
  YOUR RATING sheet column, save/pending/recalculating states, and the
  sort-by-your-rating option added earlier the same day.
- `src/utils/myCalls.ts` and its test, `DesignBoardLoopPage` (a fixture
  that existed only to demo the rating loop) and its route, and the dead
  `ProjectionsPage`.

Stored overlays are cleared on boot in `src/main.tsx`. Without this a
returning user who had saved an overlay would still have it in local
storage and no UI left to see or clear it.

NOT touched, deliberately, and left for Franco:

- The `olympus_agreement` Supabase table and any server-side handling of
  agreement scores. No rows are read or written by the frontend now.
- Any server handling of the `x-olympus-overlay` header. The frontend
  simply never sends one.
- `computeLegacyAdjustedValues` still produces the board's value column.
  It reads only board rows, never agreement scores, so it is unaffected by
  this removal and stays quarantined as before. The board header no longer
  claims the value is "adjusted by manager ratings", because it is not.
- The labs-gated Player votes prompt (`?labs=player-votes`) is left in
  place: it is hidden behind a flag and is the crowdsourced-voting
  direction rather than personal rankings. Say the word and it goes too.

---

## 2026-07-25 — Agreement editing restricted to three admins

Crowdsourced ranking is parked for lack of voter volume. The prompt, its
queue and its selection logic stay in the tree behind `PROMPT_ENABLED =
false` in `AppShell.tsx`; nothing triggers them and the board entry point is
gone.

Agreement editing is restored for three accounts only, by email allowlist in
`src/utils/admin.ts`: andrevlahakis@gmail.com, lukejwilliams28@gmail.com,
francocasta200@gmail.com. An ADMIN pill shows in the header for those
accounts. The board card shows the 0 to 100 slider only for them.

How the value travels, all pre-existing server behaviour:

1. The client upserts `{ user_id, position, player, score }` into
   `olympus_agreement`.
2. It pings `POST /api/projections/refresh-adjusted`, which calls
   `invalidateAdjusted()` so the board and pricing recompute in seconds
   rather than waiting for the lazy refresh.
3. `server/projections/adjusted.js` `loadConsensus()` reads the table with NO
   user filter and averages every row per player, then `agreementTilt`
   applies that consensus to per-week means and floor/ceiling. That output is
   described in its own header as "the single source of truth for
   pricing/simulation".

Consequences worth stating plainly:

- Edits are GLOBAL, not personal. A score set by any collaborator moves the
  numbers every user sees.
- Values are AVERAGED across collaborators. If Andre sets 80 and Luke sets
  60 on the same player, the model sees 70. Neither overrides the other.
- Any pre-existing rows from other user ids still count toward that average.
  Franco may want to audit the table for rows outside the three admin ids.

SECURITY LIMIT: the allowlist is a UI gate. It controls what the app renders,
not what the database accepts, so it is not protection. Enforcement needs a
row-level-security policy on `olympus_agreement` restricting writes to those
three user ids. That is server side and Franco's call. Until it exists,
assume any authenticated user could write agreement rows directly.

## 2026-07-26 — Matchup distributions de-nerded (display only)

The three matchup histograms Franco added were rewritten for presentation.
No engine call, no payload field and no number changed. `matchupHistograms`
in `server/engine/engine.js` was not touched, and neither was anything it
calls.

Files touched:

- `src/components/matchup/MatchupDistributions.tsx`
- `src/components/matchup/MatchupDistributions.css`
- `src/dev/designFixtures.ts` (dev-only fixture data, see below)
- `scripts/brand-check.mjs` (added the two component files to TARGETS)

Pixel to field map. Every number on this surface, and nothing else:

| Rendered | Payload field | Transform |
| --- | --- | --- |
| `You win 61 times out of 100.` | `histograms.winProb` | `Math.round(p * 100)`, stated out of 100 instead of as a percent |
| `On average you win by 6.6.` | `histograms.margin.mean` | `toFixed(1)` on the absolute value; the words win/lose/dead heat are sign driven |
| `149.8 on average` | `histograms.you.mean` | `toFixed(1)` |
| `143.1 on average` | `histograms.opponent.mean` | `toFixed(1)` |
| ribbon end labels | `histograms.you.min/max`, `histograms.opponent.min/max` | `toFixed(0)` |
| margin bar heights | `histograms.margin.bins[].density` | scaled to the histogram's own peak |
| ribbon bar heights | `histograms.you/opponent.bins[].density` | scaled to each histogram's own peak |
| `From 5,000 simulations of this week.` | `histograms.sims` | `toLocaleString()` |

Three things were REMOVED from the render, all of them frontend-computed or
noise, none of them replaced by anything invented:

- the `(min + max) / 2` mid-axis label, which was a value computed in the
  component and present in no payload field.
- the raw extreme margins of the sample as axis labels. The margin axis now
  says what the two ends MEAN (`you lose` / `you win`) instead.
- the two score histograms' full height. They are now compact ribbons. They
  still show each side's spread and average, so nothing is hidden, but they
  no longer carry the same weight as the chart that decides something.

Frequency framing (`61 times out of 100` rather than `61% to win`) is a
restatement of the same rounded served probability, not a new statistic. The
displayed integer is exactly `Math.round(histograms.winProb * 100)`, which is
the same number the matchup line shows as `61.4%` before rounding.

Rendering fix worth flagging, because it changed which pixels are green:

The margin bars used to be coloured from each bar's bin centre
(`b.x >= 0 ? win : loss`). One bin always straddles zero, so up to half a bin
of winning margin was painted red, or losing margin painted green, and the
dotted zero line cut through a solid colour block instead of sitting on the
colour boundary. Measured on the design fixture, the zero line sat at x=136.4
while the red-to-green boundary sat at x=140.6, a 4.2 unit error on a 300
unit axis. The bars are now drawn twice under two clip paths that meet
exactly at `xOf(0)`, so the split lands on zero to the pixel. This is a
colouring fix only. Bin values, densities and the win share are unchanged.

FIXTURE DATA, and the reason it exists:

`/design/matchup-live` served no `histograms`, so this module rendered
nowhere reachable without a live authenticated league. It could not be
reviewed or measured. `designFixtures.ts` now builds a `DESIGN_HISTOGRAMS`
constant in the same shape the engine serves, attached to the user's side of
the fixture line in `live` mode only.

That constant is a Gaussian drawn in the fixture file. It is NOT a model and
must never be treated as one:

- it exists only in `src/dev/designFixtures.ts`, which is dev-fixture code.
- the connected path is untouched and always renders the engine's real seeded
  Monte Carlo output.
- its parameters were chosen to agree with the fixture line already in that
  file: means 149.8 and 143.1 match the fixture projections, and a margin of
  6.6 with a spread of 22.77 puts the win share at the 61.4% the same fixture
  line already quotes.

BRAND: these two files were not in `scripts/brand-check.mjs` TARGETS, which
is how the component came to use `#6ea8fe`, `#22c55e` and `#ff6b6b` instead of
tokens. They are in TARGETS now, and the colours are `var(--green)`,
`var(--red)` and neutral greys from `tokens.css`.
