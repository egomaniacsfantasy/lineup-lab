# Odds Gods: the context that is not in the code

`docs/PRODUCT.md` says what the product does. `DESIGN_RATIONALE.md` says why it
looks that way. `CLAUDE.md` says how to work in the repo. This file is for the
things none of those can hold: who this is for, where it came from, and what
counts as done.

## What it is, in one paragraph

Odds Gods prices your fantasy football league like a sportsbook. Every matchup,
trade and playoff race carries a real line from a Monte Carlo engine:
moneylines, spreads, totals, championship odds, and how they move. No money is
involved anywhere. The sportsbook framing is not a gimmick and not a betting
product; it is the clearest language anyone has invented for making probability
legible, and fantasy managers already speak it.

## Who it is for

Fantasy managers who already think in odds and are badly served by tools that
give them projections and leave the reasoning to them. The bet is that
"you are 58.9% to win, and starting Achane over Corum moves it to 61.3%" beats
"Achane projects 14.6" for the same decision.

## Where it stands

- Live at **oddsgods.net**. Backend on Render, frontend as a separate CDN build.
- Connects **Sleeper and ESPN** leagues. Nothing else is acknowledged.
- Chrome extension (the ESPN connector) is **published, unlisted**.
- iOS app is built with Capacitor and **not submitted**.
- Pre-launch, running in beta with real leagues.
- Next build: an AI coach that answers league questions by calling the engine.
  Tools and safety checks are done (`server/services/coach/`); the model
  wiring and chat UI are not.

`docs/PRODUCT.md` section 8 is the authoritative list of what is still open.
Every other audit file in the repo root is a snapshot from June to August and
has been substantially overtaken; read them for reasoning, not for status.

## Lineage

Bracket Lab came first: a March Madness bracket product that shipped and got
real users. Odds Gods inherits its brand confidence, dark foundation, amber
DNA and serious-math energy. What it deliberately does not inherit is the
cinematic atmosphere, because a bracket is a once-a-year event and this is a
weekly tool that has to favour operational clarity. See `DESIGN_RATIONALE.md`.

<!-- ─────────────────────────────────────────────────────────────────────
     ANDRE: everything below is yours to fill. Nothing in the repo knows
     it, and it is the half that actually shapes marketing advice.
     ───────────────────────────────────────────────────────────────────── -->

## How Bracket Lab got users

TODO. What worked, what it cost, what the numbers were, and what you would
repeat. This is the most useful precedent you have and it exists nowhere.

## Who is in the beta

TODO. How many leagues, who they are, what they have said, what they actually
use versus what they said they wanted.

## What launch means, and when

TODO. Public web launch, App Store, or a season deadline? What has to be true
before you would call it launched?

## Franco

TODO. Who he is, how you split the work, and how decisions get made. `CLAUDE.md`
says not to touch `server/engine/` without saying why or who to ask.

## What you want help with

TODO. Rank them: engineering, product decisions, positioning and copy,
go-to-market. It changes what a session should optimise for.
