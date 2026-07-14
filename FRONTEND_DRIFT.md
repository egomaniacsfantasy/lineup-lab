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

---

Prompt: `Codex prompt — Fire-back after live stress test (2026-07-14)`

## Fire-back Findings

| Area | Status | Note |
| --- | --- | --- |
| Acceptance band map | Fixed | The shared acceptance table now lives in one place only: `src/utils/acceptanceLingo.ts`. Bands now match the approved table exactly, and every label resolves from the same rounded percent that is displayed. |
| Acceptance display surfaces | Fixed | Matchup rows, Market lane cards, and rationale copy now all render the rounded read consistently, for example `57% · Likely`. Suggestion gauges no longer duplicate the number inside the fill. |
| Waiver claim row identity | Fixed | Claim rows now resolve the player name and position from the league catalog when available, and fall back to the mover headline and detail copy when the catalog is missing the player. This prevents `P. <digits>` fallback labels and restores kicker bubbles on kicker claims. |
| Claim fallback coverage | Fixed | Added `test/marketMoverClaim.test.mjs` to assert that a waiver claim fallback never renders as `P. <digits>` and that `Brandon Aubrey` resolves to a `K` bubble from mover copy alone. |
| Trade delta sign colors | Fixed | The Market hero delta, analyzer deal-strip deltas, counter row deltas, and trade suggestion impact chips now color strictly by sign: green positive, red negative, muted zero. |
| This-week board win bar | Fixed | The board bar is now a single orange fill for the left team on a dark track. Favorite emphasis stays typographic, and green/red remain reserved for movement chips and signed deltas. |
| Loader rotation | Fixed | `SimulationLoader` now resets cleanly on message-set changes and rotates only when multiple messages exist, which closes the stale single-line state seen during long pricing runs. |
| Futures double labels | Fixed | The extra section eyebrows above `Your futures` and `League futures` were removed so the card titles carry the label once. |
| Futures and Schedule axis clearance | Fixed | The rotated y-axis titles were replaced with top-aligned axis titles, which clears the tick labels on both the futures chart and the expected-wins pace chart. |
| Heat strip mid tones | Fixed | Schedule heat cells now ramp red to dark neutral to green instead of red straight into muddy brown. The same ramp feeds the priced week chip color. |
| Lane direction | Fixed | Market lane cards now show `You get` and `You send` above the names instead of an unlabeled `for` title. |
| Matchup hero provenance | Fixed | The hero restores `PRICED ON YOUR BOARD` when board overrides are active, keeps `Live line` as a secondary status chip, and always shows the Franco baseline under your price while board pricing is active. |

## Fire-back Verification

- `npm run lint`
- `npm run build`
- `node --test test/marketMoverClaim.test.mjs`
- Repo grep confirmed a single acceptance band map source: `src/utils/acceptanceLingo.ts`

## Fire-back Known Notes

- The requested before and after screenshots were not captured in this pass. The local Vite app was reachable on July 14, 2026, but the protected league routes were still auth-gated in the in-app browser session available to this thread, so the live signed-in states could not be reached non-destructively for screenshot capture.
- Cold-load skeletons and the 30-second scan cooldown are implemented in the touched surfaces, but I could not honestly mark them live-verified in-browser from this auth-gated session.

---

Prompt: `Codex prompt — Rebuild pass: trade displays, charts, League board, manager-finder integration (2026-07-14)`

## Rebuild Findings

| Area | Status | Note |
| --- | --- | --- |
| Shared trade display family | Fixed | Added one shared `TradeSide` / `TradeRow` / `TradeCard` family in `src/components/trade-display/`. Market lane cards, the collapsed deal strip, the counter add-card, and the Matchup market digest trade rows now consume the same two-column trade anatomy instead of local avatar-pile renderers. |
| Market manager-finder integration | Fixed in frontend | Market → Deals now presents one `THE MARKET` module with manager chips, position chips, shared `TradeCard` results, rotating loader copy, dimmed stale results during manager re-sims, and the existing scan button. Selecting a manager routes through the trade-suggestions sim path and opens those results in the same cards instead of a second widget. |
| Your-read panel | Fixed | The manager filter row now owns the `Your read` affordance and reuses the same `ManagerReadCard` state as the builder. The caption now reads `Only nudges the acceptance odds, never the championship numbers.` |
| Matchup market digest | Fixed | Trade movers on the Matchup page now reuse the shared compact trade row layout with `You send` / `You get` columns, a single acceptance chip, the dismissal ×, and the same rationale/open behavior as Market. |
| Raw player-id fallback | Fixed | Shared trade-side helpers and Matchup trade-row mapping now fall back to `Unknown player` instead of rendering raw unresolved ids into the UI. |
| FLX position guard | Fixed with test | The lineup row now resolves `showPosition` through `src/utils/lineupRow.ts`, which keeps starter FLEX rows on a single `FLX` pill while preserving bench position pills. |
| Delta sign-color guard | Fixed with test | Trade verdict/counter deltas now resolve their class through `src/utils/deltaTone.ts`, and the guard test asserts negative deltas never take the positive class and vice versa. |
| Acceptance band guard | Fixed with test | Added a shared acceptance-band regression test that locks `42 → Doubtful`, `48 → Coin flip`, `57 → Likely`, and `3 → Long shot`, plus a source scan to prevent hardcoded acceptance-band labels outside `src/utils/acceptanceLingo.ts`. |
| Trade-display regression coverage | Fixed with test | Added render-based trade display regression tests for 1-for-1, 2-for-1, 3-for-3, and 6-for-2 layouts, including the overflow `+2 more` state and the unresolved-player fallback. |
| Brand/pre-push guard | Fixed | Added `npm run brand-check`, `npm run test`, and a local `.githooks/pre-push` hook, then set `core.hooksPath` to `.githooks` in this repo so the hook runs before pushes from this clone. |

## Rebuild Verification

- `npm run brand-check`
- `npm run test`
- `npm run lint`
- `npm run build`

## Rebuild Known Notes

- The full chart-system rebuild (`OddsChart` unification across League board expand, Futures, and Schedule pace) is not complete in this continuation. Existing chart files still compile and the touched trade/matchup surfaces are stabilized, but that shared chart module still needs a dedicated pass.
- Live screenshots for the rebuilt Market and Matchup states were still not captured here. The local app built and ran on July 14, 2026, but the signed-in league routes needed for truthful before/after captures remained auth-gated in the in-app browser session available to this thread.
