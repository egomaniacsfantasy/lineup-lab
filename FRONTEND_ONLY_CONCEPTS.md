# Frontend-Only Concepts

What we could ship without asking Franco for a single new field.

Written 2026-07-26. The brief was "groundbreaking things that fit the thesis,
using the math and projections we already have, with nothing new on the back
end." So this is not a brainstorm. It is an audit of what the API already
serves and the frontend never renders, plus what that unused data makes
possible.

## Method

Every field on every interface in `src/services/leagueApi.ts` was extracted and
grepped across `src/`. Anything with zero references outside the API file is
capability we have already paid for and thrown away. Claims below were then
verified one by one against the server, because a crude grep produces false
positives (`draftWrapped`, `valueGap` and `acceptanceReason` all looked dead
and are not).

## The dead-field inventory

Verified zero references outside `src/services/leagueApi.ts`:

| Field | What it holds | Where it comes from |
| --- | --- | --- |
| `LineHistoryEntry.teamSnapshots[]` | Per team, per recorded moment: `winProbThisWeek`, `titleOdds`, `playoffOdds`, `trigger`, `computedAt` | `server/engine/lineStore.js:94` |
| `LineHistoryEntry.titleOdds` | Title odds per roster at that moment | same |
| `TradeRationaleResponse.factors` / `.structured` / `.narration` | A grounded, fact-checked explanation of a trade price | `POST /api/league/:id/trade-rationale`, `server/routes/api.js:884` |
| `TradeAnalysis.warnings` | "This trade leaves you without a legal starting lineup" | `server/engine/engine.js:1665` |
| `TradeAnalysis.dropsNeeded` / `.drops` / `.maxRoster` | How many players you must cut, and which | `server/engine/engine.js:1711` |
| `PricedFuture.finalsProb` / `finalsOdds` | The middle rung of the futures ladder | engine futures |

Two of those deserve emphasis.

**`teamSnapshots` is a time series with causes attached.** The scheduler
reprices every league every 6 hours and force-records a point even when
nothing moved (`server/scheduler.js:38`), keeping the last 200 entries per
league on disk. Every entry carries a `trigger` from a small vocabulary:
`line opened`, `weekly roll`, `projection update`, `reprice`, `scheduled`
(`lineStore.js:32`). So for every team we already have a dated, reason-tagged
history of their win probability, playoff odds and title odds. It is fetched
into `LeagueConnectionContext` as `lineHistory` on every session. It is sitting
in the client's memory right now, unread.

**`finalsOdds` exists only in `src/mocks/league.ts`.** The engine serves it;
the frontend hard-codes fake values in mocks and never renders the real one.

## The concepts

Ranked by what they'd add divided by what they'd cost.

### 1. The movement log: why your number moved

Sportsbooks show line movement. No fantasy product tells you *why* your odds
changed. We can, today, because `trigger` is already attached to every point.

```
LINE MOVEMENT
Today 6:04 AM    projection update    Title  +485 → +429    ▲
Yesterday 12:02 AM  scheduled         Title  +485 → +485    ·
Tue 6:01 PM      weekly roll          Title  +512 → +485    ▲
```

The Matchup rail already has a "Line movement" module that currently says
"No real movement yet". It has been sitting on the data to fill itself.

Data: `lineHistory[].teamSnapshots[]`, already in context. Nothing new fetched.
Boundary: each point is a served value; the change between two consecutive
served points is a before/after pair, which is a permitted transform.
Effort: low. This is the best ratio on the list.

### 2. Closing line value: did you beat the number?

The strongest idea here, and the one that most deserves the word groundbreaking.

In sharp betting, closing line value is the accepted measure of skill, and it
beats win rate precisely because win rate is mostly variance. A bettor at 48%
who consistently gets a better price than the close is winning; a bettor at 55%
who takes bad prices is not.

Fantasy has exactly this problem and no answer to it. Managers judge themselves
on a 12-game record, which is almost pure noise, and every league has the guy
who went 4-9 while scoring the second most points. Odds Gods is the only
product positioned to say something better, because it has been recording every
team's line every six hours all season.

