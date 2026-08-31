# Odds Gods — Product Specification

**Status:** living document. Last verified against the running product on
2026-08-31, after the pre-launch punch list (see §8 for what it closed).

**How to keep it alive:** this file is the source of truth. When a surface
ships, changes, or is removed, update the relevant section *and* the
"Substantiated claims" table at the bottom, because that table is what
marketing copy is allowed to say. If a claim is not in that table, it has not
been verified and must not be printed.

**How this was written:** by reading the codebase and by running the product
locally and walking every screen, not by reading its documentation. Several
things the documentation asserted turned out to be false, and they are listed
under "Known drift."

---

# 1. What Odds Gods is

**One line:** it prices your fantasy football league like a sportsbook.

**One paragraph:** You connect a Sleeper or ESPN league. Odds Gods runs a
player-level Monte Carlo simulation of your specific league and returns a
complete book on it: a moneyline, spread and total on every matchup;
championship and playoff odds for every team, moving all week; trades worth
making, priced from both sides *and* scored on whether the other manager would
accept; a predictor that lets you call the rest of the season and watch the
bracket re-form; and a bet slip that lets you parlay your own league at fair
odds. No money changes hands anywhere in the product.

**What it is not:** it is not a sportsbook, not a DFS operator, and not a
gambling product. There is no stake, no wager, no deposit, no payout, and no
mechanism to place one. The sportsbook vocabulary is the *interface* — the unit
the numbers are quoted in — not the transaction.

**The wedge:** every fantasy platform already computes win probability, and
nobody reads it. A percentage is a number about a model; an American odds line
is a number about a claim. `+900` carries a stance and starts an argument.
`10.0%` carries a footnote. The product's whole thesis is that the audience
already speaks the sportsbook dialect fluently, so rendering their league in it
costs zero education and buys instant legibility.

---

# 2. Core value propositions

These are ordered by how defensible they are, which is not the same as how
exciting they sound. Each is followed by what actually backs it.

### 2.1 Your league, not the player

Almost everything in this category values a *player* in the abstract — across
every league, every scoring setting, every roster. Odds Gods conditions every
number on **your** league: your managers, your scoring family, your roster
slots and flex eligibility, your schedule, your playoff structure and start
week.

*Backing:* the provider layer reads `scoringSettings`, `rosterPositions` and
`playoffWeekStart` per league; flex eligibility (`FLEX`, `WRRB_FLEX`,
`REC_FLEX`, `SUPER_FLEX`) is resolved per slot; playoff settings are separately
readable and writable per league.

### 2.2 One currency: everything is priced in championship probability

This is the strongest structural claim in the product. Competitors quote a
trade in arbitrary value points and a start/sit in projected points, which are
incommensurable units. Odds Gods denominates a trade, a matchup, a lineup swap,
a predictor pick and a season outlook in the *same* thing: what it does to your
title odds.

That makes a question askable that a player ranking cannot express: *"should I
make this trade, or is my remaining schedule soft enough that I don't need
to?"*

*Backing:* one engine (`server/engine/engine.js`) produces matchup lines, swap
deltas and season futures from the same prepared context. The trade surfaces
all run at the same sim count and seed so a trade prices identically wherever
it appears.

### 2.3 It finds the trade, and tells you whether he will take it

Every trade tool on the market is an *evaluator*: you bring it a trade, it
grades it. That is backwards, because judging a trade was never the hard part —
finding one is, and getting it accepted is harder still.

The finder enumerates candidate trades across shapes (1-for-1 up to 3-for-2 and
3-for-1, so lopsided rosters can match), re-simulates each, and surfaces deals
that raise **both** sides' title price. Each carries an **acceptance
probability**: a logistic over how much the deal helps *them*, shifted by two
per-manager reads you set yourself — trade-friendliness and relationship, 0 to
10.

Nothing else in the category prices acceptance, because everything else treats
a league as a market rather than as twelve people who know each other.

*Backing:* `src/utils/tradeAcceptance.ts` (logistic, output clamped to 3–97),
`src/utils/tradeTraits.ts` (the per-manager reads), `POST
/api/league/:id/trade-suggestions`, and the observed finder funnel
(enumerate → scan → re-sim → keep positive).

### 2.4 The line moves all week

The book opens and then re-prices: on every projection refresh, waiver run and
lineup change, plus a scheduled repricing every six hours whether or not anyone
is looking. Line history accumulates, so the charts gain points over time and
"opened at / now" is a real comparison rather than a decoration.

*Backing:* `server/scheduler.js` (6-hour cycle, force-appends a timestamped
snapshot per registered league), `server/engine/lineStore.js`, and an
`inputsHash` on every line record so movement is diffable.

### 2.5 It says "I don't know"

Dynasty and keeper leagues get no trade prices at all, because the engine
simulates a rest-of-season and dynasty assets include picks and future years.
Absurd prices render as a dash rather than a number. A league connected in a
prior season is detected and announced instead of being confidently priced.

