# User-facing copy audit, 2026-10-08

Read-only pass over every heading, subtitle, helper line, empty state and
tooltip the app can render, judged against the humanizer and clarify skills.
Nothing was edited.

Scope: every string a signed-in or signed-out user can see in `src/`. Strings
in components that nothing imports (listed at the end) were skipped, as were
server-generated prose (coach, trade rationale) and the admin projections page.

The three types the brief asked for are tagged in the "What's wrong" column:

- **(1) Slogan**: a fragment that says nothing.
- **(2) Narrates**: a subtitle or helper line that restates what the screen shows.
- **(3) Internals**: explains how the app works or uses build vocabulary
  (leg, scan, sim, engine, sheet, session, context, import, run).

Other rows are plain humanizer or clarify findings. "Delete" is used wherever
the user loses nothing without the line.

| Count | |
|---|---|
| Lines flagged | 119 |
| Delete | 26 |
| Shorten | 35 |
| Rewrite | 58 |
| Type 1 slogans | 10 |
| Type 2 narration | 14 |
| Type 3 internals | 54 |

A line can carry two types, so the type counts overlap.

## Landing, phone gate and sign-in

| Screen | Line | What's wrong | Recommendation |
|---|---|---|---|
| Landing, after pricing | "The whole book opens when you do. Free during the beta." [LandingPage.tsx:412](../src/pages/LandingPage.tsx:412) | (1) "opens when you do" is a pun on account creation that the button above already makes. | Shorten to "Free during the beta." |
| Landing, phone peek | "The rest of the book is open. Moneylines, spreads and totals on every matchup..." [LeaguePeek.tsx:186](../src/components/layout/LeaguePeek.tsx:186) | First sentence contradicts the locked rows directly under it. The list that follows is the pitch and earns its place. | Rewrite first sentence: "Behind the locks: moneylines, spreads and totals on every matchup, title odds that move all week, and a bet slip for your own league." |
| Landing, ESPN door | "It takes about two minutes and needs a computer, because ESPN requires a signed in session. Worth it." [LandingPage.tsx:214](../src/pages/LandingPage.tsx:214), [MobileGate.tsx:139](../src/components/layout/MobileGate.tsx:139) | (3) "signed in session". "Worth it." is a one-line closer. | Rewrite: "About two minutes, on a computer: ESPN needs you signed in there." |
| Phone gate | "The short version fits a phone. Trades, the predictor and the bet slip open on a laptop." [MobileGate.tsx:103](../src/components/layout/MobileGate.tsx:103) | (2) First sentence narrates the screen the reader is on. | Shorten: drop the first sentence. |
| Phone Hub | "This is the short version. Trades, the predictor, the bet slip and the full board open on a laptop at oddsgods.net." [MobileHub.tsx:319](../src/components/layout/MobileHub.tsx:319) | (2) Same. | Shorten: drop the first sentence. |
| Sign-in, log in tab | "Welcome back. Your leagues are waiting." [AuthLanding.tsx:196](../src/pages/AuthLanding.tsx:196) | Filler. | Delete the second sentence, or the line. |
| Sign-in, Connect, More build line | "· native sign-in ready" [AuthLanding.tsx:205](../src/pages/AuthLanding.tsx:205), [ConnectPage.tsx:143](../src/pages/ConnectPage.tsx:143), [MorePage.tsx:290](../src/pages/MorePage.tsx:290) | (3) Build vocabulary on three user screens. The bug report already carries it. | Delete. |

## Connect a league

