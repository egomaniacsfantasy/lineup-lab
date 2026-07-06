# Lineup Lab: Fantasy User Audit

Last updated: July 2, 2026

This is the human-readable audit.
The full tracker is still [FEATURE_AUDIT.csv](/Users/andrevlahakis/Documents/lineup-lab/FEATURE_AUDIT.csv), but this file is meant to answer the product questions first:

- Would a real fantasy football manager trust this?
- Where does it feel stronger than the host platforms?
- Where does it still feel weaker or less proven?

## Bottom Line

From a fantasy-football-user perspective, Lineup Lab is now much easier to take seriously than it was at the start of this audit.

The strongest story is:
matchup decisions, lineup comparison, and odds-based framing that gives a manager something more concrete than a normal projections page.

The biggest remaining risk is still trust:
can a user connect a real league cleanly, switch leagues without doubt, and believe that every recommendation is using their live context correctly?

## If I Were the Target User

If I were a Sleeper or ESPN fantasy manager, my reaction today would be:

"This is interesting enough that I would keep testing it, especially for start/sit and matchup framing. But I would still want more proof before I relied on it for my real lineup every week."

That is a meaningful improvement, but it is not yet full product trust.

## What Feels Good Already

- Matchup is the clearest differentiator. The app gives a stronger odds-and-decision story than a plain host-platform matchup screen.
- Compare flows are useful. They feel closer to a real "help me decide" tool instead of a static stats page.
- Draft tools are credible enough to use casually, and the share actions now actually work.
- My Board now behaves more like a persistent tool than a fragile prototype because saved sets, rename, switch, delete, and reload persistence are working.
- Auth errors now sound like consumer-product copy instead of raw backend failure text.
- Signing out now behaves more like a real consumer app instead of leaking the last account's saved league into the next one on the same browser.
- Provider language is much more honest. The app no longer reads like Sleeper-only software pretending to be multi-platform.
- Admin projection history and rollback are now proven with live local API evidence, not just code inspection.

## Biggest Trust Gaps

| Area | What a fantasy user expects | Current Lineup Lab state | Why it matters |
| --- | --- | --- | --- |
| League connection | "I can connect my real league without weird detours or platform confusion." | Better than before, but ESPN and some multi-league cases still need more live proof. | Connection is the first trust moment. If this feels shaky, the rest of the product feels shaky. |
| League switching | "When I change leagues, I should instantly trust that I am looking at the right team and right context." | The core provider/league switching logic is stronger now, but longer end-to-end proof is still limited. | Stale or mixed context is one of the fastest ways to lose a fantasy user. |
| Matchup confidence | "If you show me odds, spread, and swap impact, they need to feel internally consistent." | Much better now, and a real synced Sleeper matchup is proven. But there is still a dangerous fallback path where connected context can collapse into mock data. | This is the app's core value proposition. |
| Trade personalization | "Trade advice should clearly understand my league, my roster, and the other manager." | Still under-proven because the real connected trade workflow has not been fully exercised. | Fantasy users will compare this directly to FantasyPros-style personalized advice. |
| Board-to-lineup impact | "If I move players or flag players on my board, I want to know what that changes downstream." | Board editing is now much stronger and real flag persistence is proven, but the downstream pricing loop still needs cleaner proof because the app fell into a mock matchup state during one connected retest. | Without that loop, the board risks feeling separate from the real decision engine. |
| Season details | "Weekly and season views should match what I expect from my host app." | Core season page is solid, but connected detail-state proof is still incomplete. | Season confidence matters if the app wants to be more than a one-off matchup toy. |
## What I Cross-Referenced Against

I am not judging this like a generic web app.
I am judging it against what fantasy users already think is normal.

- Sleeper:
  fast league context, active lineup management, and low-friction fantasy workflows
- ESPN:
  polished matchup presentation, cleaner league-aware navigation, and obvious handoffs
- Yahoo:
  simple matchup comparison and clear week-to-week navigation
- FantasyPros:
  personalized start/sit and trade advice tied to an imported real roster

That does not mean Lineup Lab should copy those products.
It means those products define the baseline trust and usability expectations.

## Concrete User-Facing Fixes Already Landed

- Matchup preview mode now behaves like a real preview state and resets reliably.
- Percent-mode matchup odds now match the displayed hero framing instead of showing awkward raw precision.
- Broken invalid-league recovery now routes users back to a provider chooser instead of forcing a Sleeper-only reconnect path.
- Multi-provider copy was cleaned up across onboarding, connect, matchup, league, and More surfaces.
- Draft share, draft wrapped share, and recap share now do something real instead of acting like decorative buttons.
- Recap dismissal now sticks after reload.
- My Board now loads without requiring a healthy league bootstrap and uses league-neutral fallback assumptions.
- My Board saved sets now behave like a real persistent feature.
- My Board flag controls now exist in the UI, mark rows visually, and persist after reload on a real connected league.
- Rapid fire no longer replays the same pair deck when a user asks for a fresh slate.
- ESPN users on matchup now get a real outbound "make it official" handoff instead of dead text.
- Projection import and rollback now have live local API proof behind them.
- Sleeper confirm-step back behavior is now proven with a real multi-league user instead of only code inspection.
- The no-league shell now shows a real Connect-only navigation state instead of teasing locked tabs.
- Signing out now clears account-scoped local state, so a brand-new account no longer inherits the prior account's connected league.

## Still Needs Better Live Proof

- Real connected trade workflows
- Real ESPN connection fixtures
- Longer multi-league switching proof
- Cleaner signed-in proof that My Board edits flow into live lineup pricing the way a user would expect
- Connected season modal/detail states

## Platform Expectation Anchors

These are the outside references I used to keep the audit grounded in actual fantasy-user expectations:

- Sleeper Support Center, April 30, 2026:
  [Intro to Sleeper Fantasy Football](https://support.sleeper.com/en/articles/1876010-intro-to-sleeper-fantasy-football)
- ESPN Press Room, August 7, 2025:
  [ESPN Fantasy Football 30th Anniversary: New Design, New Features, All-New Fantasy App for 2025!](https://espnpressroom.com/us/press-releases/2025/08/espn-fantasy-football-30th-anniversary-new-design-new-features-all-new-fantasy-app-for-2025/)
- Yahoo Help:
  [Get started with the Matchup tab in Fantasy Football](https://help.yahoo.com/kb/SLN26266.html)
- FantasyPros:
  [Fantasy Football Tools](https://www.fantasypros.com/fantasy-football-tools/)
  [Start/Sit Assistant](https://www.fantasypros.com/nfl/myplaybook/start-sit-assistant.php)
  [Trade Analyzer](https://www.fantasypros.com/nfl/myplaybook/trade-analyzer.php)

I used these to answer one product question:

"What already feels normal to fantasy users, and where does Lineup Lab still feel less trustworthy or less complete?"

## Evidence Snapshot

- `npm run build`: passes
- `npm run lint`: passes
- Current tracker counts:
  - `35 pass`
  - `7 partial`
  - `12 blocked`
- Browser caveat:
  the only available browser session for this pass was a clean signed-out in-app browser, so signed-in proof is still called out explicitly where it is missing.