*Backing:* `src/utils/leagueCapabilities.ts`, `OFF_THE_BOARD` in
`src/utils/formatOdds.ts`, `server/leagueSuccession.js` and
`StaleSeasonNotice`.

### 2.6 The output is social

Every rival's deliverable is a private dashboard. Odds Gods' deliverable is a
share card built to be thrown into the league group chat, carrying the URL. In
a category that exists only because a dozen people talk to each other
constantly, that is the difference between a tool and a tool with a
distribution channel inside it.

*Backing:* three card generators on a shared kit (`shareCard.ts`,
`tradeCard.ts`, `parlayCard.ts`, `cardKit.ts`), each 1080x1350 except the
parlay card, whose height is computed from leg count.

---

# 3. Who it is for

**Primary:** the most engaged manager in a 10–14 team redraft league — the one
who already argues about this stuff, already checks projections midweek, and
is the person their league asks. They bring the league with them.

**Secondary:** commissioners. One commissioner can carry eleven other accounts,
which is why the pricing model leans toward per-league or commissioner-pays.

**Explicitly out of scope today:** dynasty and keeper managers get a
deliberately reduced product (no trade pricing). Best-ball and DFS are not
addressed at all.

---

# 4. Front end

## 4.1 Stack

React 19 · TypeScript 5.8 · Vite 7 · React Router 7 · plain CSS with a design
token layer. Supabase JS for auth. Capacitor 8 wraps the same bundle as an iOS
app. No component library, no CSS framework, no state library — context plus
hooks.

## 4.2 Routes

| Route | Surface | Gate |
|---|---|---|
| `/` | Landing page (signed out) or Hub (signed in) | — |
| `/signin` | Auth (create account / log in) | — |
| `/connect` | Provider chooser and connect wizard | signed in |
| `/matchup` | **Hub** — your week, everything at once | league connected |
| `/league` | **League** — the whole book | league connected |
| `/market` | **Trades** — finder and builder | league connected, redraft only |
| `/rankings` | **Board** — player values | league connected |
| `/season` | Season detail | league connected |
| `/more` | Settings, odds format, scoring, support | league connected |
| `/demo` | Demo league, Hub only | — |
| `/admin/projections` | Projection import and activation | admin |
| `/design/*` | Design fixtures | dev builds only |

Legacy routes (`/trade`, `/trade-analyzer`, `/projections`) redirect rather
than 404, because they shipped and are in people's history.

Primary navigation is five tabs: **Hub · League · Trades · Board · More**. The
Trades tab is removed entirely for dynasty and keeper leagues rather than shown
disabled. When no league is connected the bar collapses to a single Connect
entry.

## 4.2a The landing page: the ticket window

The signed-out `/` on desktop and tablet. Its whole job is to get one string
typed.

**What it replaced.** A page that described the product beside a demo league:
a real futures board running on twelve invented teams, a rotating trade card, a
line that moved. It was the best-looking thing shipped and it sold the wrong
thing. A stranger read about Mount Olympus, which is nobody's league, and the
argument the page had to win was never "is this well made", it was "does this
know anything about MY team".

**State 1, the window.** One viewport, no scrolling. The mark at several times
the size it was, the wordmark under it, one sentence, and the field.

The headline is **"Somewhere in your league sits the championship favorite.
Odds are it isn't you."** It replaced a first attempt ("Ten thousand
simulations are about to have an opinion about your team") that sold the
machine rather than the book: a sentence a data scientist would write, walking
away from the sportsbook framing the whole product rests on.

It sets in two tiers, because the sentence has two jobs. The setup runs small,
tracked and muted; the payoff gets its own line at roughly four times the size.
Staatliches has a single weight and no lowercase, so the hierarchy is built out
of scale, tracking and colour rather than a bolder cut. That is the only lever
there is and it is enough.

Under the field, one quiet door: **My league is on ESPN**. A second door,
"Just looking?", pointed at the demo and is gone: it offered a stranger
somebody else's league at the exact moment they were deciding whether to type
their own. Then "Already have an account? Sign in" at a size somebody can
read, and one line of ticket small print in mono: "Completely free during the
beta." The other two clauses it used to carry were answering questions nobody
had asked yet: a simulation count means nothing before you have seen a number,
and "no money anywhere in this" raises the spectre of money on a screen that
had not mentioned it. Nothing else. No feature grid, no screenshots, no second
fold.

**State 2, pricing.** The book's ritual, run in place: the mark rolls (the dice
are what roll ten thousand times) and the lines cycle. Two or three seconds is
the point, not the cost. The lines are shared with the connected-league curtain
so the two cannot drift.

**State 3, their book.** The page becomes the product, pointed at their league:
their current-week matchup priced on both sides with projected points and the
win bar, their championship price at full size, and the whole title-odds table
with real leaguemates. Their row is amber and priced; every other row is a
name and a lock.

