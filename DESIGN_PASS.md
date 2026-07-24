# Design Pass

Date: July 22, 2026

## Harness

- Added `npm run design:shots`
- Captured fixture states for Matchup, Market, League This week, Futures, and Schedule
- Shot sets:
  - Baseline: `artifacts/design-shots/baseline`
  - Loop 1: `artifacts/design-shots/loop1`
  - Loop 2: `artifacts/design-shots/loop2`

## Matchup

### Before

![Matchup empty before](artifacts/design-shots/baseline/matchup-empty.png)

Critique:

- The engine was returning a good answer, but the page staged it like a missing-state error.
- Two separate empty cards created a lot of dead black space and made "optimal" feel like "nothing happened."
- The market rows in the populated state had the right data but not the right scan path. The acceptance/value rail and rationale area felt bolted on.

### Loop 1

![Matchup loop 1](artifacts/design-shots/loop1/matchup-live-expanded.png)

Critique:

- Compacting the dual empty state into one strip immediately fixed the worst issue.
- The market digest got a cleaner left-to-right scan, but the card still felt a little boxy and over-outlined.
- Biggest edge became easier to parse, but it still relies on the existing data shape and should not be pushed into invented analysis copy.

### Loop 2

![Matchup empty after](artifacts/design-shots/loop2/matchup-empty.png)

What changed:

- When both suggestion modules are empty, they collapse into one confident confirmation strip with the as-of stamp intact.
- Trade digest rows now use the shared trade primitives so "You send", "You get", value, and acceptance sit in stable places.
- Dismiss affordance is present without shouting all the time.

Ship call:

- Yes. The empty state now reads like the book confirming the user is sharp, not like the app ran out of content.

## Market

### Before

![Market before](artifacts/design-shots/baseline/market-default.png)

Critique:

- The page had pieces, not composition.
- Finder, filters, result cards, and builder all had roughly the same visual weight, so nothing led.
- The untouched builder felt like a giant form you were already supposed to be filling out.

### Loop 1

![Market loop 1](artifacts/design-shots/loop1/market-default.png)

Critique:

- The top module got rhythm back: one header block, one filter block, one result rhythm.
- The builder still felt too loud when idle. The right-side void especially looked like unfinished UI.

### Loop 2

![Market after](artifacts/design-shots/loop2/market-default.png)

What changed:

- Finder module now owns the page opening and the filter row feels like one composed control bank.
- Shared trade cards brought the results into a steadier scan pattern.
- The idle builder now stays quiet until engaged. The partner side becomes a controlled prompt instead of a dead empty panel.

Ship call:

- Yes, with one caveat: if a later pass touches the verdict hero, it should preserve the new page rhythm. The page no longer feels glitchy or duplicated.

## League This Week

### Before

![League board before](artifacts/design-shots/baseline/league-board.png)

Critique:

- The inline `YOUR GAME` chip was visually louder than it should be and made row alignment feel custom for that one case.
- Row-to-row comparison matters more here than individual decoration, so any horizontal shift is a product bug, not a style preference.

### Loop 1

![League board after](artifacts/design-shots/loop1/league-board.png)

Critique:

- Fixed rail width solved the alignment problem.
- Subtle tint plus the existing left-edge accent did enough to distinguish the user's game without breaking the row grid.

### Loop 2

![League board expanded after](artifacts/design-shots/loop1/league-board-expanded.png)

What changed:

- Added a fixed chip rail on desktop and tablet widths so chip presence never changes column alignment.
- Quieted the `YOUR GAME` treatment into the board language instead of letting it act like a sticker on top of the layout.

Ship call:

- Yes. The rail is now a rule, not a hope.

### Board Row Surgical Fix (July 23, 2026)

Before:

![Board row collision before](artifacts/design-shots/board-row-fix/before-collision-1512.png)
![Board row truncation before](artifacts/design-shots/board-row-fix/before-truncation-1512.png)

Critique:

- The user's row proved the old rail was not real. The opponent avatar was winning a space fight with `YOUR GAME`, which means the row still depended on incidental overflow behavior instead of reserved columns.
- The long-name stress case showed the right lockup tightening first even while the left side still had room, so the row was not giving both teams equal claim on the board width.

After:

