# Olympus — Product Audit & Market Research

_June 2026. Combines a 2025–26 competitive sweep with a read of the current build._

---

## 0. What Olympus is

**Olympus is the honest internal book for your own fantasy league. Nobody bets. No money moves.**
The sportsbook vocabulary — moneylines, spreads, win %, title odds — is just the clearest, least
hand-wavy language for *"how good is my team, and is this decision actually good?"* The book is a
**mirror, not a casino.** The whole value is truth: it tells you when you're a dog, when a trade is
bad for you, when a start/sit actually swings your week — priced, not vibed.

This was the purpose from day one. It is not a position to discover or pivot to.

**Why the incumbents can't take it:** ESPN shipped a "Find a Bet" icon that pushes your roster into an
ESPN BET slip, and Sleeper is launching **Sleeper Markets** (a real-money prediction exchange). Both
point you *outward* to a real wager. Olympus does the opposite — it prices your league *for you*, to
tell you the truth, with no other side of the trade. The brand asset is **trust**, and they're
structurally barred from it because they make money when you bet.

---

## 1. Why it feels static (the real diagnosis)

The engine computes a **snapshot** and the UI renders it. Every screen is a correct number that just
sits there. But an honest book is only honest if it's **current** — your team's truth changes the
moment a starter is ruled out, and a frozen number is quietly lying to you. Four missing dimensions:

1. **No time / no delta.** We have `lineHistory` server-side but the hero shows a single ML.
   There's no "you opened at −120, you're +154 now," no tape, no "since you last looked."
2. **No reason attached to a move.** A line that moves because *CMC got ruled out* is the book being
   honest about new information. A line that's just correct-as-of-some-moment is a spreadsheet.
3. **No way to be told the truth changed.** When your number moves, the book should be able to tell
   you — not as an engagement hook, but because the honest answer to "how's my team" is now different.
4. **No live in-game layer.** ESPN now ships live in-game projections on the matchup screen.
   On Sundays your team's real truth is changing by the minute and our book is frozen.

**Fix the feeling by keeping the book current: the number moves, with a reason, as your league changes.**
That single theme (repricing + delta + reason) is worth more than any new tab.

---

## 2. What's fluff — cut, fold, or make it earn its place

- **Rankings tab.** Consensus rankings are pure table stakes and off-thesis — Sleeper/ESPN/FantasyPros
  all have them and they don't price *your* league. It dilutes the "we price your decisions" story.
  **Fold rankings into the player detail / start-sit context; drop the standalone tab** (frees a slot
  in the 5-tab bar for something on-thesis like "Live" or "Moves").