Two actions, and they are not rivals. **Create a free account** is the
conversion and stays the filled one, carrying the username through so it is
never typed twice. **Share my card** is the loop: it draws the Hub's own share
card, from the same generator, so the advert for the product looks like the
product. The person most likely to send one is somebody who just watched their
own price appear and has not committed to anything yet, and the card carries
the address into a group chat. Every card's plug bar now says the product is
free, because that is the objection it has to answer in the half second a
forwarded image is looked at.

**The doors.** ESPN opens an interstitial, never a credential field: ESPN needs
a signed-in browser session, which an account and a computer can do and a
landing page must not ask for. "Just looking?" goes to `/demo`, which the
visitor has chosen knowing it is not their league.

**Sleeper and ESPN are the only platforms this page acknowledges.**

**Shared with the phone gate.** Both screens run the identical five-state
machine in `usePeek`: connect, bootstrap, lines, the mid-sync retry, and the
failure copy. They look nothing alike and should not; they must behave
identically, which two copies would not have.

## 4.3 The Hub (`/matchup`)

The densest screen in the product; the one a returning user lands on. Verified
modules, top to bottom:

- **Futures strip** — championship price, make playoffs %, reach the final %,
  projected finish, average seed, and a title-odds sparkline for the season to
  date, with a "Your card" share button.
- **Head-to-head hero** — both teams, records, moneyline on each side,
  projected points, a win-probability bar, the spread and the total.
- **Lineup vs lineup** — your starters against theirs slot by slot, with each
  player's projection, NFL opponent and kickoff time, and a per-slot edge
  arrow. Any two of your players can be tapped to compare.
- **Bench comparison** — bench counts on both sides and the single best
  start/sit swap available to you, priced: the moneyline before, the moneyline
  after, and the win-probability delta.
- **Trades to try** — a rotating rail of concrete offers with send/get,
  points-per-week delta, an acceptance read in words ("Likely", "Coin flip",
  "Doubtful") and a "Why this trade?" explainer.
- **Suggested trades** — a compact second surface priced in title-odds delta.
- **Title odds table** — every team, ranked, with price and movement.
- **Line movement chart** — your win probability held between updates, with
  open-vs-now and a range band.

## 4.4 League (`/league`) — four views

**This week.** The full board for the current week. A playoff-swing chart
showing, per team, where their playoff odds land if they win versus if they
lose. Then a matchup card per game carrying spread, total and moneyline on both
sides, with movement arrows. A "week at a glance" summary (biggest favourite,
closest line, highest total, biggest move). Selecting any card opens a detail
panel with projected points, conditional playoff odds (now / if win / if lose),
the line-movement chart, and a title-market before-and-after list. One game per
week carries a **Game of the Week** ribbon — by definition, the game producing
the largest league-wide change in championship and playoff odds.

The **bet slip** lives here: prices on the cards are clickable, legs accumulate
into a parlay priced at fair odds, and the slip exports as a share card. Legs
from the same game are allowed; contradictory legs are refused. Spreads and
totals price at even money. The slip persists per league and per week, and each
leg keeps the price it was taken at.

**Futures.** Your projected wins, championship price, playoff probability and
league rank, then the full league table: projected wins, average seed, playoff
%, opening price, current title price and movement. Below it, a title-odds
chart with week / month / season ranges and any team tappable for comparison,
and **Your Ticket** — a futures-slip treatment of your own team showing where
your price opened, where it is now, and the multiple since.

**Season.** A luck board separating scoring from schedule: real record,
all-play record (your record against every team every week), expected W-L from
scoring, and schedule luck as the difference. Then the week-by-week season
strip — results for played weeks, win probability for future ones, colour-graded
— with a takeaway line ("Favored in N of M weeks", softest and toughest week).
Then per-week rows with opponent, result or line. Then **The Book** (league
records, which start when pricing starts and are never backfilled) and **The
Time Machine** (rewind the board to any prior week and see what has moved).

**Predictor.** Call the rest of the season game by game, optionally with
scores. Called games are treated as decided; everything else stays simulated.
The standings, playoff odds and title odds re-derive on each call, and your
title price sits pinned in the corner so you can watch it move.

*Standings* exists as a fifth view but is reachable only by URL and only for
admins.

## 4.5 Trades (`/market`) — two views

**Trade finder.** Suggested deals with send/get, acceptance percentage and
title-odds delta. Below, every manager in the league as a card showing their
record and current title price; picking one opens the best deals with that
specific manager, filterable by position.

**Build trades.** A two-sided builder. Your roster by position on the left;
pick a manager to open theirs on the right. "Price this trade" returns both
sides' title, playoff and this-week deltas. A counter-offer search exists as a
separate endpoint.

Both views are unreachable in dynasty and keeper leagues.

## 4.6 Board (`/rankings`)

