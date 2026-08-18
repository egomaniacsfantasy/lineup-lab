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

---

Prompt: `Codex prompt — Rider v2: finish the rebuild under the methodology constitution (2026-07-14)`

## Rider v2 Findings

| Area | Status | Note |
| --- | --- | --- |
| Market finder cleanup | Fixed | `THE MARKET` now renders once, manager suggestion cards no longer duplicate the acceptance band in the partner line, stale manager results stay dimmed during refresh, and the finder now caps visible cards at five with a single `Show N more` reveal. |
| Shared chart module | Fixed | Added `src/components/charts/OddsChart.tsx` and migrated the League board expand chart, Futures closing-line chart, and Schedule expected-wins pace chart onto the same bounds/grid/series renderer without changing payload order or server math. |
| League shell tightening | Fixed in display layer | The League page now caps at roughly `1040px`, the sub-tabs size to content width instead of stretching full-row, and the Matchup/Futures board rows were tightened to the requested 64px rhythm. |
| Matchup hero and biggest-edge contracts | Verified in source, partial live verification | Source still contains `PRICED ON YOUR BOARD` and the Franco baseline row behind board overrides. Public demo browser verification confirmed the hero eyebrow, `Live line` chip, a populated `Biggest edge` card, and a non-empty market digest. The override-only provenance state could not be fully live-verified from an unsigned demo session. |
| Methodology lock | Fixed | Added `METHODOLOGY_UNTOUCHED.md` to document the constitution for this pass and explicitly record that pricing, acceptance, futures, and matchup math were not changed. |
| No-trade-math guard | Fixed with test | Added `src/utils/noTradeMath.ts` with a branded display-only odds-pair delta helper and `test/noTradeMath.test.mjs` to keep `TradePage.tsx` from reintroducing inline probability math. |

## Rider v2 Verification

- `npm test`
- `npm run brand-check`
- `npm run build`
- Local in-app browser verification on `http://127.0.0.1:4173/demo`

## Rider v2 Known Notes

- Public browser verification on July 14, 2026 was limited to `/demo`, which truthfully exercises the Matchup surface only. The signed-in League and Market routes remained auth-gated in the in-app browser session, so League board tightening, Dynasty Labs gating, and manager-finder live states were verified through source plus build/test rather than a signed-in browser run.
- The demo path does not carry a personalized board overlay, so the override-only hero provenance state (`PRICED ON YOUR BOARD` plus Franco baseline row) remains source-verified in this pass rather than fully browser-proven.

---

Prompt: `og-handoff-first-pass-2026-07-24`

## Findings

| Area | Status | Note |
| --- | --- | --- |
| Matchup page frame | Fixed | Legacy two-column page root scoped to the cold skeleton; loaded page uses one centered `frame` split (fluid main + 384px sticky elastic rail). Slot table now spans the full canvas; no wrapped starter names at 1512px (verified by DOM probe). |
| Week-at-a-glance | Fixed | LIVE LINE / BEST SLOT EDGE / "N plays" removed. Replaced with Next lock, First kickoff, Tightest game; every value is a payload/Sleeper-data field; items and module hide when data is absent. |
| Biggest edge card | Fixed | Restacked grid areas; delta pill no longer overlaps the odds pair; player units get the full row. |
| Board YOU chips | Fixed | Single shared util (`src/utils/myCalls.ts`); unrated/50 can never chip; marker-count === My-calls-count enforced by test. |
| Market Scouting | Removed | Sub-tabs, route and page deleted; `?view=scouting` lands on Deals. Persona/scouting data layer and "Your read" kept. |
| Market composition | Fixed | Eyebrow labels, docked "Your read", two-line clamped card names with tooltip. |
| Bye lock windows | Fixed | `buildExposureWindows` skips bye starters; kills "locks Bye BYE · locks" summary junk and the "NEXT LOCK: BYE" glance case. |
| Client-computed downside line | Removed (flag for Franco) | `MatchupPage` contained a pre-existing client-side probability fabrication: `winProbability - share * 0.35` converted to a moneyline and rendered as "A bad Thursday drops your line to X → Y". This is exactly the class of math the boundary doc forbids; no payload field backs it. The sentence and its computation are deleted. If the product wants a downside number, it must come from the engine as a payload field. |
| Pricing, engine, API, server | Untouched | No valuation, Monte Carlo, route, or persistence code changed. `node --test server/engine/*.test.js *.test.mjs`: 12/12 pass. |