| Screen | Line | What's wrong | Recommendation |
|---|---|---|---|
| Connect | "Sync a league to begin" [ConnectPage.tsx:101](../src/pages/ConnectPage.tsx:101) | "Sync" here, "Connect" on every button and the Sleeper wizard. One verb per concept. | Rewrite: "Connect a league to begin". |
| Connect, re-check notice | "Pick your team again. ESPN leagues linked before today could be matched to the wrong manager when somebody else had already connected the same league. Reconnect and choose your own team; it will stay put after that." [ConnectPage.tsx:107](../src/pages/ConnectPage.tsx:107) | (3) Explains the bug's cause. "Before today" rots. | Rewrite: "Pick your team again. Some ESPN leagues were matched to the wrong team. Reconnect and choose yours." |
| Sleeper wizard | "One username. Your whole league, priced." [ConnectWizard.tsx:124](../src/components/league/ConnectWizard.tsx:124) | (1) Slogan under a kicker that already says "Connect your league", above a field labelled "Sleeper username". | Delete. Promote the kicker to the heading. |
| Sleeper wizard | "Sleeper connects here by username. ESPN starts from the provider chooser." [ConnectWizard.tsx:158](../src/components/league/ConnectWizard.tsx:158) | (3) "provider chooser" is our name for the previous screen, which has a Back button. | Delete. |
| Sleeper wizard | "Tick the ones you want here. The rest stay out of your way, and you can add or remove any of them later." [ConnectWizard.tsx:170](../src/components/league/ConnectWizard.tsx:170) | Three clauses for one idea. | Shorten: "Tick the leagues you want. You can change this later." |
| Sleeper wizard | "Read-only. We never ask for your Sleeper password. Odds Gods prices your league, it can't touch it." [ConnectWizard.tsx:252](../src/components/league/ConnectWizard.tsx:252) | Third sentence is a closer restating the first. | Shorten: drop the third sentence. |
| Sleeper wizard | "This league hasn't drafted yet. It connects fully after your draft. Until then you'll see league settings and members only." [ConnectWizard.tsx:292](../src/components/league/ConnectWizard.tsx:292) | Middle sentence restates the third. | Shorten: "This league hasn't drafted yet. Until it does you'll see settings and members only." |
| Sleeper league picker | "{name} is in {n} on Sleeper. Tick the ones you want to see here. You can come back and change this any time." [SleeperLeaguePicker.tsx:124](../src/components/league/SleeperLeaguePicker.tsx:124) | "is in 4 on Sleeper" is missing its noun. Third sentence is long. | Rewrite: "{name} is in {n} leagues. Tick the ones you want here; you can change this any time." |
| ESPN connect | "Bring your ESPN league in." [EspnConnect.tsx:435](../src/components/league/EspnConnect.tsx:435) | (1) Title under a kicker that already says "Connect ESPN". | Delete. Promote the kicker. |
| ESPN connect, ready | "The connector is installed and your ESPN session is live in this browser. We read the league above and match your team automatically." [EspnConnect.tsx:512](../src/components/league/EspnConnect.tsx:512) | (3) "session is live in this browser". | Rewrite: "The connector is installed and you're signed in to ESPN. Connect, and we'll find your team." |
| ESPN connect, sign in | "The connector is installed. Sign in on ESPN's own site, in any tab, and come back. Your password never touches Odds Gods, and this page notices on its own." [EspnConnect.tsx:531](../src/components/league/EspnConnect.tsx:531) | (3) "this page notices on its own" describes mechanism. Privacy clause repeats on every card. | Shorten: "The connector is installed. Sign in at ESPN.com in any tab and come back." |
| ESPN connect, add connector | "ESPN keeps your sign-in in a cookie no website may read. A small Chrome add-on hands that one cookie over, read-only. Five seconds, once, ever. Your ESPN password is never involved." [EspnConnect.tsx:544](../src/components/league/EspnConnect.tsx:544) | (3) "cookie" twice. "Five seconds, once, ever." is a fragment row. | Rewrite: "Private ESPN leagues need a small Chrome add-on that shares your ESPN sign-in with us, read-only. One-time setup. Your password is never involved." |
| ESPN connect, add connector | "This page notices the moment it is installed. Nothing to reload." [EspnConnect.tsx:564](../src/components/league/EspnConnect.tsx:564) | (3) Mechanism. | Shorten: "No need to reload after installing." |
| ESPN connect, password fallback | "We can sign in to ESPN for you instead. Your password is used once, stored nowhere, and kept out of our logs. The connector is the better path if you can use it." [EspnConnect.tsx:594](../src/components/league/EspnConnect.tsx:594) | (3) "kept out of our logs". Third sentence argues with a choice the reader already made by opening the disclosure. | Shorten: "We can sign in to ESPN for you. Your password is used once and never stored." |
| ESPN connect, phone | "A phone browser cannot run the connector, so we sign in for you. Your password is used once, stored nowhere, and kept out of our logs." [EspnConnect.tsx:621](../src/components/league/EspnConnect.tsx:621) | (3) Same. | Shorten: "On a phone we sign in to ESPN for you. Your password is used once and never stored." |
| ESPN connect, error | "Sign-in could not start: {reason}. Tell me that reason and I can fix it directly." [EspnConnect.tsx:178](../src/components/league/EspnConnect.tsx:178) | (3) A developer speaking in the first person to a user, and a raw reason code as the message. | Rewrite: "ESPN sign-in could not start. Try again, or send a bug report." |
| ESPN connect, error | "ESPN login could not finish. Use the ESPN-site connector below." [EspnConnect.tsx:350](../src/components/league/EspnConnect.tsx:350) | "ESPN-site connector" is a third name for the connector. | Rewrite: "ESPN sign-in did not finish. Use the connector below." |
| ESPN connect, error | "The connector could not find an ESPN session. Sign in to ESPN in this browser, then try again." [EspnConnect.tsx:399](../src/components/league/EspnConnect.tsx:399) | (3) "session". | Rewrite: "You're not signed in to ESPN in this browser. Sign in at ESPN.com, then try again." |
| ESPN connect, paste path | "ESPN rejected this login capture. It may be expired. Open ESPN again, run the connector, and paste the new output here." [EspnConnect.tsx:258](../src/components/league/EspnConnect.tsx:258) | (3) "login capture", "output". | Rewrite: "ESPN didn't accept that sign-in; it may have expired. Sign in to ESPN again and retry." |
| ESPN connect, paste path | "Could not find espn_s2 or SWID. Run the Odds Gods connector on your ESPN league page, then paste what it gives you." and the two "Found espn_s2 but no SWID..." variants [espnConnect.js:84](../src/utils/espnConnect.js:84) | (3) Cookie names as user copy. If this paste path is still reachable it needs one plain message. | Rewrite all three: "That didn't include a full ESPN sign-in. Run the connector on your league page and try again." |