Player values from the Gods' projections, in **Cards** or **Table** form,
filtered by position and sorted by board order, projected points, floor or
ceiling. The table exposes per-stat projections appropriate to the position
(pass yards and TDs for quarterbacks, receptions and receiving yards for
receivers, and so on). Scoring family follows the connected league.

## 4.7 More (`/more`)

Account, **odds format** toggle (American odds vs percentages — never both at
once), **scoring** override, league sync and reconnect, player votes, support
and bug reporting, and a labs section.

## 4.8 Connecting a league

**Sleeper** is a username. That is the entire flow: type it, pick a league if
you are in more than one, done.

**ESPN** is harder because ESPN requires an authenticated cookie pair
(`espn_s2` and `SWID`). Three paths exist:

1. **Chrome extension** ("Odds Gods ESPN Connector", MV3, `cookies` permission,
   `*.espn.com` host permission, read-only). The site detects the extension by
   postMessage and requests the session. **Built and packaged; not submitted to
   the Chrome Web Store.**
2. **Hosted login worker** — a separate Render service running Playwright that
   performs the ESPN sign-in server-side and returns the cookies. Rate-limited
   to 2 concurrent logins, queue of 10, 30-second timeout.
3. **Manual paste** — the fallback, where the user copies the cookies
   themselves.

ESPN cannot be connected from a phone browser, and the mobile screen says so
rather than offering it and failing.

## 4.9 Phone behaviour

The web layout targets a screen that can hold a whole book. Phones get a
dedicated gate instead of a cramped version.

**The window, same as desktop.** The mark, the wordmark, the same two-tier
headline, and the same field asking for the same thing in the same words:
"Your Sleeper username" and **Price my league**. Under it the same quiet ESPN
door, "Already have an account? Sign in", and "Completely free during the
beta." Then one phone-specific line about where the rest of it lives.

This screen used to be a pitch with a door in it: five value propositions and a
"See your odds" button that revealed the field. Every one of those steps existed
because a phone could not use the product, so the screen had to argue for a
laptop before it could ask for anything. A phone can use the product now.

**ESPN** opens the same interstitial the desktop page does, and never a
credential field. It used to be one grey line saying that one needs a laptop,
which is a door with no handle on it.

**Sign in** was missing entirely, on the screen every returning visit starts at,
and `/signin` was gated on phones so a link would not have worked anyway. Both
fixed: a signed-in phone gets the Hub, so the account being asked for buys
something on the device it is asked on.

**What comes back, top to bottom:**

1. **One whole matchup, priced and unlocked.** The current week's head to head:
   both teams, records, the moneyline on each side, projected points, and a win
   probability bar. Real numbers from their real league. This is the part that
   earns the rest: a championship price on its own is one number from a machine
   nobody has watched work, so the locks under it are asking for an account on
   trust. A priced game against a manager they know is the product doing the
   thing it claims to do, before anything is asked of them.
2. **Their championship price**, at the largest size on the screen.
3. **The pitch for what is behind the lock**, in two sentences.
4. **The rest of the league by name**, every price behind a lock icon. Names
   shown, because a list of nobody proves nothing; prices hidden, because that
   is the thing being sold. You can count the rows and see exactly what an
   account buys.
5. **Create a free account**, which carries the username through so it is never
   typed twice, then: "The full book opens on a laptop or desktop. Free during
   the beta."

**Units on the gate:** American odds only. The win bar carries the only
percentage on the screen and there is no price beside it, so the reader is
never asked to reconcile two numbers.

**Signed in, a phone gets the Hub.** Not the desktop layout reflowed: a
one-column short version with the three questions somebody opens the app on a
phone to answer, each of them one number. This week priced on both sides, the
season in a championship price plus playoff odds, projected finish and average
seed, and the full title board with their row in amber. A share card, and one
line at the bottom saying where the rest is. The league name is the switcher
when the account holds more than one league, and a plain label when it does
not.

Deliberately absent, each for its own reason: **trades** (a decision made with
two rosters open), the **start/sit swap** (needs the lineup beside it), the
**line-movement chart** (a thirty-point sparkline in a 340px column is a
smudge), and **lineup vs lineup** (the most desktop-shaped thing in the
product). Guarded by a test, because the list of what is left out is a product
decision rather than an unfinished screen.

**Mid-sync:** a league whose projections have not landed is waited for, not
guessed at. See §8.

**Dynasty and keeper leagues** carry a dismissible note at the top of every
screen saying trade pricing is off and that player values are scoped to this
season. See §8.

**The handoff.** `/signin` is the one route exempt from the phone gate, and only
when it arrives carrying `?sleeper=`, which nothing but the peek's button sets.
A bare `/signin` on a phone still gets the pitch: the objection to showing a
phone a sign-up form was never about the form, it was about the order. Somebody
arriving cold has been given nothing yet. Somebody arriving from the peek has
watched their own league get priced. The username rides the URL (so the handoff
survives a device change) and localStorage (so it survives the sign-up itself),
and the connect screen consumes it on read.



