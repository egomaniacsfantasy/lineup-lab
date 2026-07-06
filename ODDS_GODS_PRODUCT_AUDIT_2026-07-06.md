# Odds Gods Whole-Product Audit

Date: July 6, 2026

Perspective: a new fantasy football user opening the current connected app, then comparing the experience against the fantasy tools users already know: Sleeper, ESPN, Yahoo, and FantasyPros.

Evidence used:
- Local connected app render at `http://localhost:8799` for Matchup, Season, Trade, My Board, Projections, League, and More.
- Current source in `src/App.tsx`, `src/components/layout/AppHeader.tsx`, `src/pages/MatchupPage.tsx`, `src/pages/MyBoardPage.tsx`, `src/pages/ProjectionsPage.tsx`, and related CSS.
- Existing docs: `PRODUCT_AUDIT.md`, `FANTASY_USER_AUDIT.md`, `DESIGN_RATIONALE.md`, `FEATURE_AUDIT.csv`.
- Competitive references: Sleeper support, Yahoo Matchup help, ESPN Fantasy app refresh, FantasyPros tools/My Playbook.

## Executive Read

Odds Gods has a real product hiding inside a crowded app shell.

The core idea still works: price my league like a sportsbook so I can make better fantasy decisions. The best screens prove there is something here that ESPN, Sleeper, Yahoo, and FantasyPros do not quite do: they show standings, projections, matchups, advice, and player tools; Odds Gods can show how a decision moves my actual chance to win this week or win the league.

The problem is not the math. The problem is trust and restraint.

Right now the app asks the user to absorb too many tabs, too many helper buttons, too much explanatory copy, too many brand words, and too many near-duplicate actions before the core magic gets a clean stage. It feels like a powerful prototype that is narrating itself too much.

The strongest immediate direction:

1. Rename the app fully to Odds Gods and remove Olympus from user-facing product UI.
2. Collapse the top navigation into fewer primary surfaces.
3. Make Matchup the product center, but simplify the start/sit interface dramatically.
4. Replace verbose/explanatory copy with terse, sportsbook-native action labels.
5. Treat loading, stale models, and missing projections as trust events, not empty states.
6. Make My Board feel like a model state manager, not a content page explaining itself.

## New-User Feeling

### What Makes Sense

The app's main promise lands quickly once the user reaches Matchup:

- I can see my matchup priced as odds, spread, total, and win probability.
- I can see one recommended lineup edge.
- I can tap players and compare start/sit decisions.
- I can preview a lineup change and watch the matchup reprice.

That is strong. A fantasy manager understands the pain immediately: "I have five annoying start/sit calls, and projections alone do not tell me the answer." Odds Gods gives a more concrete answer than "Player A projects for 14.7 and Player B projects for 13.2."

The League page also makes conceptual sense. A full league market is a good expansion of the idea: not just "how is my team doing," but "what does the book think of everyone?"

The Projections page makes sense as an admin/editor power tool. It should probably not be a main fantasy-user tab.

### What Does Not Make Sense

The shell is overwhelming before the user even decides anything.

On a connected render, the desktop header contains:

- Brand: `ODDS GODS` plus `OLYMPUS`
- Primary nav: `Matchup`, `Season`, `Trade`, `My Board`, `Projections`, `League`, `More`
- Help: `How this works`
- State/status: `Week 1`, `Synced`, `PPR`, `%`
- Account/team menu
- The same nav also appears in the bottom tab bar DOM

For a new user, this feels less like a confident app and more like a control panel. Sleeper and Yahoo are dense too, but they anchor around familiar league actions. Odds Gods has a newer mental model, so it needs fewer first-level choices, not more.

The product also uses too many names:

- `Odds Gods`
- `Olympus`
- `Lineup Lab`
- `My Board`
- `Your model`
- `Franco`
- `Projections`

Some of those are internal concepts, but they are visible enough that the user has to form a taxonomy in their head. That is unnecessary friction.

## Signed-Out / Onboarding Audit

The signed-out front door has the right thesis, but it suffers from the same naming split as the app shell.

Observed:

- The landing kicker says `Odds Gods`.
- The main wordmark says `OLYMPUS`.
- The connect page says `Welcome to Olympus`.
- The welcome modal says `Welcome to Olympus`.

This makes the product feel less settled than it is. A new user should not have to infer whether Odds Gods is the company, the app, the model, or the parent brand.

Recommended direction:

- Landing wordmark: `Odds Gods`
- Landing thesis: keep the sportsbook-for-fantasy explanation.
- Connect page kicker: remove or change to `Odds Gods`
- Welcome modal: if it remains, make it shorter and product-specific.

The landing preview is useful because it shows odds immediately. Keep that. But once the user creates an account, the first in-app help should not be a modal full of product explanation unless the user asks for it. The app already has a new mental model; forcing a modal on top of the first real screen adds one more thing to dismiss.