## Hub

| Screen | Line | What's wrong | Recommendation |
|---|---|---|---|
| Hub, rail skeleton | subtitle "the book's answer" under "Who do I start?" [MatchupPage.tsx:2975](../src/pages/MatchupPage.tsx:2975) | (2) Adds nothing to the title. | Delete the subtitle. |
| Hub, line movement chart | caption "Held values between updates. Tap players below to compare." [MatchupPage.tsx:3073](../src/pages/MatchupPage.tsx:3073) | (2) Narrates the chart and the board under it. | Delete. |
| Hub, line movement placeholder | "This panel lights up once the book reprices the matchup a couple of times." [MatchupPage.tsx:3106](../src/pages/MatchupPage.tsx:3106) | (2) "No real movement yet" above it already says it. | Delete. |
| Hub, line movement footer | "This chart lights up after a couple of line updates." [MatchupPage.tsx:3087](../src/pages/MatchupPage.tsx:3087) | Unreachable: it is the else-branch of a condition the chart only renders when true. | Delete the branch. |
| Hub, trades refresh | "No new deals on the board. The market moves when lineups do." [MatchupPage.tsx:3571](../src/pages/MatchupPage.tsx:3571) | Second sentence is an aphorism. | Shorten: "No new deals on the board." |
| Hub, trade row | "Open in Market →" [MatchupPage.tsx:565](../src/pages/MatchupPage.tsx:565), [:695](../src/pages/MatchupPage.tsx:695) | The tab is called Trades. | Rewrite: "Open in Trades". |
| Hub, start/sit call | "Inspect why" [MatchupPage.tsx:2953](../src/pages/MatchupPage.tsx:2953) | "Inspect" is tooling vocabulary; the trade row beside it says "Why this trade?". | Rewrite: "See why". |
| Hub, start/sit call | "+1.2% win probability. It needs your other starters shuffled between slots to fit; the "Set optimal lineup" button does the whole move in one tap." [MatchupPage.tsx:2995](../src/pages/MatchupPage.tsx:2995) | Long, and the button is actually labelled "Set optimal lineup on ESPN". | Shorten: "+1.2% win probability. Other starters change slots to fit; "Set optimal lineup on ESPN" does it in one tap." |
| Hub, best lineups | "Both lineups are already the best either of you can field. The line is the line." [BestLineups.tsx:75](../src/components/matchup/BestLineups.tsx:75) | Closer. | Shorten: drop "The line is the line." |
| Hub, notices | "{X} isn't on the projection sheet yet, so recommendations are limited." / "{N} of your starters are outside the projection sheet..." [MatchupPage.tsx:2545](../src/pages/MatchupPage.tsx:2545) | (3) "projection sheet" is the admin's spreadsheet. | Rewrite: "No projection for {X} yet, so start/sit calls are limited." / "No projection yet for {N} of your starters, so start/sit calls are limited." |
| Hub, notices | "Live league connected. Pricing is provisional until projections finish syncing." [MatchupPage.tsx:2557](../src/pages/MatchupPage.tsx:2557) | (3) Status report. | Rewrite: "Prices are provisional until this week's projections load." |
| Hub, opponent | "Unmanaged team, no read." [MatchupPage.tsx:2467](../src/pages/MatchupPage.tsx:2467) | "read" is our scouting jargon. | Rewrite: "No manager on this team." |
| Hub, preview | "Previewing a lineup change. You will need to update your lineup in ESPN to reflect these changes." [MatchupPage.tsx:2343](../src/pages/MatchupPage.tsx:2343) | Wordy. | Shorten: "Preview only. Set the lineup in ESPN to make it real." |
| Hub, next week | "Conditioning the season on both results…" [WeekAhead.tsx:112](../src/components/matchup/WeekAhead.tsx:112) | (3) Statistics vocabulary. | Rewrite: "Pricing a win and a loss…" |
| Hub, next week | "The conditioned run is not available for this week." [WeekAhead.tsx:113](../src/components/matchup/WeekAhead.tsx:113) | (3) "conditioned run". | Rewrite: "Not priced for this week yet." |
| Hub, compare sheet | heading "The pecking order" [MatchupPage.tsx:3267](../src/pages/MatchupPage.tsx:3267) | Heading written for effect; the list is ranked by projection. | Rewrite: "Ranked by projection" (low priority, voice call). |
| Pre-draft Hub | footnote "Your board is live now. It is the one thing here that does not need a roster, and everything else fills in the moment you draft." [PreDraftHub.tsx:34](../src/components/matchup/PreDraftHub.tsx:34) | (2) The "Open your board" button is directly above it. | Shorten: "Your board works before the draft." |
| Pre-draft League | footnote "Standings, futures and the weekly slate all arrive with the first snap." [PreDraftHub.tsx:38](../src/components/matchup/PreDraftHub.tsx:38) | "slate" is our word for the matchup board. | Rewrite: "Standings, futures and the weekly board arrive after Week 1." |
| Pre-draft Trades | footnote "Until then, your board is where the work happens." [PreDraftHub.tsx:42](../src/components/matchup/PreDraftHub.tsx:42) | (1) Closer. | Delete. |
| Hub, autopilot (admin labs) | "Linked. Your autopilots now act with your own ESPN login." [LinkEspnLogin.tsx:48](../src/components/matchup/LinkEspnLogin.tsx:48) | "autopilots" plural is internal. | Rewrite: "Linked. Autopilot now uses your own ESPN login." |
| Hub, trade sender (admin labs) | "Scan now", "No scan yet. Tap Scan now, or turn on trade autopilot below.", "A roster changed since the scan, so this offer is no longer valid. Scan again.", "Scanning your league, one manager at a time. This can take a few minutes.", "The last scan did not finish. Try Scan now." [TradeSenderPanel.tsx:46](../src/components/matchup/TradeSenderPanel.tsx:46) to [:597](../src/components/matchup/TradeSenderPanel.tsx:597) | (3) "scan" is build vocabulary throughout the panel. The panel is admin-only Labs today. | Rewrite "scan" as "search" or "check" across the panel before it ships. |
| Hub, trade sender (admin labs) | "On. Every 3 hours (and after each projection update) we scan and send the best offers that clear your rules, up to 3 a week. Offers sent to you are accepted or declined by the same rules. Tap Scan now to check immediately. One pending offer per manager, never the same offer twice. Last run sent 2." [TradeSenderPanel.tsx:619](../src/components/matchup/TradeSenderPanel.tsx:619) | (3) Five sentences of mechanism under a checkbox. | Shorten: "On. Offers that clear your rules are sent for you, up to 3 a week, and offers to you are answered the same way." |
| Hub, trade sender (admin labs) | "Answering from here unlocks after one ESPN capture. For now, accept or decline in ESPN." [TradeSenderPanel.tsx:45](../src/components/matchup/TradeSenderPanel.tsx:45) | (3) "ESPN capture". | Rewrite: "Accept or decline this one in ESPN." |