## 4.10 Cross-cutting UI systems

- **Odds format** is global and exclusive: American odds or percentages, never
  both on screen at once.
- **Colour semantics** are enforced: amber is you, brand, CTA and selection;
  green and red mean favoured/underdog and positive/negative movement, and are
  used for nothing else.
- **Share cards** are generated on canvas at 1080x1350 (the parlay card's
  height is computed from leg count), each carrying the plug bar.
- **Pricing curtain** — a themed loading state rotating through "Setting the
  line", "Balancing the book" and similar, shown once per session.
- **Design fixtures** — `/design/:scene` renders any real page against a fixed
  fixture league, so layout can be tested deterministically. This is what the
  rendered test suite drives.

---

# 5. Back end

## 5.1 Shape

A single Express 5 server (Node 22) that serves the built SPA and brokers every
piece of provider traffic. **The browser never calls Sleeper or ESPN
directly.** Frontend is served from a CDN at `oddsgods.net`; the API answers on
its own Render address.

```
browser ──▶ Express ──▶ provider adapter ──▶ Sleeper / ESPN
                 │
                 ├─▶ pricing engine (Monte Carlo)
                 ├─▶ projections store (xlsx imports)
                 ├─▶ line store (history on disk)
                 └─▶ Supabase (auth, scouting, agreement)
```

## 5.2 The pricing engine

`server/engine/engine.js`, ~3,000 lines. Franco owns it; the frontend performs
display transforms only and never computes a probability.

**Inputs per matchup:** both rosters' starters plus the user's bench for swap
pricing, a per-player projection (mean and standard deviation) from the active
import, and the league's scoring family.

**Simulation counts, as they actually are in the code:**

| Purpose | Sims |
|---|---|
| Matchup lines | 10,000 |
| Season futures and movers | 10,000 |
| Every trade evaluation | 4,000 |
| Live in-game futures | 2,500 |

Matchup lines are a Monte Carlo over truncated-normal player scores. Lineup
swap deltas use an analytic normal approximation — exact under the same model,
and fast enough to keep a full-league recompute under two seconds. Title odds
are derived as playoff probability times strength share among playoff teams, a
documented simplification.

Every trade surface — finder, analyzer, counter-offer search — runs at the same
sim count and seed with common random numbers, so a given trade prices
identically everywhere it appears.

Outputs carry an `inputsHash` so any movement between two snapshots is
attributable.

## 5.3 Live mode

Separate path, separate maths. `server/live/liveEngine.js` runs a 30-second
loop that scrapes the NFL scoreboard once and recomputes a live overlay per
registered league. Matchup win probability is **closed form**, not simulated:
each team's total is a normal, win% is the normal CDF of the difference. It is
time-aware — a player's mean converges toward their actual score and variance
shrinks as their game clock runs — so the number updates by the play and lands
exactly on the decided outcome at final.

The reason for two engines is a product one: you cannot run ten thousand sims
per play, and a number that lags on Sunday afternoon is worse than a simpler
number that is genuinely live.

Live mode is **admin-toggled**, not automatic. Off, the module does nothing.

## 5.4 Provider layer

`server/providers/leagueProvider.js` defines the contract; nothing outside
`server/providers/` may reference provider-specific endpoints or id formats.
Every method returns provider-agnostic shapes. Sleeper and ESPN implementations
sit behind it.

Sleeper league summaries carry `previousLeagueId`, which is the only thread
back through a dynasty chain (Sleeper issues a new league id every season).
`server/leagueSuccession.js` walks that chain — bounded at six steps, with a
visited set so two leagues naming each other terminate — to find this season's
league and offer a one-click switch.

## 5.5 Projections

Six `.xlsx` files under `projections/` (QB, RB, WR, TE, K, DEF) currently
totalling **415 players**: 63 QB, 96 RB, 128 WR, 64 TE, 32 K, 32 DEF. Each row
carries per-stat projections and, crucially, a **point, floor and ceiling in
three scoring formats** (PPR, half-PPR, standard) — which is what lets the same
import serve leagues with different settings.

Admin flow: upload → preview with name-match reconciliation → confirm → import
→ activate. Confirmed name matches persist so the same reconciliation is not
re-done every week. There is also an "agreement" layer (a consensus/adjustment
tilt) with its own store and export.

## 5.6 Scouting

Harvests transaction and roster events from Sleeper and ESPN into Supabase, and
derives per-manager signals weighted by league format (redraft 1.0, keeper 0.5,
dynasty 0.25). Combined with the two subjective reads the user sets themselves
— trade-friendliness and relationship — this feeds the trade acceptance model.
Superlatives are derived per league.

## 5.7 Storage and persistence

- **Supabase** — auth (email and password), plus tables for scouting harvest,
  league agreement and league names. Three migrations.
- **Persistent disk on Render** (1 GB, mounted at `server/data`) — projection
  imports, confirmed name matches, line history, the daily player-catalog
  snapshot, and bug reports. Without the disk these are wiped every deploy.
