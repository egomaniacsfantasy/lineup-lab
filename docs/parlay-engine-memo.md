# Same-game parlays need the sim, not a correction factor

**For:** Franco
**Status:** proposal, nothing built server-side
**Shipped alongside:** `src/utils/parlay.ts`, the bet slip on League → This week

## What shipped

Users can build a parlay from this week's board: moneyline, spread or total
on any game. We quote it at fair odds — the product of the legs' true
probabilities, converted to American, no juice. No money is involved anywhere:
there is no stake field, no payout and no balance, and a test enforces that.

Leg probabilities come from the engine and nowhere else:

| Leg | Probability | Source |
| --- | --- | --- |
| Moneyline | the quoted price's implied probability | `winProbability` via `probToAmerican` |
| Spread | 0.5 | the line is `a.mean - b.mean`, the central estimate |
| Total | 0.5 | the line is `a.mean + b.mean`, likewise |

Spread and total legs are even money by construction rather than by
assumption. If the engine ever posts a line away from its own central
estimate, that stops being true and those legs need real probabilities.

## The constraint the frontend imposes, and why

**A slip takes at most one leg per game.** Adding a second leg from the same
game replaces the first.

Multiplying probabilities is valid only for independent events, and two
markets on one game are strongly dependent. Concretely, on a game priced -113
with the favourite laying 2.9:

```
moneyline       53.1%
spread -2.9     50.0%
product         26.6%  ->  +276
truth           50.0%  ->  +100
```

Covering -2.9 entails winning, so the parlay *is* the spread leg. Quoting
+276 would be wrong by a factor of two, in the customer's favour, on a bet
reachable in two taps. Totals correlate with sides the same way, less sharply.

Across different games the independence assumption holds well enough to quote
on — two fantasy matchups share no roster, and the couplings that do exist
(two managers on opposite sides of one NFL game, a defence facing someone's
quarterback) are second-order against full lineups.

## What I'd like from the engine

One endpoint, and then the frontend constraint can come off entirely.

```
POST /api/league/:leagueId/parlay
{
  userId: string,
  week: number,
  legs: [
    { matchupId: number, market: 'moneyline', rosterId: string }
    { matchupId: number, market: 'spread',    rosterId: string, line: number }
    { matchupId: number, market: 'total',     side: 'over' | 'under', line: number }
  ]
}
->
{
  available: true,
  probability: number,   // 0..1, the fraction of sims where EVERY leg hit
  american: number,
  sims: number,
  legs: [{ probability: number }]   // each leg alone, for the slip's rows
}
```

The ask is just: run the week, count the sims where every leg hits, divide.
Correlation falls out of the counting — no joint model, no correction factor,
and same-game parlays become exactly priced rather than banned. It is the
same shape as the conditioned board in `docs/predictor-engine-memo.md` and
should be able to reuse `prepared` and the shared seed.

Two things worth deciding when you build it:

- **Per-leg probabilities in the response.** The slip shows each leg's own
  price next to it. Today those are the board's prices; if the endpoint
  returns them, the slip and the board should agree to the digit or people
  will notice.
- **Pushes.** `covered()` in `src/utils/vsBook.ts` already treats an exact
  spread as a push rather than a loss. If a leg can push, the parlay's
  probability is over a three-way outcome and the sim should say so, because
  the frontend cannot infer it.

## Until then

`src/utils/parlay.ts` holds the whole model, states the independence
assumption in the file header, and enforces one leg per game. Nothing in it
derives a probability of its own. When the endpoint exists, `parlayPrice`
becomes a fallback for when it is unreachable, and `toggleLeg`'s
replace-by-game rule is the thing to delete.
