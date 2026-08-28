# Same-game parlays need the sim, not a correction factor

**For:** Franco
**Status:** proposal, nothing built server-side
**Shipped alongside:** `src/utils/parlay.ts`, the bet slip on League → This week

## What shipped

Users can build a parlay from this week's board: moneyline, spread or total
on any game, including several legs from the same game. We quote it at fair
odds: no juice, and no independence assumed where it does not hold. No money
is involved anywhere, and a test enforces that.

Leg probabilities come from the engine and nowhere else:

| Leg | Probability | Source |
| --- | --- | --- |
| Moneyline | the quoted price's implied probability | `winProbability` via `probToAmerican` |
| Spread | 0.5 | the line is `a.mean - b.mean`, the central estimate |
| Total | 0.5 | the line is `a.mean + b.mean`, likewise |

Spread and total legs are even money by construction rather than by
assumption. If the engine ever posts a line away from its own central
estimate, that stops being true and those legs need real probabilities.

## Same-game legs, and how they are priced without you

Multiple legs on one game are allowed. They are not multiplied.

For a moneyline and a spread on the same game the joint probability is not a
modelling question: the two events are nested intervals of one margin. With M
the favourite's margin and s the posted line, the moneyline is `M > 0`, laying
the points is `M > s`, taking them is `M < s`, and `P(M > s) = 0.5` because s
is your central estimate of M. So:

| pair | reasoning | probability |
| --- | --- | --- |
| favourite ML + favourite spread | covering entails winning | 0.5 |
| favourite ML + underdog spread | wins without covering | P(win) − 0.5 |
| underdog ML + underdog spread | winning entails covering | P(win) |
| underdog ML + favourite spread | cannot both happen | 0 (refused) |

They sum to 1, which is the check that this is arithmetic rather than a guess,
and a test asserts it. On a -113 game the naive product would quote the
favourite's ML-and-spread pair at +276 when it is worth +100.

The one approximation is totals against sides: they are multiplied. With
M = A − B and T = A + B, `Cov(M, T) = Var(A) − Var(B)`, which is about zero
for two full fantasy lineups. It is the only estimate in the file.

Across different games everything is multiplied. Two fantasy matchups share no
roster, and what couples them (two managers on opposite sides of one NFL game,
a defence facing someone's quarterback) is second-order.

## What I'd like from the engine

One endpoint, and the analytic table below can come out entirely.

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

`src/utils/parlay.ts` holds the whole model and states every assumption in its
header. Nothing in it derives a probability of its own: the same-game table is
set logic on your win probability, and the only estimate is treating a total
as independent of a margin.

What the endpoint would buy: exact pricing for every combination rather than
the three pairs that happen to resolve analytically, correct handling of any
market added later, and pushes. When it exists, `parlayPrice` becomes the
fallback for when it is unreachable, and `sideJoint` is the thing to delete.