```
WEEK 7
Opened      -120
Closed      -165
The market moved 45 points your way before kickoff.
```

Data: `lineHistory` filtered to one week; first recorded line is the open, last
before kickoff is the close. Both served.
Boundary: the open and the close are two served points and their difference is
a permitted delta. Safe.
The hard limit: **a season-long CLV average is a new statistic and must be
Franco's.** Averaging served values into a headline number is the kind of thing
the methodology forbids. Per-week display is fine; a "your CLV: +3.2%" badge is
not ours to compute.
Honest gap: we know when the *line* moved, not when *you* acted, so the first
version reports market movement rather than crediting the user. Attributing it
would need the app to record the user's own lineup-set timestamps locally,
which is client state and invents no numbers, but it is a second step.

### 3. The book shows its work

There is a complete grounded-rationale endpoint,
`POST /api/league/:leagueId/trade-rationale`, that returns fact-checked
`factors`, a `structured` rendering and an optional validated narration. The
client function `fetchTradeRationale` exists at `leagueApi.ts:717`.

Nothing calls it.

Meanwhile the "Why this trade?" button in the Matchup market module expands a
sentence the frontend assembles itself from mover fields
(`MatchupPage.tsx:2254`). We hand-roll a worse explanation while a better,
server-grounded one goes unused.

Wiring it up is strictly *safer* than what ships today, because it replaces
frontend-composed prose with server-generated text.
Effort: medium. Endpoint and client function both exist; needs a render, a
loading state and a fallback.

### 4. Do not let the user make an illegal trade

`analyzeTrade` already detects a trade that strips your last kicker or defense
and returns a written warning, plus how many players you would have to drop and
which ones. All of it unrendered.

This is not glamorous, and it is directly relevant: Andre's own team is
currently missing a K and a DEF.
Data: `TradeAnalysis.warnings`, `dropsNeeded`, `drops`, `maxRoster`.
Boundary: pure display of served strings and counts.
Effort: low.

### 5. The missing rung on the futures ladder

A sportsbook futures market reads playoffs, then conference, then title. Ours
reads playoffs, then title, with a hole where the finals should be, and the
finals number is served. `finalsProb` is also the unclamped probability, which
the engine's own comment (`lineStore.js:86`) says charts should prefer, since
American odds clamp at 98.5%.
Effort: very low. Closer to finishing something than adding something.

### 6. The rest-of-season gauntlet

`weeklyLines` gives a priced line for *every* remaining week: opponent,
moneyline, win probability, your projection and theirs. Today only one week at
a time is read (`LeaguePage.tsx:426`).

Rendered as a full ladder it becomes a schedule-strength view priced as a real
market: which weeks you are favoured, where the season turns, which stretch
decides your playoff position. Every number served.
Effort: low to medium, mostly layout.

### 7. The league market report

Across teams, `teamSnapshots` between two timestamps shows who gained and lost
the most this week. That is a league-wide market report, and it is the kind of
thing people screenshot into their group chat.

Flagged, not recommended yet: building a *ranked* list out of computed
differences is close to the line that got a client-side sort reverted before.
The deltas themselves are permitted, the ordering is the question. Worth asking
Franco rather than assuming.

## What we cannot do without Franco

Stated plainly so nobody tries.

- **Compounding decisions into one number.** A "bet slip" that adds up this
  week's start/sit, waiver and trade moves into a single win-probability swing
  is multiplying probabilities in the frontend. Forbidden. We can list the
  decisions with their individual served deltas; we cannot total them.
- **Any season aggregate.** Average CLV, a skill score, a manager rating.
  All new statistics.
- **The quantile dotplot** from the distributions work: needs percentiles the
  endpoint does not serve.
- **Anything that re-ranks engine output.** Display filters may hide, never
  reorder.

## Suggested order

1 and 4 first: both are low effort, both fill surfaces that currently sit empty
or wrong, and neither goes near the boundary. Then 3, which removes
frontend-authored prose in favour of the server's. Then 2, which is the real
prize and deserves its own pass and Andre's eye on the framing before any code.