- **localStorage** — the connected league, model overlay, per-manager trade
  reads, dismissed trade suggestions, the bet slip, and labs flags. Every read
  and write is guarded, since storage throws outright in private windows and
  some embedded webviews.

## 5.8 Operational discipline

- **TTL cache** over all provider calls, with call accounting from day one so
  aggregate volume can be watched against Sleeper's guidance of under 1,000
  calls per minute per IP. Exposed at `/api/metrics`.
- **Errors distinguish upstream from ours.** A provider timeout returns 502
  with "the league provider did not respond"; a bug in our own mapping returns
  500 and says so. They used to be indistinguishable, which sent debugging to
  Sleeper's status page for our own faults.
- **Fingerprinted assets** cached for a year, everything else briefly.
- **CORS** is mounted before every route and before any body parser.
- **Build stamp** compiled into the bundle so a device can say which build it
  is running.

## 5.9 API surface

Roughly fifty endpoints. The load-bearing ones:

**Connect and identity** — `GET /connect/:username`, `GET
/espn/connect/:leagueId`, `POST /espn/login/start`, `GET /state`, `GET
/league/:id/successor`

**Pricing** — `GET /league/:id/bootstrap`, `GET /league/:id/lines`, `GET
/league/:id/forks`, `GET /league/:id/projected-scores`, `GET
/league/:id/line-history`, `POST /league/:id/refresh`

**Trades** — `POST /league/:id/trade`, `/trade-analyze`, `/trade-counter`,
`/trade-suggestions`, `/trade-rationale`

**Season** — `POST /league/:id/predictor`, `GET /league/:id/schedule`,
`/matchups/:week`, `/transactions/:week`, `GET|POST
/league/:id/playoff-settings`

**Scouting** — `POST /scouting/harvest`, `GET /scouting/league/:id`, `PUT
/scouting/edits/:id/:managerKey`, `GET /scouting/league/:id/superlatives`

**Projections** — `GET /projections`, `/projections/consensus`,
`/projections/agreement/*`, `GET /rankings`

**Admin** — projection preview/confirm/import/activate, `POST /admin/reprice`,
`POST /admin/live`, bug reports

**Ops** — `GET /health`, `/metrics`, `/live/status`, `/nfl/schedule`, `POST
/telemetry/event`, `POST /support/bug-report`, image proxy at `/img/*`

## 5.10 Platforms

- **Web** — the primary and only complete surface. Desktop and tablet.
- **Phone web** — the gate plus the league peek. Deliberately limited.
- **iOS** — Capacitor 8 wraps the same bundle, pointed at the production API.
  Builds and runs; not submitted to the App Store.
- **Chrome extension** — built, packaged, not submitted.

## 5.11 Testing

**71 test files** run under `node --test`. Roughly half are rendered browser
tests driven by Playwright against the design fixtures; the rest are unit
tests. Alongside them: `tsc -b` as the real typecheck, an ESLint pass, a brand
check, a CSS token check, a CSS brace-balance check, and a copy scan that reads
JSX comments as UI text and enforces the product's language rules.

---

# 6. Business model

**Today:** free during the beta. Worded that way everywhere on purpose — free
that will not always be free — so introducing a price later is not a betrayal.

**Direction, not yet committed:**
- Free tier keeps the hook and the loop: your odds, your league, the share
  cards. The cards should probably never be paywalled, since they are the
  acquisition channel.
- Paid unlocks depth: full league pricing, the predictor, trade pricing.
- Seasonal rather than monthly, because fantasy is a seventeen-week spike and a
  monthly subscription bleeds churn in February.
- Likely per-league or commissioner-pays, since one commissioner brings eleven
  other people.

**Acquisition:** mobile social, and share cards forwarded into league group
chats. The product is desktop-first and the advertising is phone-first, which
is the central go-to-market tension and the reason the phone gate is a pitch
with a door rather than a wall.

---

# 7. Substantiated claims

**Marketing may print these.** Each has been verified against the running
product, not against documentation. Anything not on this list needs verifying
and adding before it is used.

| Claim | Verified as |
|---|---|
| "Priced like a sportsbook" — moneyline, spread and total on every matchup | Yes, League → This week |
| "Championship odds for every team, moving all week" | Yes, Futures view plus 6-hourly repricing |
| "10,000 simulations per matchup" | Yes, `MATCHUP_SIMS` |
| "10,000 season simulations" | Yes, `SEASON_SIMS` |
| "Works with Sleeper and ESPN" | Yes, both providers implemented |
| "Connect with just a Sleeper username" | Yes |
| "Trades priced from both sides" | Yes, both sides' title delta returned |
| "Tells you whether he'll accept" | Yes, acceptance probability on every suggestion |
| "Call the rest of the season and watch the bracket move" | Yes, Predictor |
| "Parlay your own league at fair odds" | Yes, bet slip |
| "No money, no wagering" | Yes, nothing in the product accepts a stake |
| "Free during the beta" | Yes |
| "Read-only access to your league" | Yes, no write path to any provider |
| "See your own matchup priced, with no account" | Yes, on the landing page and the phone gate |
| "One Sleeper username. No card, no account to look" | Yes |