## Honest gaps (need Andre's logged-in session)

- Rating loop end-to-end against Supabase (drag → save toast → reload → Sheet YOUR RATING) is test-covered at the UI layer (`boardInteractionLoop`), but the full network round-trip was not exercised: the app is auth-gated and this pass had no credentials (correctly so).
- H2H strip render check in 617 Dynasty (managed opponents): code-gated on `opponentTeam.managerKey` which bots lack; visual confirmation pending login.
- Provenance chip verified with a seeded local overlay in both odds formats; the live check (real board override diverging board price from Franco price) needs a logged-in league.
- In-league screenshots of Odds Frauds / DINK matchup pages: attempted headless; blocked by the auth gate (screenshots captured landed on the marketing page). Design-fixture and component-level verification stand in.

---

Prompt: `og-frontend-sweep-2026-07-25`

## Findings

| Area | Status | Note |
| --- | --- | --- |
| Matchup rail order | Fixed | Rail now leads with the start/sit call, then the injury watch list, then Line movement, then the Activity feed as the elastic closer. "The week at a glance" removed. |
| Slot projection alignment | Fixed | The edge chip rendered only on the winning side, so the projection column shifted x per row. Chip now has a reserved fixed column on both sides. |
| Team hierarchy | Fixed | Your projections keep the accent; opponent side is muted and non-interactive. Also reduces accent coverage toward the brand's 5 to 15% rule. |
| Compare eligibility | Fixed | Comparable pairs now derive from the engine's own per-slot `alternatives`, so a QB cannot be weighed against an RB unless a slot accepts both. No position rules invented client-side. |
| Optimal empty state | Removed | "The book has no plays for you" strip beneath the starters is gone; the rail's call module owns that state. |
| Market card density | Fixed | Manager cards shrunk from 54px avatars / 30px display type to 30px / 15px, so a full league fits in one or two rows. |
| **Client-side comparison fabricator** | **RESOLVED 2026-07-25** | `buildSyntheticComparison` in `src/hooks/useMatchupEngine.ts` invents win probabilities client-side (`getSyntheticDelta`, `getSyntheticWinProbabilities`, `buildSyntheticLine`) whenever two players share no slot. It is pre-existing, not from this pass. It was the code powering the illogical QB-vs-RB comparisons. Gating the UI to engine-eligible pairs means the slot table and bench can no longer reach it, but **the function still exists and is still wired as the fallback in `compareAnyTwoPlayers`**. It was deliberately NOT deleted: that is a call for Franco, and removing it could change behaviour on surfaces this pass did not audit. Recommend he either delete it or replace it with an engine call. |
| Pricing, engine, API, server | Untouched | No valuation, Monte Carlo, route, or persistence code changed. Engine tests 12/12. |

## Ops notes (this machine) — PARTIALLY RESOLVED