## League

| Screen | Line | What's wrong | Recommendation |
|---|---|---|---|
| League, demo notice | "Futures and matchup odds are provisional (scoring history only) until projections are imported." [LeaguePage.tsx:673](../src/pages/LeaguePage.tsx:673) | (3) "imported" is the admin's job. | Rewrite: "Odds are provisional, from scores so far, until this week's projections arrive." |
| League, board | kicker "Week {n} matchups" over "This week's board" [MatchupSlate.tsx:441](../src/components/league/MatchupSlate.tsx:441) | Heading repeated in the kicker. | Delete the kicker. |
| League, board glance | tooltip "Each game that has started is read at its closing line: the last price posted before anyone in it kicked off. After kickoff the price follows the score." [MatchupSlate.tsx:78](../src/components/league/MatchupSlate.tsx:78) | (3) "is read at". | Shorten: "Started games show their closing line, the last price before kickoff." |
| League, game of the week | tooltip "The result that moves the whole league most: no other game this week shifts as much championship and playoff probability across all teams." [MatchupSlate.tsx:95](../src/components/league/MatchupSlate.tsx:95) | Says it twice. | Shorten: "The game whose result moves the most title and playoff odds across the league." |
| League, selected matchup chart | caption "Held between updates." [MatchupSlate.tsx:825](../src/components/league/MatchupSlate.tsx:825) | (2) | Delete. |
| League, selected matchup | "This chart lights up after a couple of line updates." [MatchupSlate.tsx:842](../src/components/league/MatchupSlate.tsx:842) | (2) Fine as an empty state, but "lights up" is the third variant of this line. | Rewrite: "No line movement yet." |
| Futures chart | caption "Tap a team above to compare." [LeagueFutures.tsx:410](../src/components/league/LeagueFutures.tsx:410) | (2) The footer under the same chart says "Tap a team above to compare one line against yours." | Delete the caption. |
| Futures chart | "{team} closes 2.0 points above your line." / "...below your line." [LeagueFutures.tsx:165](../src/components/league/LeagueFutures.tsx:165) | "points" for percentage points. Breaks the house rule. | Rewrite: "{team} closes 2.0 pp above your line." |
| Futures chart | "{team} closes even with {you} in this view." [LeagueFutures.tsx:162](../src/components/league/LeagueFutures.tsx:162) | "in this view" is filler. | Shorten: "{team} closes even with you." |
| Standings | "Ordered by wins, then points for — the same tiebreak the sim seeds playoffs on." [StandingsTable.tsx:30](../src/components/league/StandingsTable.tsx:30) | (3) "the sim". Also carries a real em dash the copy scan misses. | Shorten: "Ordered by wins, then points for." |
| Playoff structure | "Set how your league seeds the playoffs — the sim uses these. Change them anytime to match your league." [PlayoffSettings.tsx:54](../src/components/league/PlayoffSettings.tsx:54) | (3) "the sim". Em dash. Second sentence narrates the toggles. | Rewrite: "How your league seeds the playoffs. Odds are priced from these." |
| Predictor | "That run took too long to come back. Try calling fewer games, or reset." [Predictor.tsx:194](../src/components/league/Predictor.tsx:194) | (3) "run". | Rewrite: "That took too long. Call fewer games, or reset." |
| Predictor errors | "The conditioned simulation is not wired up yet." / "The simulation answered 500." / "We could not reach the simulation." [predictor.ts:154](../src/services/predictor.ts:154), [:195](../src/services/predictor.ts:195), [:204](../src/services/predictor.ts:204) | (3) All three. | Rewrite: "The Predictor isn't available yet." / "Could not reprice (error 500)." / "We could not reach Odds Gods." |
| Season, all-play | foot "All-play is your record against every team, every week, so it ranks the league on scoring with the schedule taken out. xW-L is the record that scoring earned. Schedule is what you got minus what you earned. vs Book is your record against our own closing spread." [LuckBoard.tsx:178](../src/components/league/LuckBoard.tsx:178) | (2) Repeats the four column tooltips above it. Only one of the two can stay; the foot works on touch, tooltips do not. | Keep the foot, delete the four column tooltips [LuckBoard.tsx:115](../src/components/league/LuckBoard.tsx:115) to [:128](../src/components/league/LuckBoard.tsx:128). |
| Season, all-play | tooltip "...Covering as a favourite and covering as an underdog count the same: it asks whether you beat the number, not whether you won." [LuckBoard.tsx:128](../src/components/league/LuckBoard.tsx:128) | Not-X-but-Y. | Covered by the row above; if kept: "Your record against our closing spread: did you beat the number?" |
| Season, all-play | "No completed weeks yet. This fills in once the league has played." [LuckBoard.tsx:58](../src/components/league/LuckBoard.tsx:58) | (2) Second sentence restates the first. | Shorten: "No completed weeks yet." |
| Season, records | kicker "The book" over "League records" [LeagueRecords.tsx:26](../src/components/league/LeagueRecords.tsx:26) | (1) | Delete the kicker. |
| Season, records | "Records start when we start pricing a league and grow from there. Nothing here is backfilled." [LeagueRecords.tsx:32](../src/components/league/LeagueRecords.tsx:32) | (3) "backfilled". | Rewrite: "Records start from the week we began pricing this league." |
| Season, week detail | "This week isn't priced yet. It's either a bye or waiting on a projections import." [WeekDetailModal.tsx:170](../src/components/season/WeekDetailModal.tsx:170) | (3) "projections import". | Rewrite: "Not priced yet: a bye, or projections aren't in." |
| Player odds sheet | "No projection this week (out, on bye, or unpriced)." [PlayerDistribution.tsx:95](../src/components/league/PlayerDistribution.tsx:95) | (3) "unpriced". | Shorten: "No projection this week (out or on bye)." |
| Player odds sheet | "80% band (8.1 to 22.4), same model the matchup odds use." [PlayerDistribution.tsx:158](../src/components/league/PlayerDistribution.tsx:158) | (3) "same model". | Rewrite: "80% of outcomes land between 8.1 and 22.4." |
| League, demo teaser | "Players you could actually get this week" [TradeTargetTeaser.tsx:39](../src/components/league/TradeTargetTeaser.tsx:39) | Demo-only mock copy; "actually" is the AI-word tell. | Shorten: "Players you could get this week." |