**Do not print:**

- Any user, traction, retention or conversion figure. There are none.
- "Available on iPhone" or "in the Chrome Web Store." Neither is submitted.
- Any claim about dynasty or keeper trade pricing. It is deliberately absent.

---

# 8. Known drift and open items

## Closed by the pre-launch punch list

1. **`/demo` rendered a blank screen for anyone signed in.** ~~Open.~~
   **Fixed.** The signed-in route tree had no `/demo` and no catch-all at all,
   and a React Router `<Routes>` with nothing to match renders *null*: no error,
   no redirect, a page painted in the background colour. The bug was never
   really about `/demo`. Any typo, any stale bookmark, any renamed route did the
   same thing silently. Both trees now answer for `/demo` and both send unknown
   paths somewhere real. `test/routeCoverage.test.mjs` reads the route table
   itself, because the signed-in tree cannot be rendered without a real session,
   which is exactly how the gap survived a suite this size.
2. **The landing page understated the engine.** ~~Open.~~ **Fixed.** It read
   "5,000 per matchup" against a `MATCHUP_SIMS` of 10,000. The engine's own
   header comment (futures at "2,000-sim") and a comment in the distributions
   chart ("5,000-run sample") were stale in the same direction.
3. **A debug line shipped in the trade finder UI.** ~~Open.~~ **Fixed.** The
   funnel counts now go to the console. They are worth having when a league
   legitimately finds no deals; they are not worth showing a stranger.
4. **The Board could render as a silent empty screen.** ~~Open.~~ **Fixed, as a
   guard.** Production is healthy (`available: true`, 346 of 415 matched,
   agreement-weighted), so this was local-only: a clean checkout has no
   confirmed name matches on disk. The Board now distinguishes "the source has
   nothing" from "your filter matched nothing" rather than sending someone to
   clear filters they never set.
