# Build Your Own Rankings — Concept (locked)

_Olympus / Odds Gods. The settled single source of truth. Decisions below are agreed; the tab
layout itself is the next thing to design._

---

## One line

Today Olympus is a book on **Franco's** model. This feature makes it a book on **your** model.
Franco stays in the room as the quiet anchor underneath your number, never over it.

## What it is (and is not)

- **It is "Version B": an in-season model.** The season is running. You are not making draft picks.
  You tell the app which players you rate differently than Franco, and your live book reprices to match.
- **It is not a draft assistant.** Live draft-night pick guidance (who is gone, who is left, your roster
  needs in real time) is a different job and a someday, not now.

## One model, two faces

You build **one model.** It shows up two ways:

1. **The odds (the book).** Your matchup line, trade values, and title odds reprice off your numbers.
2. **The board (the view).** The same model shown as a clean ranked list: your board next to Franco's.

The board is a **view of the one model, not a second product.** Build the model once; render it as odds
and as a board.

## The principle everything obeys: points, not ranks

The engine prices off projected **points**, not order. A rank ("I like A over B") never says *how much*,
so every on-ramp has to resolve to a points adjustment before the engine sees it. Anything that cannot
resolve to a real number is treated as an approximation and badged, never shown as false precision.

## Three things hiding inside the word "rankings" (kept separate on purpose)

1. **Projected points** — Franco's raw output. Feeds the pricing engine. This is the layer the user edits.
2. **Value over replacement** — points above the replacement player at a position. This is "draft-board
   value," and it already exists in the engine (it powers trade value today). Used only to **order an
   overall board** so positional scarcity is respected (no wall of QBs on top).
3. **Your feel** — where you disagree with the math. This is the part that is actually yours.

## Your model is primary; Franco is the quiet anchor

Your numbers **are** the line everywhere. Franco's number does not disappear; it sits alongside as the
small secondary reality check. Keeping it present-but-quiet is the **integrity mechanism**: the visible
drift from Franco ("+3.4 over Franco") is what keeps you honest, without the app bossing you.

## Bounds: none. Drift is the check.

You can move any player anywhere. There is no hard cap. The player's floor and ceiling are the **scale**
on the control, not a cage; drag past them and the line flags **"off-book"** with Franco's number still
shown. (Floor/ceiling are season-long today; they sharpen to per-week when Franco's next update ships.)

## How you build it: anchor on Franco, resolve only the disagreements

You never rank hundreds from scratch. Franco's order **is** the board by default, so there is no blank
page and no onboarding cliff. Untouched = you are running on Franco. The system only ever asks about the
**contested spots**:

- **Flag too-high / too-low** as you browse Franco's board.
- **Rapid-fire pairwise** on close, adjacent players: "Franco has these two basically even; who do you
  like?" Each pick is one cheap tap; a conviction read (slight lean vs. love him) supplies the magnitude.
  A few dozen well-chosen comparisons re-sort the whole list, the way you sort a deck by only comparing
  cards that are actually close.
- **The dial** (the line-setter) for precision on one specific player.

All three resolve to points adjustments under the hood.

## The board view

- Defaults to **by position** (your RBs, your WRs, your QBs), because that is what you use week to week
  and it dodges the "Josh Allen at #2 overall" weirdness.
- Optional **overall list** is ordered by **value over replacement**, so it reads like a real big board.
- Always shows **your board vs Franco's**.

## Persistence

- **Baseline overrides** (season-long, and CSV imports) write the player's baseline.
- **Weekly boost/fade** is an overlay on top that can reset each week.
- Merge order: **Franco → your baseline → your weekly overlay.** (The data model already supports this:
  each projection carries a season `mean` and a per-week `weekly` grid.)

## What "the house" is

**Franco, always, for now.** The check works only if the anchor is one steady outside opinion. When there
is a real crowd, "consensus / the people's line" becomes a **toggle** (compare against Franco | Consensus),
not a replacement.

## Scoring

Points-in inherits the same "priced at [league scoring]" caveat the app already shows via the PPR badge.
Stat-level exact-per-league pricing is a later cost, not MVP.

## Architecture (the build-critical decision)

The engine is **server-side Monte Carlo**, pricing off a single global active projection version and
seeding/caching by `computeInputsHash({ projectionVersion, teams, week })`. Therefore:

- A user's model is a **projection overlay stored per user (Supabase)**, merged into the `projectionMap`
  **before** the engine sims.
- `computeInputsHash` folds in a **layer hash** so each user's adjusted lines cache and stay reproducible.
- **The house line is free:** Franco's number is the existing layer-free global pricing, already cached,
  so showing it as the quiet anchor costs zero extra sims.

## A dedicated tab

This gets its **own tab**, fully dedicated to building and viewing your model. (It also retires the earlier
"Rankings tab is fluff" note from the product audit: this is the real, on-thesis job that tab was missing.)

## Phasing

- **Phase 1 (MVP):** the model + in-flow building (rapid-fire pairwise, too-high/too-low, the dial) →
  reprices the live book, plus the board view. This is the headline.
- **Phase 2:** CSV import for power users (writes the baseline), on the same per-user layer.
- **Later:** consensus / "the people's line"; and, separately, a live draft assistant.

## Franco dependency

Per-week floors/ceilings are coming in Franco's next update. They sharpen the bound scale and enable real
per-week precision. The "your line moved because X" hero repricing waits on that update.

## Why it matters

This flips Olympus from "a book on someone else's projections" to "**my book, my line.**" Stickier (it is
yours), more defensible (nobody else's app is your model), and the natural home for the eventual social
layer: whose read beat the house this week.

## Still to design (next step)

- The **tab layout** itself: how the build flow, the board view, and the live-odds feedback share one screen.
- The exact **conviction → points** mapping.
- How rapid-fire **chooses the pairs** to show.
- The **reset cadence** of the weekly overlay.