## Trades

| Screen | Line | What's wrong | Recommendation |
|---|---|---|---|
| Trades, dynasty refusal | "Trades are off for dynasty and keeper leagues. Draft picks and players held for future seasons are half of what changes hands here, and the engine prices a rest of season, so every number it could put on one of these would be answering a question nobody in this league is asking." [TradePage.tsx:361](../src/pages/TradePage.tsx:361) | (3) "the engine prices a rest of season". Rhetorical closer. | Shorten: "Trades are off for dynasty and keeper leagues. Picks and future seasons are most of what changes hands there, and we only price this season." |
| Trades, load error | "We couldn't load your league context for trades right now." [TradePage.tsx:340](../src/pages/TradePage.tsx:340) | (3) "league context". | Rewrite: "We couldn't load your league right now." |
| Trades, no league (mock) | "Open trade lanes." / "Teams that need what you have. Pricing the fit." / "Fit = roster need × schedule × value match" [TradeTargetsList.tsx:53](../src/components/trade/TradeTargetsList.tsx:53) | (1) and (3). Mock data on a screen a real user can reach while loading. | Delete the component from TradePage, or at least the three lines. |
| Finder, ticket note | "Nothing on either leg reads the book's last scan of every manager, so there is nothing to wait for." [TradeFinder.tsx:1006](../src/components/trade/TradeFinder.tsx:1006) | (3) "leg", "scan". The button above says "Show the board". | Delete. |
| Finder, ticket note | "A position or a player is searched live, two managers at a time, so the book builds its packages around it." [TradeFinder.tsx:1007](../src/components/trade/TradeFinder.tsx:1007) | (3) Mechanism. | Delete, or "This search takes about a minute." |
| Finder, searching | "Every manager, every shape, at the analyzer's full sim count. After this it stays warm in the background." [TradeFinder.tsx:854](../src/components/trade/TradeFinder.tsx:854) | (1) and (3): "sim count", "stays warm in the background". | Rewrite: "Checking every manager and every package size." |
| Finder, searching | "Deals land together when the walk finishes, so the board never moves under you." [TradeFinder.tsx:860](../src/components/trade/TradeFinder.tsx:860) | (3) "the walk". | Delete. |
| Finder, board header | "Every manager, every shape." [TradeFinder.tsx:908](../src/components/trade/TradeFinder.tsx:908) | (1) | Delete. |
| Finder, board header | "Every manager, every shape. Scanned 9:40, after a projections update. A fresh scan is running." [TradeFinder.tsx:910](../src/components/trade/TradeFinder.tsx:910) | (1) and (3): "scan" twice. | Rewrite: "Updated 9:40 after new projections. Refreshing now." |
| Finder, board header | "Searched 11 managers just now, at the analyzer's full sim count. 1 did not answer." [TradeFinder.tsx:905](../src/components/trade/TradeFinder.tsx:905) | (3) "sim count". | Shorten: "Searched 11 managers just now. 1 did not answer." |
| Finder, empty | "The last scan found no deal that lifts your title odds." [TradeFinder.tsx:883](../src/components/trade/TradeFinder.tsx:883) | (3) "scan". | Rewrite: "Nothing on the board lifts your title odds right now." |
| Finder, ties divider | "Under 1 point. The book calls these ties" [TradeFinder.tsx:1047](../src/components/trade/TradeFinder.tsx:1047) | "point" for a percentage point. House rule. | Rewrite: "Under 1 pp: ties". |
| Finder, limits | "Out of the box the board shows every deal that lifts both sides. These tighten it. They reset when you change the ask, so a slider from one search never quietly filters the next." [TradeFinder.tsx:1150](../src/components/trade/TradeFinder.tsx:1150) | Third sentence explains the mechanism behind a behaviour the user will simply see. | Shorten: "By default every deal that lifts both sides shows. These narrow it, and reset when you change the ask." |
| Finder, limits | "A change inside its own range (the ± beside it) is sampling noise, and the board already sets those below a line." [TradeFinder.tsx:1167](../src/components/trade/TradeFinder.tsx:1167) | (3) "sampling noise", "below a line". | Delete; the ties divider already does this. |
| Finder, limits | "Projected points over the rest of the season, net: what you get minus what you send, every player in the deal. All the way right, no limit." [TradeFinder.tsx:1207](../src/components/trade/TradeFinder.tsx:1207) | Wordy. | Shorten: "Net projected points, rest of season: what you get minus what you send. All the way right, no limit." |
| Finder, limits | "A manager who is out of the race has no title odds to lose, so a robbery of him passes the slider above. This catches it on roster value instead." [TradeFinder.tsx:1217](../src/components/trade/TradeFinder.tsx:1217) | Slightly long; the idea is good. | Shorten: "A manager out of the race has no title odds to lose, so a robbery slips past the slider above. This catches it on roster value." |
| Finder, starting points | "Deep at RB, thin at WR. Your mirror." [tradeFinderQuery.ts:672](../src/utils/tradeFinderQuery.ts:672) | Fragment closer. | Rewrite: "Deep at RB, thin at WR: the reverse of you." |
| Builder | column labels "Your side" over "You send", "Their side" over "You get" [TradePage.tsx:888](../src/pages/TradePage.tsx:888), [:906](../src/pages/TradePage.tsx:906) | Kicker repeats the heading. | Delete both column labels. |
| Builder, partner empty | "Pick a manager to open the other side of the market." + "The builder stays quiet until you choose who you want to price." [TradePage.tsx:921](../src/pages/TradePage.tsx:921) | (2) Second line narrates the empty state. "Market" again. | Rewrite first: "Pick a manager to trade with." Delete the second. |
| Builder, counter | "Couldn't compute a fair counter." [TradePage.tsx:987](../src/pages/TradePage.tsx:987) | "compute". | Rewrite: "Couldn't find a fair add." |
| Builder, failure | "Only half of this ran." [TradePage.tsx:1127](../src/pages/TradePage.tsx:1127) | (3) "ran". | Rewrite: "The trade priced, but not its season impact." |
| Builder, failure | "This trade could not be priced (no_projections). It is worth trying again." [TradePage.tsx:1109](../src/pages/TradePage.tsx:1109) | Raw reason code in the sentence. | Rewrite: "Could not price this trade. Try again." |
| Builder, failure | "Trades price once projections are imported." [TradePage.tsx:1106](../src/pages/TradePage.tsx:1106) | (3) "imported". | Rewrite: "Trades price once this week's projections are in." |
| Analyzer | tooltip "Within the simulation noise: the 95% range of this change includes zero." [TradeAnalyzerPanel.tsx:158](../src/components/trade/TradeAnalyzerPanel.tsx:158) | (3) Fine for a tooltip on a "noise" chip, but can be plainer. | Shorten: "Too small to trust: the ± range includes zero." |
| Trade card | "generated at {time}" [TradeDisplay.tsx:374](../src/components/trade-display/TradeDisplay.tsx:374), [:479](../src/components/trade-display/TradeDisplay.tsx:479) | (3) Log-file wording, lowercase. | Rewrite: "Priced {time}". |

