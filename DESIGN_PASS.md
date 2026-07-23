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

## Final Read

- This pass is materially better than baseline.
- The strongest improvements are the Matchup empty-state compaction, the Market composition rhythm, the fixed rail on the League board, and the calmer Futures hierarchy.
- I would ship these surfaces to strangers.