Recommended onboarding:

- First visit after connect: land on Matchup.
- Show one small inline hint near the lineup: `Tap two players to compare`.
- Put the bigger explanation behind Help or More.

## Mobile Navigation Audit

Connected mobile currently has seven bottom tabs:

`Matchup`, `Season`, `Trade`, `My Board`, `Projections`, `League`, `More`

That is too many. It will make labels tiny, targets cramped, and the product feel broader than it is. Mobile fantasy apps can be dense, but they work because the main destinations are familiar and repeated constantly. Odds Gods has a more novel concept, so the bottom nav should be calmer.

Verified at a 390px-wide local viewport:

- Matchup bottom tabs: `Matchup`, `Season`, `Trade`, `My Board`, `Projections`, `League`, `More`
- My Board bottom tabs: same seven items
- Projections bottom tabs: same seven items
- The visible header text stream still includes `ODDS GODS`, `OLYMPUS`, all seven nav labels, `How this works`, `Week 1`, `Synced`, `PPR`, `%`, and the account/team button.

Even if CSS visually compresses some of this better than text extraction suggests, the IA is doing too much work at phone width. The product should not ask a mobile user to choose among seven top-level destinations before they understand the core promise.

Recommended mobile nav:

`Matchup`, `League`, `Trade`, `Board`, `More`

Move:

- `Season` into `League`
- `Projections` into `More` or admin

The current bottom bar also duplicates desktop nav in DOM, which is fine technically because desktop hides it, but product-wise it means the same information architecture problem exists on both breakpoints.

## P0 Trust Issues

### 1. Hide Provisional Pricing Until It Is Real

Observed on first local render:

- Matchup briefly showed a flat `50.0%` vs `50.0%`
- Both teams showed `Proj 100.0 pts`
- Every player row showed `0.0`

This is exactly the kind of moment that makes odds feel fake. A fantasy user can forgive a loading spinner. They will not forgive a fake-looking line.

Recommended behavior:

- If matchup/player projections are not hydrated, show a loading market state.
- Do not render odds, spreads, totals, player projections, or lineup recommendations until the needed projection set is present.
- If partial data exists, show a compact reduced-confidence notice and hide recommendation modules that depend on missing inputs.

Copy direction:

- Good: `Pricing your league...`
- Good: `Waiting on projections for 1 starter`
- Avoid: rendering `+100`, `50.0%`, or `0.0` as if they are real.

### 2. Remove Olympus From User-Facing UI

The user has already named the direction: this is Odds Gods.

Current user-facing leftovers:

- Document title: `Olympus - Odds Gods`
- Header brand: `ODDS GODS / OLYMPUS`
- Hidden headings: `The Olympus matchup screen`
- Welcome/connect copy: `Welcome to Olympus`
- Season/draft titles: `Olympus draft wrapped`, `Olympus draft slot odds`
- ESPN connector copy: `Olympus extension`, `Olympus connector`
- Server/source labels: `Olympus model`
- Docs and CSV still use Olympus heavily

Recommendation:

- Public product name: `Odds Gods`
- Internal/service name can remain `olympus` in code temporarily if changing infra is risky.
- User-facing model name should not be `Olympus model`; use `Odds Gods model`, `Default model`, or `Franco baseline` depending on context.

This is not just cosmetic. Brand ambiguity makes the product feel less real.

### 3. Simplify Primary Navigation

Current primary tabs:

`Matchup`, `Season`, `Trade`, `My Board`, `Projections`, `League`, `More`

Recommended primary nav:

`Matchup`, `League`, `Trade`, `Board`, `More`

Move out of primary nav:

- `Season` folds into `League` as a subview: league market, schedule, futures.
- `Projections` moves to `More` or admin-only.
- `How this works` moves into a small help affordance inside account/menu or first-run onboarding.
- Scoring format can stay as status, but not as a prominent pill if it competes with actions.

Why:

- Sleeper emphasizes league/team workflows and chat, not seven abstract product sections.
- Yahoo's matchup affordance is simple: week navigation, projected/actual points, side-by-side roster comparison.
- FantasyPros has many tools, but its My Playbook pitch organizes them around imported-team advice.

Odds Gods has a more unfamiliar concept than those products. It should make fewer top-level promises.

## Matchup Audit

### What Works

The matchup page is still the flagship.

Best current pieces:

- The odds board is differentiated.
- Biggest Edge is conceptually strong.
- Lineup row taps now work.
- Real swaps can reprice the matchup.
- The "reduced confidence" notice is honest when projection data is missing.

### What Feels Cluttered

Current Matchup has too many competing action layers:

- Biggest Edge card has `Inspect why`, `Preview the swap`, and `Make it official in Sleeper`.
- Lineup header says `Tap any player: who do I start?`
- There is also a `Who do I start?` button.
- Individual starter rows can show `Best swap: K. Williams`, odds movement, projection, and a separate `Start K. Williams` button.
- Bench rows show `Best fit`, odds movement, and projection.