## Board

| Screen | Line | What's wrong | Recommendation |
|---|---|---|---|
| Board, syncing | "Your league is still syncing, so the Board is waiting on league context before it can load." [MyBoardPage.tsx:634](../src/pages/MyBoardPage.tsx:634) | (3) "league context". | Rewrite: "Loading your league…" |
| Board, syncing | "Your league is still syncing, so this Board is using league-neutral starter assumptions for now." [MyBoardPage.tsx:647](../src/pages/MyBoardPage.tsx:647) | (3) "league-neutral starter assumptions". | Rewrite: "Your league is still syncing. Values use standard lineup slots until it finishes." |
| Player panel, News | Three fabricated headlines per player, attributed to ESPN, The Athletic, PFF, Rotoworld, NFL Network, dated Oct 2024 and referring to "Week 8" and "the 2024 replay window" [PlayerDetailPanel.tsx:14](../src/components/player/PlayerDetailPanel.tsx:14) to [:33](../src/components/player/PlayerDetailPanel.tsx:33), rendered at [:217](../src/components/player/PlayerDetailPanel.tsx:217) | Not a wording problem: invented news under real outlets' names, shown to real users. "Owned: {68 + hash}%" at [:183](../src/components/player/PlayerDetailPanel.tsx:183) is also synthetic. | Delete the News section and the Owned stat until they are real. |
| Player panel | heading "{last name} stays in the weekly script" [PlayerDetailPanel.tsx:232](../src/components/player/PlayerDetailPanel.tsx:232) | Same template, every player. | Covered by the row above. |