- **"Market movers" waiver block.** Useful signal, but presented as a generic list it reads like every
  other waiver tool. Keep the compute; **reframe each row as a line move** ("Aubrey: +8.9 pts/wk →
  your title odds +1.4%") so it ladders into the honest-book story instead of being a side list.
- **Corny verdict copy.** _(Already removed this session.)_ A book doesn't cheerlead. Numbers carry it.
- **Static season title-price chart.** It's a nice artifact but it's a flat history. It earns its keep
  only once it animates/updates with a delta and a reason (see §4).
- **Draft tools (offseason).** Correctly parked — leave parked, don't invest until August.

---

## 3. What to make better (existing surfaces)

- **Matchup hero** — add the **line delta + sparkline** ("−120 → +154 this week") and, on Sundays,
  **live win probability**. This is the flagship screen; it should be the most alive.
- **Start/Sit ("Who do I start?")** — strongest, most differentiated feature. Lead with the
  **win-prob swing**, not the projection. _(Compare is now any-similar-position, good.)_ Next: show
  the swing as the headline number on each candidate, and a one-line "why" (matchup, ceiling/floor).
- **Trade Command Center** — the **honest decline read** is the moat. Make "decline this — it drops
  your title odds 5 pts" a first-class, unmissable verdict, not a band. Tie every trade to a
  **title-odds delta**, not just pts/wk.
- **Season futures** — make them **move weekly with a delta and a reason** ("title odds 14% → 21%
  after the Henry trade"). Static futures are commodity; narrated, moving futures are not.
- **Sync trust** — incumbents (ESPN, Sleeper, Yahoo) all had **live-window outages in 2025**. "Fast,
  always up, reprices in seconds" is a real wedge. Protect it; make uptime a feature we talk about.

---

## 4. New features to differentiate (prioritized)

| # | Feature | Why it wins | Effort/Impact |
|---|---|---|---|
| 1 | **Repricing + delta + reason on the hero** (line moved X→Y because injury/news) | Keeps the book honest hour to hour; fixes "static" | Med / **High** |
| 2 | **Tell the user when their truth changed** ("you're now the underdog — CMC out") | The book reaching out because the honest answer changed, not for engagement | Med / **High** |
| 3 | **Start/Sit as a win-prob swing, headline** | The unfilled projection→decision gap; already our best feature | Low / **High** |
| 4 | **Honest "decline this trade" verdict tied to title-odds delta** | Trust moat; trade tools only do "fairness" | Low-Med / **High** |
| 5 | **Live in-game win probability (Sundays)** | Table stakes ESPN now meets; we don't | Med-High / High |
| 6 | **Honest post-week post-mortem** ("you were a 78% favorite and lost — here's the variance") | The book being truthful about luck vs. process, not a growth gimmick | Low / Med-**High** |
| 7 | **Cross-league portfolio view** (now that multi-league exists) — shared player exposure, combined title odds | Genuine white space; targets the multi-league power users who pay | Med / Med-**High** |
| 8 | **Rivalry odds** with head-to-head history | League-native FOMO without a wallet; viral in-league | Low-Med / Med |
| 9 | **Sharp-vs-square self-grading** (were your start/sit calls +EV this season?) | Turns the app into a season-long scorecard; original framing | Med / Med |

The through-line: **1, 2, 4, 6 all express "the honest book."** Build that cluster before anything wide.
Multi-league (shipped this session) is the unlock for **#7** — lean into it.

---

## 5. Competitive landscape (sources)

- **ESPN (2025 rebuild):** live in-game projections on matchup + roster; **"Find a Bet" → ESPN BET slip**;
  but widely panned as **slow/buggy with live-window outages**. → live projections are table stakes;
  reliability is a wedge. ([ESPN Press Room](https://espnpressroom.com/us/press-releases/2025/08/espn-fantasy-football-30th-anniversary-new-design-new-features-all-new-fantasy-app-for-2025/))
- **Sleeper:** launching **Sleeper Markets** (event-contract exchange priced like implied probability) —
  moving to "price outcomes like a market," but as real-money trading, not league advisory.
  Reliability complaints on opening night. ([RotoGrinders](https://rotogrinders.com/best-prediction-market-apps/sleeper-markets))
- **Yahoo:** little new; notable for an outage + public apology.
- **FantasyPros (the price anchor):** Start/Sit Assistant, Trade Analyzer, My Playbook; **$3.99–$8.99/mo
  annual** ($11.99–$22.99 monthly); tiers gate **league count** (2 / 10 / 50). Decision layer is still
  "is this trade fair," never "this moves your title odds." ([FantasyPros plans](https://www.fantasypros.com/premium/plans/bp/))
- **Subvertadown:** closest philosophical cousin — probabilistic, ceiling/floor, ties to betting lines;
  but narrow (QB/DST/K) and not league-synced. ([subvertadown.com](https://subvertadown.com/))
- **DFS / pick'em (PrizePicks, Underdog, Betr, Sleeper Picks):** define modern "alive" — PrizePicks'
  **"The Feed"** (Oct 2025): see lineups lock in real time, one-tap copy, reactions, shareable receipts.
  Borrow the *social-proof + receipts* mechanics; skip the real-money loop (off-thesis, regulatory).
  ([PrizePicks press](https://www.prizepicks.com/press-news/prizepicks-unveils-new-social-features-with-launch-of-the-feed))

---

## 6. Monetization

Proven willingness-to-pay for a season-long *tool* is the **FantasyPros band: ~$30–$70/season**.

- **Free** synced-league tier (1 league) → acquisition.
- **Season pass ~$20–40** → multi-league, push alerts, live in-game odds, portfolio view, history.
- **Commissioner / league group-buy** → built-in acquisition (one buyer brings 10–12 managers).
- **Avoid** real-money entry fees — off-thesis (we're the *honest* book) and regulatorily heavy.

---

## 7. Recommended next sprint (the "alive + honest book" cluster)

1. **Hero repricing**: surface `lineHistory` as a delta + sparkline on the matchup hero; attach a reason string.
2. **Decline-this-trade verdict**: promote the honest accept/decline read, expressed as a title-odds delta.
3. **Start/Sit swing-first**: make the win-prob swing the headline on each compared player.
4. **Honest post-week post-mortem**: truthful read on whether you lost to variance or to a bad call.
5. _(Infra)_ **Tell the user when their number moves** — so the book's truth reaches them between sessions.

These all serve one purpose — *an honest book about your own league: truthful, current, and on your side* —
which is the one thing ESPN BET and Sleeper Markets structurally can't be, because they profit when you bet.