5. **The mobile peek's CTA had no destination.** ~~Open.~~ **Fixed.** See §4.9.
6. **Provisional pricing showed confidently wrong numbers.** ~~Open.~~
   **Fixed, and it was not what it looked like.** The reported hero at -311
   that "repriced" to +169 was not the engine and not the provisional line: both
   were frames of the loading placeholder, which drew random magnitudes between
   105 and 365 with a random sign, i.e. exactly the range real prices live in.
   It was built that way on purpose ("a book's board does not sit still while it
   works") and the reasoning was sound about a static placeholder reading as
   broken. It was wrong about the cost: a placeholder that impersonates a price
   gets screenshotted as one, and the book looks like it changed its mind by
   five hundred points. It is now a dash, with the motion carried by opacity.
   The win bar, spread, total and every projection are dashed in the same state,
   because three surviving numbers next to a dash read as the parts that are
   known, and none of them is.
7. **No rate limiting on the unauthenticated pricing path.** ~~Open.~~
   **Fixed.** A fixed window, 20 requests per IP per minute, on
   `/connect/:username`, `/league/:id/bootstrap` and `/league/:id/lines`. Those
   three are everything the phone gate touches and the only expensive routes a
   stranger can reach without an account. `trust proxy` is now set, without
   which `req.ip` is the proxy for every request and the limiter counts the
   entire internet as one visitor, refusing real people during exactly the spike
   it exists to survive.

## Found on the way, and fixed

8. **The Hub priced both teams as the favourite.** The opponent's moneyline was
   derived by subtracting a delta measured in odds-space from a baseline price.
   American odds are not linear, so the result was not the price of anything;
   at baseline the delta is zero and it looked correct, so it only went wrong
   once somebody changed a lineup, which is the entire point of that screen.
   From -260/+210 a swap could produce two underdogs in one game, and the demo
   is a marketing destination. It is now converted from the opponent's win
   probability, which cannot break the invariant: the two probabilities sum to
   100, so exactly one side is above even money. Extracted to
   `src/utils/matchupSides.ts` and unit tested.
9. **The phone peek blamed the user for a league that was merely syncing.** With
   pricing unavailable the futures list is empty, the user is not found in it,
   and the screen said "we found your league but could not find your team in
   it". Untrue, and on the surface most paid traffic lands on. It now waits
   (six tries, two seconds apart) and, if the import really is stuck, says the
   league is still being priced.
10. **`NO_VALUE`.** The two copy checks disagreed about a bare dash: `copyScan`
    exempts it by design, `brand-check` has no exemption and scans a fixed file
    list, so the identical literal was legal in one component and a failure in
    its neighbour. The mark now has one definition in `formatOdds.ts`, which is
    where a shared product convention belonged anyway.

11. **The season is followed automatically, not offered.** A dynasty or keeper
    league whose season has rolled over is switched to the current one on load:
    we know what season it is, Sleeper's chain is public, and there is nothing
    for a person to decide. Asking someone to confirm the repair is asking them
    to approve a fault they did not cause. It leaves a short amber receipt
    naming the league it moved to, because a board that silently fills with
    different teams is indistinguishable from a bug. The receipt lives in
    sessionStorage, since switching leagues remounts the component that set it.
    The loud red warning survives only for a league nobody has rolled over yet.
12. **The shell's notice strip was invisible, for the second time.** It was
    sticky at the header's height, which double-counts the header because the
    scrollport already starts below it: the strip reserved its slot at the top
    of the content and painted itself 80px lower, behind the Hub's own sticky
    season band, which had the same z-index and came later in the document. The
    user saw an empty gap and no message, which is exactly what it looks like.
    It is now a single fixed strip (`ShellNotices`) that measures itself and
    publishes `--shell-notice-height` so the shell can pad the content. The
    Hub's band keeps `top: 0`, which is already correct because a sticky offset
    measures from the scrollport's padded content box; offsetting it again by
    the strip's height was what left a band of empty page under the notice.
13. **Dynasty leagues now say what they are missing.** Trades are hidden in
    these leagues and that call stands, but hiding a tab explains nothing. An
    amber, dismissible note says trade pricing is off until the engine can
    value picks and future seasons, and that every player value and ranking is
    for this season alone. Amber rather than red: a healthy league on a
    supported path is not an alarm, and an alarm that fires on one teaches
    people to stop reading alarms.
14. **The pricing placeholder is back, in costume.** Removing the churn was the
    wrong fix for the right diagnosis. The reported "-311 repricing to +169"
    really was two frames of the loading state, but the fault was never the
    movement: it was that every frame drew a real-looking magnitude in the same
    face and colour as a settled price. A frozen board reads as broken, so the
    churn is the design. It now runs dimmed and in the mono face rather than
    the display face every real price uses.

20. **The landing page is the ticket window.** See §4.2a. Two engineering
    notes ride with it: `GET /connect/:username` is now cached for five
    minutes, because `/` is the first thing every ad click touches and the
    lookup is three upstream calls; and the anonymous funnel fires telemetry
    (view, username submitted, priced, account-create clicked, and each door),
    since peek-to-signup is the headline metric and the ESPN door's click rate
    is what says how urgent the Chrome Web Store submission is.
21. **`brand-check` is not in `npm test`.** It is a separate script, so a stale
    file path in its target list (which the landing rewrite created) fails only
    when someone runs it by hand. Worth folding into the suite.

22. **A dynasty league was offered twice, a year apart.** The username lookup
    merges this season and last on purpose (Sleeper's idea of the current
    season can lag in the off-season), and Sleeper does not roll a dynasty
    league forward: each season is a new league with the same name. So a
    dynasty manager saw two identical entries and no way to tell which was
    current. `visibleLeagues` now drops any league another league in the list
    replaced, using `previous_league_id`, which both ends of are already in
    hand, and then shows only the current season **when there is one**. The
    blunt season filter alone would have resurrected the off-season bug the
    merge exists to solve.
23. **The dynasty scope note reached the app but not the funnel.** Both
    anonymous screens render above the app shell, which is where the note
    lives, so a dynasty manager arriving from an advert saw trade and ranking
    claims that do not apply to their league. The peek and the landing book now
    carry a short version, and the pitch beside it drops the trade-finder
    sentence in those leagues: saying "trade pricing is off" and "plus a trade
    finder" two sentences apart is the product contradicting itself on the
    screen where it is asking to be believed.
24. **The sign-up exemption disabled the phone gate for the whole visit.**
    `useIsPhone` read `window.location` once in an effect with no dependencies,
    which was fine while every exemption was a property of the visit. The
    sign-up exemption is a property of one path, so a phone that reached
    `/signin?sleeper=` and then navigated got the entire desktop app, which is
    the outcome the gate exists to prevent, through the door added to help
    them. It now reads the router and re-evaluates on every route, in both
    directions.

## Still open

15. **`server/engine/leverage.js` is not wired to a route.** The file documents
    this itself, along with the reason and the two ways through, both Franco's
    call.
16. **The demo is Hub-only.** Clicking League, Trades or Board from `/demo`
    still bounces to the sign-up wall. That is now deliberate rather than
    accidental: the wall says "Sign in to open the full book" instead of
    silently swapping in a form.
17. **Not shipped:** Chrome Web Store submission, App Store submission, and a
    `/parlay` engine endpoint for exact same-game pricing.
18. **The rate limiter is per instance.** In memory, so the real ceiling is
    20/min x instances. Worth knowing rather than a reason to reach for a
    shared store on a service running one box.
19. **Full dynasty support.** Pick and future-season valuation is the missing
    piece, and until it exists the note in 13 is the honest position.