The intent is right: make swap affordances obvious. But visually it becomes a stack of instructions and duplicate calls to action.

### Recommended Start/Sit Redesign

Remove the `Who do I start?` button if every row is tappable.

Replace row-level `Start K. Williams` text buttons with a smaller, more market-like affordance:

- A compact right-side chip: `+2.8%`
- A swap icon or short label: `Swap`
- On hover/focus: show `Start K. Williams`
- On tap: open the same verdict sheet

Row structure should be:

- Left: slot, player, team/opponent/status
- Middle: projection and role
- Right: best available swing, if any

Example:

`RB J. Love ARI   12.8   Best: K. Williams +2.8%`

No full sentence needed. The user can tap for detail.

### Copy Cleanup

Current text that should change:

- `Preview the swap`
- `Make it official in Sleeper`
- `Tap any player: who do I start?`
- `Who do I start?`
- `Start K. Williams`

Suggested replacements:

- `Preview`
- `Open Sleeper`
- `Tap two players to compare`
- Remove redundant button
- `Swap` or a `+X%` chip

The product should sound like a book, not a coach trying to hype up the user.

## My Board Audit

### The Core Problem

My Board is currently doing two jobs:

1. It is a personal model editor.
2. It is also explaining what a personal model editor is.

Current body copy:

`This is your board to edit, not a printout. Tap any player to set your own number, or run Rapid fire to build it fast. Your matchup and season odds price off it, with Franco as the anchor.`

This should go. The user already called it accurately: it reads like generated product copy.

### Recommended Copy

Shorter:

`Your board drives matchup, season, and trade pricing.`

Even better: make it a status row instead of prose:

- `Pricing model: Your board`
- `Baseline: Franco 2026-06-12`
- `Last edited: 3 weeks ago`
- `Impact: Used in matchup, season, trade`

### Stale Model Problem

The note about coming back after three weeks is important. If a user changed rankings weeks ago and forgot, `Your model` can become dangerous. It sounds current and intentional even when it is stale.

Recommended behavior:

- If model edits are older than 14 days, show a re-entry prompt:
  - `Use your saved board?`
  - `Continue with saved board`
  - `Use Franco baseline`
  - `Review changes`
- Show last edited time beside the model label.
- If multiple boards exist, show which board is active by name, not just `Your model`.

### Should Multiple Ranking Sets Exist?

For most users: probably no, not as a first-class feature.

Multiple saved boards create mental overhead:

- Which board is pricing my matchup?
- Did I mean to use this one?
- Are these overrides stale?
- Why does the app say `Your model` if I have multiple?

Recommended approach:

- Default user: one active board plus reset/revert.
- Power user: multiple boards hidden behind `Manage boards`.
- Make the active board unmissable anywhere pricing is affected.

### Kill the Pulsing Light

If the UI has a pulsing indicator beside `Your model`, remove it or make it static. Pulsing status lights read as decorative AI-era noise unless they indicate live activity.

Use static labels:

- `Active`
- `Edited`
- `Stale`
- `Baseline`

## Trade Audit

### What Works

The trade builder has the right bones:

- Your side vs their side.
- Partner selection.
- Full roster asset picking.
- Manager scouting controls.
- Pricing verdict.

The product has a real moat if it can say "this trade is bad for you" and explain why in lineup/title odds terms.

### What Feels Heavy

The current Trade page opens into a dense builder immediately:

- Long roster lists.
- Manager dropdown.
- Negotiator/deal appetite/fandom controls.
- Price button.

For a new user, it asks for too much setup before giving value.

Recommended first screen:

- `Price a trade` manual builder
- `Find a deal` suggestions, only if reliable
- `Trade targets` based on actual roster needs

The scouting controls should be secondary. They are interesting, but they feel like advanced settings before the user has gotten a first useful verdict.

## Season / League Audit

Season and League are currently split, but conceptually they overlap:

- Season: my futures, projected record, schedule.
- League: league futures, weekly board, settings.

A user likely thinks of these as one area: "the league market."

Recommendation:

- Merge Season into League.
- League page subviews:
  - `This week`
  - `Futures`
  - `Schedule`
  - `Settings`

The current Season schedule is scannable, but it is static. It needs movement:

- What changed since last sync?
- Which upcoming week is the biggest swing?
- Why did title odds move?

## Projections Audit

Projections is useful, but it is not a normal user tab.

It looks like an admin/operator screen:

- 415 players.
- Raw stat columns.
- Editor agreement columns.
- Admin password edit flow.

Recommendation:

- Move Projections out of primary nav.
- Put it under `More` or behind admin access.
- Keep it fast and dense; do not over-design it.