## More

| Screen | Line | What's wrong | Recommendation |
|---|---|---|---|
| More, Tools | "Player board plus the power-user spreadsheet view." [MorePage.tsx:64](../src/pages/MorePage.tsx:64) | Sales adjective. | Shorten: "The board as a spreadsheet." |
| More, Tools (admin) | "Owner import flow for the weekly projection workbooks." [MorePage.tsx:71](../src/pages/MorePage.tsx:71) | (3) "import flow". Admin-only. | Rewrite: "Import the weekly projections." |
| More, League sync | "Reading your Sleeper." [MorePage.tsx:144](../src/pages/MorePage.tsx:144) | Missing noun. | Rewrite: "Reading your Sleeper league." |
| More, Labs (admin) | "Dark-launched Keep / Trade / Cut prompt. Votes queue locally and do not touch the projection pipeline." [MorePage.tsx:264](../src/pages/MorePage.tsx:264) | (3) "dark-launched", "queue locally", "projection pipeline". | Rewrite: "Keep / Trade / Cut prompt. Votes are saved on this device only." |
| More, Labs (admin) | "Hidden. Turn on to put the ESPN lineup and trade-sender panels back on the Hub." [MorePage.tsx:246](../src/pages/MorePage.tsx:246) | Fine for admin; "trade-sender" hyphenated here, "trade sender" elsewhere. | Rewrite to "trade sender". |

## Tour

| Screen | Line | What's wrong | Recommendation |
|---|---|---|---|
| Tour, League | "Press one and it opens: both lineups, slot by slot, which is the part a price cannot tell you." [tourSteps.ts:105](../src/components/onboarding/tourSteps.ts:105) | Trailing clause is a closer. | Shorten: "Press one to open both lineups, slot by slot." |
| Tour, Trades | "...Every deal the book returns is scored by what it does to your championship odds, not by a points total. That is the only number that decides anything." [tourSteps.ts:146](../src/components/onboarding/tourSteps.ts:146) | Not-X-but-Y, then a closer. | Rewrite: "Fill in as much as you like: a manager, a position, a player. Every deal is scored by what it does to your championship odds." |
| Tour, Board | "One board for the whole pool, built from the projection sheet the engine prices with. Pressing a player opens what is behind their number." [tourSteps.ts:160](../src/components/onboarding/tourSteps.ts:160) | (3) "projection sheet the engine prices with". | Rewrite: "Every player, ranked by the projections that price your league. Press one to see what's behind the number." |
| Tour, Board | "Filter to a position, or to the players you can actually get. The ranking underneath is the same either way." [tourSteps.ts:168](../src/components/onboarding/tourSteps.ts:168) | (2) Second sentence narrates. "actually" again. | Shorten: "Filter to a position, or to players you can get." |
| Tour, end | "Each tab has its own. Replay them from your account menu." [ProductTour.tsx:406](../src/components/onboarding/ProductTour.tsx:406), [:274](../src/components/onboarding/ProductTour.tsx:274) | On a phone there is no account menu; replay lives under More. | Rewrite: "Each tab has its own. Replay from the account menu or More." |

## Shell notices, header, support