- ROOT CAUSE (confirmed by sampling a wedged server process, then by controlled test): the repo sits in iCloud-synced `~/Documents`, iCloud had evicted ~6,968 repo files to the cloud (`dataless` flag; includes `.claude/launch.json`, large parts of `.git/objects`, and `server/data/espn-creds.json`), and the CloudDocs materialization daemon (`bird`) was wedged, so any `open()` on an evicted file blocked FOREVER in uninterruptible I/O. Symptoms explained: `.claude/` hung the shell for hours, the local API server wedged mid-session (main thread sampled inside a kernel `open()` that never returns), repo greps stalled, and `git fetch` hung indefinitely.
- Controlled test that isolates it: every file with no flags reads instantly; every file flagged `dataless` hangs. `ls -lO <file>` shows the flag. `~/Desktop` is affected too (487 files) because Desktop & Documents sync is on. Note the sync is NOT via the old symlink layout: `~/Documents` is a real directory, and the CloudDocs container holds `Desktop ->` / `Documents ->` symlinks pointing back at the home folders (macOS 26 FPFS). Checking whether `~/Documents` is a symlink is therefore a misleading test.
- Disk space was NOT the trigger: 356 GB free. The daemon was simply stuck while reporting `caught-up`.
- FIX APPLIED: `killall bird` (launchd respawns it). Materialization immediately resumed. Proof: a `ls -la .claude/` that had been hung for hours completed the instant the daemon restarted, and previously-hanging files became readable. A bounded re-read sweep (`/tmp/materialize.sh`, per-file `alarm` timeout so nothing can wedge the sweep) is what pulls the rest back down; it is slow because ~6.5k files stream from iCloud.
- STILL OPEN for Andre: (1) let the materialization sweep finish, (2) a handful of files still fail to materialize and are listed in `/tmp/materialize-failed.txt`, (3) several git processes from before the fix are stuck in uninterruptible I/O and only a reboot will clear them, (4) DURABLE FIX, recommended: move this repo out of iCloud-synced paths (e.g. `~/dev/lineup-lab`) or turn off Desktop & Documents Folders sync in System Settings. Do NOT turn that setting off before everything is downloaded, or cloud-only files can be removed locally. Until one of those happens this will recur.
- Git consequence seen this pass: the local repo's history diverged because upstream `daee2f9` was rewritten to `4c07e4d` (identical tree). With `.git` objects unreadable, fetch/rebase could not complete in-place, so this pass's commit was replayed onto a clean clone and pushed from there. The in-place repo still holds the superseded local commit; reconcile with `git fetch && git reset --hard origin/main` once materialization completes (content is already identical to `main`, so nothing is lost).
- Separate, lesser note: the reprice scheduler runs 60s after server boot and synchronously crunches every cached league; harness runs land faster right after boot or after `[reprice] done`.
- `scripts/design-shots.mjs` "Apollo Archers" step was broken before this pass (exact-name match vs. card's full accessible name); fixed with a regex matcher. The full-suite after run is partial for this pass because of the iCloud wedge above; targeted after-shots live in `artifacts/design-shots/after-wip` and `live-verify`.

## 2026-07-25 — synthetic comparison removed for real

Earlier this session the invented-win-probability path was made unreachable
from the slot table but left in the tree. Opening comparison back up to any
two of your players would have made it reachable again, so it is now gone:
`getSyntheticDelta`, `getSyntheticWinProbabilities`, `buildSyntheticLine`
and their moneyline/win-prob clamps are deleted.

`buildSyntheticComparison` remains only as the no-shared-slot branch, and it
no longer prices anything: it returns the baseline line on both sides with a
zero delta and `slotIndex: -1`. The compare sheet already treated -1 as "not
a swap" and falls back to comparing projections, so two starters now read
"+5.4 pts · projection gap" instead of a fabricated win-probability swing.

Net effect: comparing any two of your players is allowed again, and no
comparison anywhere in the app can produce a probability the engine did not
supply.

## 2026-07-26 — Matchup distributions

| Area | Status | Note |
| --- | --- | --- |
| `MatchupDistributions` outside brand-check | Fixed | The component and its CSS were never in `scripts/brand-check.mjs` TARGETS, so it had drifted onto `#6ea8fe`, `#22c55e` and `#ff6b6b` instead of tokens. Both files added to TARGETS; colours moved to `var(--green)`, `var(--red)` and neutral greys. |
| Margin colour split landed off zero | Fixed | Bars were coloured from each bin's centre, so the bin straddling zero took one colour across its whole width. Measured on the fixture: zero line at x=136.4, red-to-green boundary at x=140.6, on a 300-unit axis. Winning margin was painted as a loss. Bars are now drawn twice under clip paths meeting at `xOf(0)`; measured offset is 0. |
| Frontend-computed axis label | Removed | The mid-axis label was `(min + max) / 2`, a value computed in the component and backed by no payload field. Gone; the margin axis now carries meaning labels and the ribbons carry served `min`/`max` only. |
| Distributions unreachable in fixtures | Fixed | `/design/matchup-live` served no `histograms`, so this module rendered nowhere reachable without a live authenticated league and could not be reviewed or measured. `designFixtures.ts` now carries a dev-only `DESIGN_HISTOGRAMS` in the engine's payload shape, `live` mode only. |
| `npm run lint` red on `main` | Fixed | `main` at `2c5a686` failed lint on a clean tree: `'_player' is defined but never used` at `MatchupPage.tsx:1475`, from `27d1117`. The pre-push hook would have blocked any push. `canPick` always returned true, so the vestigial parameter was dropped rather than loosening the lint config. |
| Quantile dotplot | Open, needs Franco | The research's best answer for a lay reader is a hundred dots, one per simulated week. The payload serves a binned density and no quantiles or samples; deriving them means inverting a CDF in the frontend, which the boundary forbids. Needs percentiles added to `matchupHistograms` server-side. |
| Pricing, engine, API, server | Untouched | No engine, route or persistence code changed. `node --test server/engine/*.test.js *.test.mjs`: 12/12 pass. |

## Honest gaps

- **The fixture is symmetric; the engine's output is not.** `DESIGN_HISTOGRAMS`
  is a Gaussian, so the shape I verified against is symmetric. The real engine
  draws each starter from an asymmetric floor/ceiling interval
  (`splitNormalDraw`), so a real margin distribution will be skewed and its
  peak will not sit on its mean. The layout does not assume symmetry, and the
  zero-split fix is independent of shape, but the skewed case has not been
  seen. Worth a look on Andre's live league.
- **"On average" is the mean, because the mean is what is served.** For a
  skewed distribution the median is the better "typical result", and the
  headline would read truer with it. It is not in the payload, so the copy
  says "on average" rather than "typically" to stay honest about which
  statistic it is. Another reason to ask Franco for percentiles.
- The ribbon end labels are the sample extremes, which are still the nerdiest
  numbers left on the surface. Kept because the ribbons need some scale and
  they are served fields; a served p5/p95 would be strictly better.
- Verified on the design fixture at 1512px only. The real app is auth-gated
  and this pass had no credentials. Andre's live numbers will differ from the
  fixture's; do not compare screenshots across the two.
- Not audited: whether the redundant-subtext sweep (open item (e)) touches
  this module. The footnote and the two ribbon labels were written fresh here,
  but the rest of the rail was not re-read for redundancy this pass.

## 2026-07-26 — Trade cards, and the waiver empty-slot bug diagnosed

| Area | Status | Note |
| --- | --- | --- |
| Deal card hierarchy | Fixed | Six rows became three. `Your title` leads at 26px, `Playoffs` and `This week` support at 13px, partner mirrors ride on their own metric's row at 11px. All six served numbers still render; nothing hidden, nothing re-ranked. |
| Top-tier delta ignored its sign | Fixed | A CSS rule forced `color: inherit` on primary-row values, so the lead delta rendered amber whether the trade helped or hurt you. Values now take `--green`/`--red` by sign in every tier. |
| Label truncation in the deal rail | Fixed | At the rail's width the three-column rows clipped to `Your play...` and `Win this ...`. Labels shortened to `Playoffs` and `This week`; verified `scrollWidth === clientWidth` on every label at 1512px and 375px. |
| Six-row deal state unreachable in fixtures | Fixed | Fixture suggestions carried only `youDelta`/`partnerDelta`, so `/design/market?view=deals` rendered two of six rows. Playoff and week deltas added to the three fixture suggestions. |
| Waiver empty-slot bug | Diagnosed, needs Franco | See below. The handoff's stated cause was wrong. |

### Waiver empty-slot bug: the handoff's inference was incorrect

The handoff recorded this as "inference, not confirmed: waiver scoring
evaluates claims as upgrades over an existing starter and finds no improvement
against an empty slot. Should treat empty slots as replacement-level zero."

It already does. `server/engine/engine.js:1228`, inside `computeMovers`:

```js
mean: (id && id !== '0' && projectionMap.has(id)) ? weekMeanOf(id) : 0,
```

An empty or unprojected slot scores 0, and the comment three lines above says
in as many words that an empty slot is the easiest to beat. So that is not the
fault.

The actual fault looks like an iteration-source mismatch. Two places in the
same file build the slot list, and they do not agree:

- `actualAssign` (line 353) maps over **`slotLabels`** and indexes into
  `starterIds`. A missing entry still yields the slot, with no player. Correct.
- the waiver block (line 1225) maps over **`userStarterIds`** and reads
  `slotLabels[i] ?? 'FLEX'`.

`slotLabels` comes from the league's own `rosterPositions` (line 611) and is
always full length. `starters` is not guaranteed to be. When `userStarterIds`
is shorter than `slotLabels`, the trailing slots never enter `starterSlots` at
all, and K and DEF are conventionally last in Sleeper's `roster_positions`.
Every K or DEF candidate then fails `slotAllows`, hits `if (!target) continue`
at line 1243, and the surface correctly reports that it found nothing.

That matches the report exactly: no K, no DEF, and "Nothing on waivers beats
what you'd already stream."

Suggested shape of the fix, Franco's call and Franco's file. Mirror
`actualAssign` so the slots come from the league, not from the array that is
missing them:

```js
const starterSlots = slotLabels.map((slot, i) => {
  const id = userStarterIds[i];
  return {
    index: i,
    slot,
    mean: (id && id !== '0' && projectionMap.has(id)) ? weekMeanOf(id) : 0,
  };
});
```

Line 1255 needs the same treatment in the same change: `afterStarterIds` is
built with `userStarterIds.map(...)`, so if that array is short it cannot hold
a claim placed at a trailing index.

NOT VERIFIED AGAINST A LIVE LEAGUE. This is read from the code, and it rests on
`starters` being shorter than `rosterPositions` for Andre's team. If Sleeper is
in fact returning a full-length array padded with `"0"`, this diagnosis is
wrong and the cause is elsewhere. The one-line check is whether
`userStarterIds.length === slotLabels.length` for that roster. Engine code was
not touched.

## 2026-07-26 — Non-swap comparison, and a tooling gap worth knowing

| Area | Status | Note |
| --- | --- | --- |
| Non-swap comparison was projection-only | Fixed | Comparing two starters with no shared slot now also shows what each costs you to sit, read from that slot's best bench alternative's served `resultingLine`. Only renders when both sides have a priced bench option. Verified against the fixture's `userSwaps`: 63.0% and 64.6% match `resultingWinProb` exactly. |
| Compare footer restated the headline | Fixed | It read "X projects 2.8 more points this week" directly under a "+2.8 pts / projection gap" headline, next to an EDGE badge. Now carries only the tape note. |
| `npx tsc --noEmit` checks nothing | Worth knowing | Root `tsconfig.json` is `{"files": [], "references": [...]}`, so a bare `tsc --noEmit` at the repo root type-checks zero files and exits 0. It reported clean while `npm run build` failed on two real type errors. Use `npm run build` (or `tsc -b`) as the typecheck. Any past session that trusted `tsc --noEmit` was not actually checking types. |

## Honest gaps

- The redundant-subtext sweep is a first cut, not the audit Andre asked for.
  Two demonstrable duplications were removed (compare footer, deal-card
  labels). No surface was read end to end for redundancy, and the standing
  note covers "everywhere". League, Board and More were not looked at.
- The sit comparison silently does not appear when either player's slot has no
  priced bench alternative. That is deliberate, but it means the feature is
  invisible in exactly the lineups with the thinnest benches, and no copy
  explains the absence. Worth Andre's eye on whether an explicit "no bench
  option for X" line would be better than showing nothing.
- Compare-sheet state toggles on repeat clicks, which made several early
  measurements read as "not rendered" when the pick had simply been undone.
  Measure after a reload with a known-zero pick count, and query the DOM in a
  later tick than the click: React has not flushed in the same tick, so a
  same-tick query returns null even when the block renders correctly.

- Two of the four content cuts proposed for the phone pass did not survive
  measurement, and are recorded here rather than quietly dropped. "Content is
  clipped by the tab bar" was wrong: the scroller already reserved 80px against
  a 75px bar, so the end of the scroll cleared it. What the screenshot showed
  was mid-scroll content under a translucent fixed bar, which is intended. The
  clearance was thin (5px on web) and is now 15px, but there was no clipping
  bug. "The season band stacks five stats" was also wrong — `season-band__items`
  has been a two-column grid the whole time.
- The phone header hides `.app-header__sync` and the "Not synced" chip. Sync
  state is on the avatar dot and "Sync now" is in the account menu, so nothing
  is unreachable, but the affordance is now two taps instead of one and there
  is no pull-to-refresh to fall back on.
- The "Unmanaged team, no read." line is hidden below 1024px. The information
  survives on desktop and via the crest tooltip; on a phone the only signal
  that scouting is unavailable is that the crest does not respond to a tap.
- Only the Hub was QA'd on device. The MCP simulator integration is broken by
  `xcode-select` pointing away from Xcode, which needs the user's password, so
  there is no way to tap or scroll the running app from here. League, Trades,
  Board and More are unverified at phone size in the native shell.
- A whole-page overlap sweep reports ~24 collisions on /demo. They are false
  positives: the sweep compares bounding boxes of different instances of the
  same class across a scrolling container. Confirmed clean visually. If that
  sweep is ever promoted into a test it needs to compare within a common
  offsetParent, not across the document.