Recent rapid-entry work is directionally good for operators, but it reinforces that this page is not part of the main fantasy manager journey.

## More Page Audit

More currently explains the IA:

`Matchup, season, trade, and league stay in the main tab bar. Draft and rankings live here.`

This is another place where the app is narrating its structure. Users should not need the app to explain why its tabs are arranged a certain way.

Recommendation:

- Replace explanatory copy with grouped destinations.
- Keep Account, League connection, Draft tools, Admin/Projections.
- Remove the meta-commentary.

## Language Rules

Odds Gods should use terse product language.

Use:

- `Preview`
- `Compare`
- `Swap`
- `Open Sleeper`
- `Use baseline`
- `Use saved board`
- `Stale board`
- `Reduced confidence`
- `Pricing...`

Avoid:

- `Make it official`
- `This is your board to edit, not a printout`
- `Fortune favors the bold`
- `Who do I start?` as a repeated UI label
- Anything that sounds like the app is explaining itself in a paragraph

The app should feel like a sharp betting terminal for fantasy decisions, not a landing page.

## Competitive Notes

### Sleeper

Sleeper is strong because it is a fast league utility with communication woven in. Its support docs emphasize communication and league activity as part of fantasy itself. It also has features like waiver countdowns that create league moments.

Implication for Odds Gods:

- Do not try to out-Sleeper Sleeper as the league home.
- Win by pricing decisions Sleeper does not price.
- Use fewer tabs and faster in-context actions.

Sources:
- https://support.sleeper.com/en/articles/1876010-intro-to-sleeper-fantasy-football
- https://support.sleeper.com/en/articles/1951583-what-are-sleeper-s-unique-features

### Yahoo

Yahoo's Matchup tab expectation is simple: previous/future weeks, projected and actual points, side-by-side rosters, and other league matchups.

Implication for Odds Gods:

- Users expect matchup navigation and comparison to be obvious.
- Odds Gods can add pricing, but it should not make the baseline matchup harder to parse.

Source:
- https://help.yahoo.com/kb/SLN26266.html

### ESPN

ESPN's recent fantasy refresh emphasizes a redesigned app and richer live projections. ESPN has scale and polish, but it also carries sportsbook adjacency through ESPN BET.

Implication for Odds Gods:

- Live/projection freshness is table stakes.
- The trust angle is that Odds Gods is advising the fantasy manager, not pushing a bet.

Source:
- https://espnpressroom.com/us/press-releases/2025/08/espn-fantasy-football-30th-anniversary-new-design-new-features-all-new-fantasy-app-for-2025/

### FantasyPros

FantasyPros already owns the imported-roster advice mental model: start/sit, waiver, trade analyzer, dashboard, multi-league tooling.

Implication for Odds Gods:

- "Personalized advice" is not enough by itself.
- The differentiator must be decision pricing: win probability, title odds, and line movement.

Sources:
- https://www.fantasypros.com/fantasy-football-tools/
- https://www.fantasypros.com/nfl/myplaybook/start-sit-assistant.php
- https://www.fantasypros.com/nfl/myplaybook/trade-analyzer.php

## Prioritized Fix List

### P0: Trust And Clarity

1. Hide provisional +100/50-50/0.0 states behind loading or reduced-confidence shells.
2. Remove `Olympus` from all user-facing UI and browser titles.
3. Simplify desktop top nav to five primary items.
4. Remove duplicate `Who do I start?` button from Matchup.
5. Replace `Make it official in Sleeper` and `Preview the swap` with shorter action labels.
6. Add stale-model handling for My Board.

### P1: Main Workflow Polish

1. Redesign lineup row actions so `Start K. Williams` becomes a compact swap/swing affordance.
2. Merge Season into League or at least make them feel like one market area.
3. Move Projections out of primary nav.
4. Replace My Board explanatory prose with model status metadata.
5. Make trade builder start with a simpler first choice: price a trade, find a deal, or find targets.

### P2: Differentiation

1. Add line movement history to Matchup and League.
2. Add reasons for line movement.
3. Add post-week "what was luck vs decision quality" recap.
4. Add multi-league exposure once the core single-league UX is calmer.

## Suggested Next Implementation Batch

This is the first batch I would actually build:

1. Brand cleanup: change user-facing `Olympus` to `Odds Gods`.
2. Header cleanup: remove `Projections` from primary nav, move `How this works` into More/account, and collapse Season into League or remove one from nav.
3. Matchup copy cleanup: remove redundant start/sit button; rename `Preview the swap` to `Preview`; rename `Make it official in Sleeper` to `Open Sleeper`.
4. Loading trust: suppress flat 50/50 and 0.0 player states until projections are ready.
5. My Board copy/status cleanup: replace paragraph copy with active model, baseline, last edited, and reset/review actions.

This batch would make the product feel less like a prototype without touching the pricing engine.
