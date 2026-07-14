# Methodology Untouched

This rebuild pass was constrained by one rule: frontend presentation changed, pricing methodology did not.

## Constitution

- Frontend surfaces do not compute a trade metric.
- Suggestions render in engine order. Filters may hide rows, never re-rank them.
- Every rendered number must trace back to a payload field through the view-model layer.
- Allowed frontend transforms are limited to:
  - display rounding
  - percent to American, and American to percent, formatting
  - payload-provided before and after pairs rendered as a delta chip
  - sign-driven color only
- Franco-derived metrics lead. `pts/wk` remains secondary payload detail, never the headline currency.

## What This Pass Changed

- Shared trade display anatomy
- Shared odds-chart renderer
- League board and Market presentation tightening
- Regression guards and documentation

## What This Pass Did Not Change

- Pricing engine logic
- Trade suggestion ordering
- Acceptance model math
- Futures math
- Matchup simulation math
- Server routes, persistence, or valuation formulas

## Guard Rails

- `test/noTradeMath.test.mjs` locks TradePage to the branded `oddsPairDelta` display helper instead of inline probability math.
- `src/utils/noTradeMath.ts` brands the only allowed frontend delta transform for engine-provided odds pairs.
