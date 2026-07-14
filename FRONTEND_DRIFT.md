# Frontend Drift Check

Prompt: `og-matchup-tab-redesign-pass-2026-07-13`

## Snapshot References

- `/Users/andrevlahakis/Desktop/Screenshot 2026-07-10 at 5.33.12 PM.png`
- `/Users/andrevlahakis/Desktop/Screenshot 2026-07-10 at 2.08.04 PM.png`

## Findings

| Area | Status | Note |
| --- | --- | --- |
| Matchup lineup rows | Fixed | Starter rows now use the slot pill as the source of truth. FLEX rows show `FLX` only, with no real-position repeat on the row. Bench rows keep player position bubbles. |
| Biggest Edge | Fixed | Swap card now presents OUT to IN player units, a visible before-to-after win probability move, and a louder delta. |
| Matchup market rows | Fixed | Trade rows now show explicit You send to You get player units. Waiver rows use the same player-unit treatment. Auto taglines remain removed. |
| Week-lock module | Fixed | The full card is collapsed behind a compact one-line summary and expands on tap. |
| Same-position 1-for-1 trade suggestions | Fixed in display layer | Same-position one-for-one trade lanes are hidden from Matchup market rows and Market Deals lane cards. Manual builder pricing is unchanged. |
| Pricing, engine, API, server | Untouched | No valuation, Monte Carlo, route, or persistence code was changed. No `HANDOFF_NOTES.md` needed. |

## Brand Drift

No new brand-system drift was introduced in this pass. The touched UI keeps the existing cool black, orange accent, green/red semantics, and current type tokens.

## Known Notes

- `FRANCO_TRADE_LOGIC.md` exists locally as an untracked file from a separate thread and was not part of this pass.
- Browser screenshots were not generated in this terminal-only pass; validation was performed through build and lint.

---

Prompt: `odds-gods-league-tab-redesign-2026-07-13`

## League Findings

| Area | Status | Note |
| --- | --- | --- |
| League sub-tabs | Fixed | Settings was already removed from the subview list, but the pill track still used four grid slots. It now sizes to the three live tabs. |
| This week board | Fixed | The ladder and tall per-game cards were replaced with one sportsbook-style board. Your game is pinned first and gets the left-edge treatment. Other games put the favorite on the left. |
| Line movement | Fixed in display layer | Movement chips now share one component and the same 1.0-point threshold. The board chip calls out today's material move only, while Futures uses the same treatment for weekly movement. Expansion shows one closing-line chart for the left team and hides reprice history behind details. |
| Futures order | Fixed | Your futures now render above the league futures board. |
| Futures list and chart | Fixed | Futures now anchor on a column board, with avatars, projected wins, avg seed, playoff percent, price, and material movement chips. The chart defaults to the user's line plus a league envelope, with tap-to-compare from rows. |
| Schedule heat strip | Fixed | The heat strip now acts as week navigation with week and win percentage in each cell. The old difficulty caption was removed. |
| Expected wins pace | Fixed | The preview now shows delta vs .500 pace instead of two cumulative lines. The inspect view uses the same zero-line framing. |
| Schedule live line | Fixed in display layer | The current-week schedule row now prefers the same board line the This week view uses, so the live price stays aligned even if the weekly snapshot lags. |
| Contender Shape | Omitted | The current League page did not expose a separate Contender Shape chart in this component path. Nothing was added. |
| Pricing, engine, API, server | Untouched | No sim, reprice logging, pricing endpoint, futures math, or server code was changed. |

## League Brand Drift

No new brand-system drift was introduced in this pass. The touched UI keeps the current cool black, orange accent, green/red semantics, and existing type tokens.

## League Known Notes

- Browser screenshots are still not attached here. The local app and DINK backend fixture were both reachable on July 14, 2026, but the League surface is auth-gated and the in-app browser session available in this thread did not expose writable `localStorage`, so a signed-in League browser state could not be seeded non-destructively.
- Validation for this continuation pass was performed through build, targeted ESLint on the touched League files, and direct API/bootstrap checks against the documented DINK fixture.
