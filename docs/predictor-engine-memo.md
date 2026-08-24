# Memo: three endpoints the Predictor needs

**For Franco.** The frontend for all of this is built, reviewed and merged. What
is missing is the engine side, and it is deliberately missing: none of it was
attempted outside `engine.js` because doing it there would have meant
re-deriving your pricing context by hand.

**Please do not change the visual layer.** The components, their copy, their
layout and their empty states were designed and iterated against a real
browser. They render whatever these endpoints return. If a shape below is
wrong for you, change the shape here and say so, and the frontend will be
adjusted to match — but the rendering itself is settled.

---

## What already exists

`server/engine/leverage.js` — merged, tested, unused.

- `forceResult(ctx, { week, winnerId, loserId, winnerPoints, loserPoints })`
  returns a **new** ctx with that matchup removed from `scheduleWeeks` and the
  win credited in `teams[].record`. It does not mutate the input.
- `weekLeverage(ctx, week, projectedPoints)` conditions both outcomes of every
  matchup in a week and returns them ranked 0-100.
- `bookDistance(a, b)` sums absolute divergence in playoff and title
  probability between two books.

`test/leverage.test.mjs` covers all three against a synthetic prepared ctx.

Two details in there worth keeping whatever you build:

1. **Only the matchup the two teams actually share is dropped.** Filtering on
   "contains either team" deletes the games those rosters are not even in
   whenever the pair is not paired. I hit this while testing and it produced a
   board where losing a game improved your odds. A pairing that does not exist
   throws rather than silently doing nothing.
2. **Points are credited with a forced win.** Points-for is the seeding
   tiebreaker, so a forced win with no points attached distorts the standings
   the conditioned book is built from. I used each side's projection for that
   week; if you would rather use the mean of the distribution, that is your
   call and the only modelling decision in here.

## The blocker

`weekLeverage` calls `simulateSeason` directly, which needs a **prepared**
context: `projectionMap` keyed by player id, `slotLabels`, `seed`.
`assembleLeagueCtx` in `routes/api.js` produces the upstream shape instead —
`projections` as a version plus a list — and the step between them lives inside
`priceLeague`.

Pointing it at a real league fails with `projectionMap is not iterable`.

Two ways through, both yours:

- export the context-preparation step so a caller can build a prepared ctx, or
- compute the conditioning inside `priceLeague`, where one already exists.

**Please do not rebuild that preparation outside the engine.** It would
duplicate overlay application, live locks and replacement levels, then drift
from the real pricing path silently — importance scores that look entirely
plausible while being computed against different projections than the board
sitting next to them. That is the failure mode worth avoiding above all others
here.

---

## Endpoint 1 — `POST /api/league/:leagueId/predictor`

Drives the Predictor tab.

```jsonc
// request
{ "userId": "…", "picks": [ { "week": 12, "matchupId": 1204, "winnerRosterId": "3" } ], "fast": true }

// response
{
  "available": true,
  "pickSetHash": "12:1204:3",        // see below — this one matters
  "picked": 1, "simulated": 23,
  "sims": 2500,
  "rows": [ { "rosterId": "3", "playoffProb": 71.2, "titleProb": 18.4,
              "avgSeed": 3.1, "playoffOdds": -247, "titleOdds": 443 } ]
}
```

`pickSetHash` must be the hash **of the picks the run actually used**. The
client computes the same string and discards any response that does not match
the picks currently on screen. Without it, a slow run started three clicks ago
lands after a fast one and repaints the board with a scenario the user has
already moved past: real numbers describing the wrong world. The client's
implementation is `pickSetHash` in `src/services/predictor.ts` — sorted, so
order never matters, because picking A then B is the same scenario as B then A
and must quote identically.

`fast: true` asks for roughly 2,500 sims. Measured on a 12-team, 14-week league:
2,500 lands in ~210ms and sits within half a point of the 10,000 answer, so it
is what a click should feel like. Refining to 10,000 at idle is welcome and the
client will accept a second response for the same hash.

Seeding the RNG from the pick-set hash would be a real improvement: identical
scenarios would then quote identical prices, which matters because people
re-run the same what-if and notice when the number wobbles.

## Endpoint 2 — `GET /api/league/:leagueId/forks?userId=…&week=…`

Drives the horizontal graphic under This week.

```jsonc
{
  "week": 12,
  "forks": [
    { "matchupId": 1204, "importance": 94,
      "sides": [
        { "rosterId": "3", "nowProb": 62.0, "winProb": 78.5, "lossProb": 41.2 },
        { "rosterId": "7", "nowProb": 38.0, "winProb": 55.1, "lossProb": 22.4 }
      ] } ]
}
```

`nowProb`, `winProb` and `lossProb` are **playoff** probability. `importance` is
`weekLeverage`'s 0-100, relative to the biggest swing in that same week.

This is `weekLeverage` with both branches reported rather than reduced to a
distance, so it is close to free once endpoint 1 exists.

## Endpoint 3 — Game of the Week

Andre wants this alongside the fork, not instead of it. It is the same payload:
the matchup with the highest `importance`. Either add `gameOfTheWeek: 1204` to
the forks response or let the client take the max — say which you prefer.

---

## Two smaller things already done on this side

- `lineStore.js` now persists `spread` and `projection` per side. It was
  keeping only the moneyline and win probability, which made "did this team
  beat the number" unanswerable from history and unrecoverable after the fact.
  Every unstored week was a week that could never be graded, so it went in
  ahead of the season.
- The frontend computes no probabilities anywhere in this work. All-play,
  schedule luck and vs-Book are arithmetic on results that already happened;
  everything forward-looking comes from you.

Questions to me rather than guessing at the shapes — changing them now is
cheap, and changing them after the season starts is not.
