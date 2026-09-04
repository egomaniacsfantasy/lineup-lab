# Odds Gods (lineup-lab)

Fantasy football priced like a sportsbook. Every matchup, trade and season
carries a real line from a Monte Carlo engine. No money is involved anywhere:
the odds are how a book writes a probability, and that framing is the product.

**Read `docs/PRODUCT.md` before any substantial work.** It is the living spec:
what exists, front end and back, the substantiated-claims table, and a numbered
"known drift" list of everything open. Keep it current as part of the change,
not afterwards.

## Where things are

- This repo is the only live copy: `~/dev/lineup-lab`. Copies under
  `Documents/New project/` are dead iCloud corpses; do not edit them.
- Deploys to Render from `main`. The frontend is a **separately built CDN
  bundle**, so a build-time env var also needs a rebuild after it is set.

## Ownership

`server/engine/` is Franco's: `engine.js`, `leverage.js`, `liveWinProb.js` and
the sim, pricing and odds maths inside them. Do not edit simulation, pricing or
odds logic. The frontend does display transforms only. If a number looks wrong,
the fix is almost always in the transform or the seating, not the engine.

## Verifying a change

```
npx tsc -b          # the real typecheck. vite does not typecheck
npm run lint        # eslint + the copy scan
npm run brand-check # NOT part of npm test. it can break silently
npm test            # ~570 tests, several minutes, spawns real browsers
```

The pre-push hook runs `brand-check`, `test` and `build`, so a push takes a
couple of minutes and a broken test blocks it.

## Traps that have each cost a session

- **`npm run brand-check` is not in `npm test`.** It scans a fixed `TARGETS`
  list in `scripts/brand-check.mjs`; a new component is not covered until it is
  added there. It has no bare-dash exemption, unlike the copy scan.
- **The copy scan reads JSX comments as UI text**, and walks `src`, `server`
  and `espn-login-worker/src`. No em dashes or spaced en dashes anywhere,
  including in comments. A file that must *define* those characters builds them
  with `String.fromCharCode` (see `server/services/coach/validate.js`).
- **"Points" means fantasy points only.** Never percentage points; say
  "percentage points" or "pp".
- **Colour is semantic.** Amber is you, the brand, a CTA or a selection. Green
  and red mean **money** and nothing else. A projection edge, a leading slot or
  a bigger number is not money, so it is weight or a neutral tone, never colour.
- **Emphasis follows whose team it is, not which seat it is in.** The board
  seats the favourite on the left; the Hub seats you on the left. Reusing Hub
  styling on a board surface will silently mark a stranger's team as yours.
- **A closed `<details>` in Chromium keeps its layout box** (`content-visibility`),
  so a bounding-box test says a hidden element is visible. Use
  `checkVisibility()`.

## Testing discipline

Tests here are expected to be **non-vacuous**: after writing a guard,
reintroduce the defect, watch the test fail, then restore. Several tests in
this repo were caught proving nothing that way. A test whose fixture cannot
express the bug is worse than no test, because it reads as coverage.

Rendered tests use Playwright against a Vite dev server:

- **Own your own port.** Adopting another test file's server inherits its
  lifetime, and that server dies when that file finishes.
- **Do not use `waitUntil: 'networkidle'` on the Hub.** It requests a headshot
  per player and every one 500s without an API server, so retries keep the
  connection busy and the wait is a coin flip under load. Wait for a selector.
- Design fixtures at `/design/:scene` render real pages against a fixed
  fixture league, and are how layout is tested deterministically. Query flags:
  `?staleSeason`, `?notRolledOver`, `?syncing`, `?dynasty`, `?multiLeague`,
  `?private`, `?slowForks`, `?tour`, `?desktop=1|0`.

## Numbers that matter

Sim counts live in the engine: `MATCHUP_SIMS` and `SEASON_SIMS` 10,000,
`PREDICTOR_SIMS` 4,000, `TRADE_SIMS` 4,000, `LIVE_SIMS` 2,500, `FORK_SIMS` 800.

The engine is seeded from league inputs rather than the clock, so **the same
question twice gives the same answer**. That is reproducibility, not accuracy:
two *different* conditions are sampled differently, so a win-versus-lose
difference still carries sampling error. Measured on a 12-team league, the
win/lose title swing has a standard deviation near 1pp at 4,000 sims and gets
the **sign wrong one time in five at 400**. Do not economise on sims for a
conditional answer, and do not quote a swing under about 1pp as a figure.

## Known unfinished work

`server/` has six test files `npm test` never runs (its glob is
`test/*.test.mjs`), and `server/engine/tradeAudit.test.mjs` has two failing
invariants: an empty trade produces non-zero deltas (playoff 0.1pp, title
-0.1pp, weekWinProb 3.7pp). That is engine territory, so it is Franco's.

`docs/PRODUCT.md` section 8 carries the rest.
