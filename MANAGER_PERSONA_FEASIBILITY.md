# Manager Persona Feasibility

Generated on July 14, 2026 at 12:45 AM.

Probe target: Sleeper user `avla` (`853151160289296384`).

## Coverage snapshot

### DINK (redraft, 2026)

- League id: `1380260955111313408`
- Lineage seasons found: 1
- Matchup sample: week 1 includes `players_points` and `starters_points`, so bench-points-left analysis is feasible.
- Probe cost: 67 calls in 10059 ms

| Manager | Managed | Seasons | Leagues | Txn stats | Matchup points | Notes |
| --- | --- | ---: | ---: | --- | --- | --- |
| avla (avla team) | yes | 5 | 17 | 0 trades, 0 adds, $0 FAAB in this league (1 season) | yes, week 1 | no lineage transaction sample |
| Unmanaged team (Unmanaged team) | no | 0 | 0 | n/a | yes, week 1 | vacant roster; no lineage transaction sample |
| Unmanaged team (Unmanaged team) | no | 0 | 0 | n/a | yes, week 1 | vacant roster; no lineage transaction sample |
| Unmanaged team (Unmanaged team) | no | 0 | 0 | n/a | yes, week 1 | vacant roster; no lineage transaction sample |
| Unmanaged team (Unmanaged team) | no | 0 | 0 | n/a | yes, week 1 | vacant roster; no lineage transaction sample |
| Unmanaged team (Unmanaged team) | no | 0 | 0 | n/a | yes, week 1 | vacant roster; no lineage transaction sample |
| Unmanaged team (Unmanaged team) | no | 0 | 0 | n/a | yes, week 1 | vacant roster; no lineage transaction sample |
| Unmanaged team (Unmanaged team) | no | 0 | 0 | n/a | yes, week 1 | vacant roster; no lineage transaction sample |
| Unmanaged team (Unmanaged team) | no | 0 | 0 | n/a | yes, week 1 | vacant roster; no lineage transaction sample |
| Unmanaged team (Unmanaged team) | no | 0 | 0 | n/a | yes, week 1 | vacant roster; no lineage transaction sample |

### 617 Dynasty (dynasty, 2026)

- League id: `1312141276467961856`
- Lineage seasons found: 2
- Matchup sample: week 1 includes `players_points` and `starters_points`, so bench-points-left analysis is feasible.
- Probe cost: 533 calls in 71635 ms

| Manager | Managed | Seasons | Leagues | Txn stats | Matchup points | Notes |
| --- | --- | ---: | ---: | --- | --- | --- |
| avla (617) | yes | 5 | 17 | 10 trades, 17 adds, $41 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |
| Sgates90008 (Gay for Arthur Juan) | yes | 4 | 25 | 10 trades, 23 adds, $300 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |
| ItsSix (Boutte Clap Bandits) | yes | 4 | 28 | 5 trades, 6 adds, $90 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |
| basedgodbernardo (BigPatsGuy) | yes | 7 | 45 | 8 trades, 24 adds, $95 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |
| Patriotsfan1234 (New England Patriots) | yes | 2 | 2 | 4 trades, 16 adds, $70 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |
| jdplet (I Love Jayden Daniels) | yes | 6 | 29 | 12 trades, 22 adds, $207 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |
| Bcroteau14 (Four Doors, Moore Whores) | yes | 5 | 11 | 10 trades, 17 adds, $15 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |
| meharporeddy (Love Hurts) | yes | 5 | 9 | 3 trades, 6 adds, $0 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |
| vagmi20 (Bijan Mustard) | yes | 5 | 14 | 5 trades, 1 adds, $0 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |
| Finnydrizzy (Finnydrizzy team) | yes | 5 | 15 | 9 trades, 24 adds, $39 FAAB in this league (2 seasons) | yes, week 1 | full lineage sample |


## What is computable

- High confidence
  - Sleeper tenure (`/user/<id>/leagues/nfl/<season>` across 2017-2026)
  - Full league-lineage trades, initiator share, consent share, waiver adds, FAAB spent, and traded picks from weekly transactions
  - Bench-points-left analysis because sampled matchup payloads include `players_points`
  - Honest unmanaged-team detection because vacant rosters expose `owner_id: null`
- Medium confidence
  - Career record, playoff rate, and titles on a per-manager basis by walking each league's rosters plus winners bracket
  - Head-to-head vs you across the current league lineage when that lineage exists and the same managers stay in the chain
- Low confidence or context-dependent
  - Ring-chaser signals in fresh leagues with no `previous_league_id`
  - Early-season FAAB pace in leagues where week 1 is not complete yet

## Surprises

- `DINK` is a deliberate unmanaged-team fixture: 10 rosters exist, but 9 return `owner_id: null`. That validates the no-file collapse state, but it should not be treated as representative Sleeper coverage.
- `617 Dynasty` has 2 lineage seasons, which is enough for titles, head-to-head, and repeat-trade behavior.
- Matchup payloads in both sampled leagues already include per-player scoring maps, so bench-left receipts can be computed client-side with no server work.

## Call-budget math

- Shared league-lineage scan: `1 league + 1 users + 1 rosters + 18 transactions + 1 matchup sample = 22 calls` for the current season.
- Each prior season in the same `previous_league_id` chain adds `1 league + 1 rosters + 18 transactions = 20 calls`, plus matchup calls only if head-to-head or bench-left receipts are compiled.
- Dynasty offseason activity must include leg 1, so the shared scan always walks weeks `1-18` for every lineage season.
- Each managed profile tenure pass costs `10` calls for `2017-2026` league lists.
- Career record/playoff/title rollups cost roughly `2 x total_leagues` calls for rosters plus winners bracket on demand.
- Full cross-league transaction history stays on-demand and sampled; cap any optional extra-league transaction pull to roughly `200` calls.

## Default read mapping

- Trade-friendliness starts at `5`.
- Add `+3` at `3.0+` trades per season, `+1` at `1.5+`, and subtract `3` below `0.5`.
- Add `+1` when trade initiation rate is `60%+`.
- Add `+1` when the manager consents to `2.0+` outside-created trades per scanned season.
- Weight current and previous lineage seasons `2x` for trades/season and consent-per-season.
- Relationship starts at `5`.
- Add `+1` after one completed trade together anywhere in the lineage and `+2` after two.
- Head-to-head and titles remain visible in the profile, but do not move the relationship slider.
- Clamp both sliders to `0-10`.
- Toggle OFF restores neutral `5/5`. Manual overrides always beat scouted defaults until reset.

## Measured total

- Probe total: 601 calls in 81694 ms across 2 leagues.
- Practical UI plan: cache shared league data per league, then compile cross-league career details only when a specific manager file is opened or refreshed.