| Screen | Line | What's wrong | Recommendation |
|---|---|---|---|
| Dynasty banner | "{Dynasty} league, and we are still building for it. Trade pricing is off here until the engine can value picks and future seasons, and every player value and ranking on this site is for this season alone." [DynastyNotice.tsx:64](../src/components/layout/DynastyNotice.tsx:64) | (3) "the engine", and a dev-voice apology. | Rewrite: "Dynasty league. Trades aren't priced yet, because picks and future seasons aren't valued, and every player value here is for this season only." |
| Dynasty note (peek) | "Trade pricing is off until the engine can value picks and future seasons, and every player value here is for this season alone." [DynastyScopeNote.tsx:25](../src/components/layout/DynastyScopeNote.tsx:25) | (3) Same. | Same rewrite. |
| Stale season | "Moved you to 2026. {League} is the current season of this league, and everything below is priced from it." [StaleSeasonNotice.tsx:192](../src/components/layout/StaleSeasonNotice.tsx:192) | Second sentence restates the first. | Shorten: "Moved you to the 2026 season of {league}." |
| Stale season | "...Nobody has started your 2026 league on Sleeper yet, so there is nothing to move you to. Every roster, record and price below is from last year." [StaleSeasonNotice.tsx:200](../src/components/layout/StaleSeasonNotice.tsx:200) | "so there is nothing to move you to" explains the app's reasoning. | Shorten: drop that clause. |
| API errors | "The league service answered 503. If this keeps happening, that status is the thing to report." [leagueApi.ts:719](../src/services/leagueApi.ts:719) | (3) "league service", "status". | Rewrite: "Odds Gods returned an error (503). If it keeps happening, send a bug report." |
| Bug report, sent | "It came through with the page you were on, the league you had open, and anything that failed behind the scenes. No need to write any of that out." [BugReportDialog.tsx:121](../src/components/support/BugReportDialog.tsx:121) | (2) The form already disclosed what gets sent; the second sentence arrives after the user has finished writing. | Shorten: "It came through with the page and league you had open." |
| Crash screen | kicker "That broke" over "This screen stopped working." [AppErrorBoundary.tsx:42](../src/components/support/AppErrorBoundary.tsx:42) | (1) Fragment that the heading repeats. | Delete the kicker. |
| Header, PPR pill | gloss "Point Per Reception. Each catch is worth 1 fantasy point on top of yardage and TDs. Most modern fantasy leagues use PPR or Half-PPR." [Gloss.tsx:7](../src/components/ui/Gloss.tsx:7) | The audience plays fantasy; they know PPR. Third sentence is trivia. | Delete the gloss, or shorten to the first sentence. |

## Terminology to settle

These are not single lines but the same word drifting across screens. Each
needs one answer, then a sweep.

- **Trades vs Market.** The tab is Trades; the route is `/market`; the Hub
  says "Open in Market", the builder says "the other side of the market", and
  loaders say "Scanning the market". Pick Trades for navigation and keep
  "market" only where it means the price.
- **Connect vs Sync.** Buttons and the wizard say Connect; the Connect page
  heading, the More page section and the header pill say Sync. Use Connect
  for the act and Synced for the state, or stop using Sync.
- **pp vs points vs %.** Title-odds deltas appear as "pp" (finder limits,
  next week), "points" (futures chart, ties divider), "percentage points"
  (time machine, tooltips) and "%" (trade sender, Hub call). The house rule
  is pp, and "points" is reserved for fantasy points.
- **Connector names.** "The connector", "the ESPN-site connector", "the Odds
  Gods ESPN connector for Chrome", "a small Chrome add-on". One name.
- **"Account menu" on a phone.** The tour and the Sleeper picker point at
  it; phones have More instead.

## Copy that exists but nothing renders

These files carry user-facing strings and are unreachable from the app entry.
They were not audited and should be deleted rather than fixed:

`components/decision/*`, `components/draft/*`, `components/league/SuggestedPackage.tsx`,
`components/matchup/CompareWidget.tsx`, `HubDeals.tsx`, `MatchupCard.tsx`,
`MatchupDistributions.tsx`, `OneMoveRow.tsx`, `PlayerSelect.tsx`,
`QuickActions.tsx`, `components/roster/*`, `components/season/CascadePanel.tsx`,
`components/trade/LeagueDealBoard.tsx`, `components/league/LeagueMovementChip.tsx`,
`utils/dealBoardPolicy.ts`, `utils/tradeAcceptance.ts`,
`components/scouting/scoutingTags.ts`. Ten of the eleven `Gloss` entries are
also unused; only `ppr` renders.

Three of those dead files hold lines that would have been flagged had they
shipped ("The week, priced.", "Trade fits will show up here soon.", "Full
trade analyzer with crowdsourced values launches Week 5.").

## Left alone on purpose

- The landing headline and the share-card lines: they are the pitch and the
  product's voice, and each carries a claim.
- The swap verdict one-liners in `lineupComparison.ts` ("The book shrugs.",
  "A clear upgrade. Make the swap."): deliberately fragmentary, and each
  states a direction and a size.
- Loader lines ("Setting the line", "Running both rosters 10,000 times…").
- The Predictor subtitle, the all-play lede sentence, the week-fork caption,
  the ticket card, the pre-draft `copy` lines, most error messages, and the
  bug-report form: they say one thing once and tell the reader what to do.
- Bet slip "legs": that is the sportsbook word and the product's.