![Board row collision after](artifacts/design-shots/board-row-fix/after-collision-1512.png)
![Board row truncation after](artifacts/design-shots/board-row-fix/after-truncation-1512.png)

What changed:

- Rebuilt the row as one explicit grid: equal `minmax(0, 1fr)` team lockups, separate price and probability columns, a fixed 180px win bar, and a fixed 168px chip rail.
- Kept the avatar inside the right lockup where it belongs. The rail now owns only `YOUR GAME` and the movement chip, so there is no way for the avatar to render on top of the pill.
- Added title tooltips on both team names and verified the stress row at 1512px and 1280px: the left and right lockups now resolve to the same width, and `"FantasyGodCasta's Team"` fits without ellipsis in the available space.

Ship call:

- Yes. This is the first version of the row that behaves like a board row instead of a special case.

## Futures

### Before

![Futures before](artifacts/design-shots/baseline/league-futures.png)

Critique:

- The movement pills were stealing attention from the actual prices.
- `TITLE ODDS, CLOSING LINE` asked the user to decode jargon before they could read the chart.
- The chart had no obvious "this is your line" anchor at first glance.

### Loop 1

![Futures loop 1](artifacts/design-shots/loop1/league-futures.png)

Critique:

- Demoting movement into quiet text immediately fixed the board hierarchy.
- The chart title and caption were clearer, but the user's current line still needed stronger endpoint anchoring.

### Loop 2

![Futures after](artifacts/design-shots/loop2/league-futures.png)

What changed:

- Movement is now seasoning. The price remains the loudest element in every futures row.
- The chart title is plain language: `Your title odds, day by day`.
- The user's current line is labeled at the endpoint with team identity and current price.

Ship call:

- Yes. This is the first version of the chart in this repo that reads correctly on a first pass instead of after explanation.

## Schedule

### After Check

![Schedule check](artifacts/design-shots/loop1/league-schedule.png)

Critique:

- This surface did not need a redesign pass as badly as the four targets above.
- It still benefits from the shared spacing and chart cleanup around it, and it no longer looks out of family.

## Files Touched

- `scripts/design-shots.mjs`
- `src/dev/designFixtures.ts`
- `src/pages/DesignFixturePage.tsx`
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
- `src/pages/DesignBoardRowPage.tsx`
- `test/matchupSlateBoardRowRegression.test.mjs`

## Final Read

- This pass is materially better than baseline.
- The strongest improvements are the Matchup empty-state compaction, the Market composition rhythm, the fixed rail on the League board, and the calmer Futures hierarchy.
- I would ship these surfaces to strangers.

---

## Chart Bible + Board v2 (July 24, 2026)

### Futures chart, loop 1

![Futures chart loop 1](artifacts/design-shots/chart-bible-loop1/league-futures.png)

Critique:

- The new chart system was working, but the default Season view still made the line read flatter than it needed to for a first look.
- The comparison capture was not even proving the comparison state machine yet, which meant the screenshots were not honest enough to ship from.
- The footer and endpoint labeling were mechanically correct, but the chart still felt more "component demo" than "market surface."

### Futures chart, loop 2

![Futures chart loop 2](artifacts/design-shots/chart-bible-loop2/league-futures.png)
![Futures comparison loop 2](artifacts/design-shots/chart-bible-loop2/league-futures-compare.png)

Critique:

- Defaulting to the Month view made the history immediately legible without lying about the values.
- The comparison state was finally visible, but the compare code was crowding the hero endpoint when the two lines finished near each other.
- The surface was close, but not calm enough yet at the chart endpoint.

### Futures chart, loop 3

![Futures chart loop 3](artifacts/design-shots/chart-bible-loop3/league-futures.png)
![Futures comparison loop 3](artifacts/design-shots/chart-bible-loop3/league-futures-compare.png)

What changed:

- Rebuilt the Futures chart on the shared scrubber system: header-as-tooltip, snapped real points, step rendering, endpoint gutter, live delta chip, and range pills.
- Fixed the comparison state machine so only one comparison line is ever active, the takeaway only names the drawn line, and switching markets clears stale compare state.
- Kept the gray league envelope quiet and the orange hero line loud, which finally gives the chart a real visual hierarchy.

Ship call:

- Yes. This is the first Futures chart in the repo that feels like a live market chart instead of a historical diagram.

### League board v2

![League board loop 1](artifacts/design-shots/chart-bible-loop1/league-board.png)
![League board loop 2](artifacts/design-shots/chart-bible-loop2/league-board.png)
![League board loop 3](artifacts/design-shots/chart-bible-loop3/league-board.png)

Critique:

- Loop 1 proved the structural idea: one hairline board plus a docked rail fixed the old empty-page problem immediately.
- Loop 2 showed the remaining weakness clearly. The drill-in rail was still too cramped, and the board rows were not giving the right-side team stack enough breathing room.
- Loop 3 tightened the fixed columns, widened the rail, and removed the old `YOUR GAME` pill entirely. The orange left edge and row tint carry the state without adding another widget.

What changed:

- Rebuilt the board as one continuous surface with fixed price and win-percentage columns and flexible team stacks.
- Added the right-column rail on wide viewports with payload-backed glance cards plus the selected game's drill-in chart docked open by default.
- Replaced inline row expansion with row selection, which reads closer to an actual board-to-drill-in flow.

Ship call:

- Yes, with one honest caveat: the fixture only has three games, so the page still shows a lot of empty black below the board. The structure is right; the demo volume is what makes it feel sparse.

### Schedule pace

![Schedule pace loop 3](artifacts/design-shots/chart-bible-loop3/league-schedule.png)

Critique:

- The first loop exposed the worst mistake immediately: the pace chart was still speaking percentage on the y-axis, which made the whole chart feel fake.
- Recasting the axis, ticks, and scrub labels in wins fixed the trust problem.

What changed:

- Moved the pace surface onto the same shared scrubber system as Futures and the board drill-in.
- Kept the zero line as the semantic anchor and reserved green and red for above and below zero only.
- Removed the old inspect-card behavior so the pace chart now reads as a first-class chart, not a preview that still needs another click.

Ship call:

- Yes. It now reads as a pace chart in wins, not as a recycled probability sparkline.

---

## Board + Sheet Merge (July 24, 2026)

### Board view, loop 1

![Board merge loop 1](artifacts/design-shots/board-merge-loop1/board-expanded.png)

Critique:

- The merge itself was real, which mattered more than polish at this stage, but the expanded player card still felt too much like a utility slab inside a decent board row.
- The first loop also exposed the payload join bug immediately: the stat strip was blank for players who absolutely should have had season stat detail, which meant the new surface was not honestly wired yet.
- The row rhythm was strong enough to keep, but the card was still more "form + boxes" than premium board detail.

### Board view, loop 2

![Board merge loop 2](artifacts/design-shots/board-merge-loop2/board-expanded.png)

What changed:

- Fixed the Board-to-Projections join by falling back from player id to exact `position + name` when the two payloads identify the same player differently.
- Kept the board row itself quiet and scan-first, while the expand card now carries real stat pills, a real next-opponent line, and the friendly rating slider.
- Preserved the one loud number rule: adjusted value still dominates, and the rest of the card supports it instead of competing with it.

Ship call:

- Yes. The card is still denser than a marketing surface, but it now reads like a serious fantasy board detail panel instead of an exposed tool panel.

### Sheet view, loop 1

![Sheet merge loop 1](artifacts/design-shots/board-merge-loop1/board-sheet.png)

Critique:

- This was a productive failure. The screenshot being stuck on `Loading Board…` proved the harness was not actually waiting for the Sheet surface, so any claim that the merge had been reviewed would have been dishonest.
- The route itself was fine; the capture contract was wrong.

### Sheet view, loop 2

![Sheet merge loop 2](artifacts/design-shots/board-merge-loop2/board-sheet.png)

What changed:

- Updated the harness to wait for the Sheet table itself instead of sleeping and hoping the route would be ready.
- The Sheet now reads like a tamed spreadsheet: one sticky player column, one core numeric rhythm, presets instead of checkbox soup, and the rapid-entry affordance pushed into its rightful power-user corner.
- Added the `pick a position above` note for non-simple presets when `Overall` is active, so the table is explicit about why position stats are not shown yet.

Ship call:

- Yes. It now behaves like a serious companion view to the Board, not like the old Projections tab dropped unchanged into a new route.
