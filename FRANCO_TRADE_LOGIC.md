# Franco Trade Logic Investigation

Phase: 1 - investigation only. No Market valuation code has been ported in this pass.

## Executive finding

The repo currently contains Franco projection exports, not Franco's workbook trade logic.

The owner import flow and the checked-in workbook fixtures cover six per-position `*_combined.xlsx` files under `projections/`. Those files expose season projection sheets and `game_level` weekly projection sheets. None of the checked-in workbooks contains a `Trades` tab, any trade/value-like sheet name, or exposed spreadsheet formulas. The current Market trade logic is therefore still the app's homegrown server logic in `server/engine/engine.js`, with Franco projections used as player inputs when available.

Phase 2 should not start until an actual Franco workbook or fixture containing the `Trades` tab is provided. Porting from the current artifacts would require inventing the missing formulas, which is the exact failure mode this prompt is trying to eliminate.

## Import path found

User-facing owner import:

- `src/pages/AdminProjectionsPage.tsx`
- UI title: `Import Franco's sheet`
- Upload contract: multiple `.xlsx` files, specifically `qb / rb / wr / te / kicker / def *_combined.xlsx`
- Server endpoint: `POST /api/admin/projections/import-franco`

Server import/storage:

- `server/routes/admin.js`
- `server/projections/importer.js`
- `server/projections/store.js`
- `server/projections/loadFromRepo.js`
- `server/projections/adjusted.js`

Runtime data flow:

- `server/projections/loadFromRepo.js` loads the six checked-in workbooks directly at server boot.
- `server/projections/adjusted.js` applies user agreement tilt and maps Franco rows onto provider player IDs using the last admin import's crosswalk.
- `server/routes/api.js` injects those adjusted projections into both league pricing and trade pricing when available.
- `server/engine/engine.js` still computes trade value, lane generation, acceptance, fair counters, title impact, and depth-after itself.

## Workbook inventory

Checked-in source workbooks:

| File | Sheets | Trade tab? | Formulas exposed? |
| --- | --- | --- | --- |
| `projections/qb_2026_combined.xlsx` | `all_qbs`, `qb1s`, `qb2s`, `game_level` | No | No, 0 formulas counted |
| `projections/rb_2026_combined.xlsx` | `all_season`, `rb1s_season`, `rb2s_season`, `rb3s_season`, `game_level` | No | No, 0 formulas counted |
| `projections/wr_2026_combined.xlsx` | `all_season`, `wr1s_season`, `wr2s_season`, `wr3s_season`, `wr4s_season`, `game_level` | No | No, 0 formulas counted |
| `projections/te_2026_combined.xlsx` | `all_season`, `te1s_season`, `te2s_season`, `game_level` | No | No, 0 formulas counted |
| `projections/kicker_2026_combined.xlsx` | `season_totals`, `game_level` | No | No, 0 formulas counted |
| `projections/def_2026_combined.xlsx` | `all_season`, `game_level` | No | No, 0 formulas counted |

Searches for sheet names matching `trade`, `value`, `ros`, `rank`, `tier`, `auction`, or `draft` found no trade/value sheet in any workbook.

Persisted projection snapshots under `server/data/projections/` contain projection records only. Readable snapshots expose trade-adjacent projection fields such as `seasonTotal`, `floor`, `ceiling`, `depthRank`, and `tier`; no imported trade valuation rows or trade formulas were found. Two older local snapshot JSON files are zero-byte/invalid, which is unrelated to trade logic but worth cleaning separately.

## Projection tabs documented

These are the columns available from the checked-in Franco exports.

### QB

Season sheets: `all_qbs`, `qb1s`, `qb2s`

Columns:

`QB`, `team`, `depth_rank`, `passing_yards_raw`, `passing_yards_adj`, `passing_tds_raw`, `passing_tds_adj`, `rushing_yards_raw`, `rushing_yards_adj`, `rushing_tds_raw`, `rushing_tds_adj`, `interceptions_raw`, `interceptions_adj`, `fumbles_raw`, `fumbles_adj`, `fantasy_pts_raw`, `fantasy_pts_adj`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `espn_fpts`, `vlahakis`, `williams`

Weekly sheet: `game_level`

Columns:

`QB`, `team`, `depth_rank`, `week`, `opponent`, `game_location`, `is_dome`, `passing_yards`, `passing_tds`, `rushing_yards`, `rushing_tds`, `interceptions`, `fumbles`, `passing_yards_ci_lower`, `passing_yards_ci_upper`, `passing_tds_ci_lower`, `passing_tds_ci_upper`, `rushing_yards_ci_lower`, `rushing_yards_ci_upper`, `rushing_tds_ci_lower`, `rushing_tds_ci_upper`, `interceptions_ci_lower`, `interceptions_ci_upper`, `fumbles_ci_lower`, `fumbles_ci_upper`, `fantasy_pts`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `espn_fpts`

Importer behavior: season point source is `fantasy_pts_adj`; weekly point source is `fantasy_pts`.

### RB

Season sheets: `all_season`, `rb1s_season`, `rb2s_season`, `rb3s_season`

Columns:

`RB`, `team`, `depth_rank`, `rushing_yards`, `rushing_tds`, `receiving_yards`, `receiving_tds`, `receptions`, `fumbles_lost`, `fantasy_pts`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `fantasy_pts_half`, `fantasy_pts_floor_half`, `fantasy_pts_ceiling_half`, `fantasy_pts_nonppr`, `fantasy_pts_floor_nonppr`, `fantasy_pts_ceiling_nonppr`, `draft_sharks_fpts`, `fpts_gap`, `vlahakis`, `williams`

Weekly sheet: `game_level`

Columns:

`RB`, `team`, `depth_rank`, `week`, `opponent`, `game_location`, `is_dome`, `rushing_yards`, `rushing_tds`, `receiving_yards`, `receiving_tds`, `receptions`, `fumbles_lost`, `rushing_yards_ci_lower`, `rushing_yards_ci_upper`, `rushing_tds_ci_lower`, `rushing_tds_ci_upper`, `receiving_yards_ci_lower`, `receiving_yards_ci_upper`, `receiving_tds_ci_lower`, `receiving_tds_ci_upper`, `receptions_ci_lower`, `receptions_ci_upper`, `fantasy_pts`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `fantasy_pts_half`, `fantasy_pts_floor_half`, `fantasy_pts_ceiling_half`, `fantasy_pts_nonppr`, `fantasy_pts_floor_nonppr`, `fantasy_pts_ceiling_nonppr`

Importer behavior: season point source is `fantasy_pts`; `loadFromRepo` preserves half-PPR and non-PPR columns for scoring-format-specific adjusted projections.

### WR

Season sheets: `all_season`, `wr1s_season`, `wr2s_season`, `wr3s_season`, `wr4s_season`

Columns:

`WR`, `team`, `depth_rank`, `receiving_yards`, `receiving_tds`, `receptions`, `rushing_yards`, `rushing_tds`, `fantasy_pts`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `fantasy_pts_half`, `fantasy_pts_floor_half`, `fantasy_pts_ceiling_half`, `fantasy_pts_nonppr`, `fantasy_pts_floor_nonppr`, `fantasy_pts_ceiling_nonppr`, `sharps_fantasy_pts`, `ci_engulfs_sharps`, `vlahakis`, `williams`

Weekly sheet: `game_level`

Columns:

`WR`, `team`, `depth_rank`, `week`, `opponent`, `game_location`, `is_dome`, `receiving_yards`, `receiving_tds`, `receptions`, `rushing_yards`, `rushing_tds`, `receiving_yards_ci_lower`, `receiving_yards_ci_upper`, `receiving_tds_ci_lower`, `receiving_tds_ci_upper`, `receptions_ci_lower`, `receptions_ci_upper`, `fantasy_pts`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `fantasy_pts_half`, `fantasy_pts_floor_half`, `fantasy_pts_ceiling_half`, `fantasy_pts_nonppr`, `fantasy_pts_floor_nonppr`, `fantasy_pts_ceiling_nonppr`

Importer behavior: season point source is `fantasy_pts`; `loadFromRepo` preserves half-PPR and non-PPR columns.

### TE

Season sheets: `all_season`, `te1s_season`, `te2s_season`

Columns:

`TE`, `team`, `depth_rank`, `receiving_yards`, `receiving_tds`, `receptions`, `fantasy_pts`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `fantasy_pts_half`, `fantasy_pts_floor_half`, `fantasy_pts_ceiling_half`, `fantasy_pts_nonppr`, `fantasy_pts_floor_nonppr`, `fantasy_pts_ceiling_nonppr`, `draft_sharks_fpts`, `fpts_gap`, `vlahakis`, `williams`

Weekly sheet: `game_level`

Columns:

`TE`, `team`, `depth_rank`, `week`, `opponent`, `game_location`, `is_dome`, `receiving_yards`, `receiving_tds`, `receptions`, `receiving_yards_ci_lower`, `receiving_yards_ci_upper`, `receiving_tds_ci_lower`, `receiving_tds_ci_upper`, `receptions_ci_lower`, `receptions_ci_upper`, `fantasy_pts`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `fantasy_pts_half`, `fantasy_pts_floor_half`, `fantasy_pts_ceiling_half`, `fantasy_pts_nonppr`, `fantasy_pts_floor_nonppr`, `fantasy_pts_ceiling_nonppr`

Importer behavior: season point source is `fantasy_pts`; `loadFromRepo` preserves half-PPR and non-PPR columns.

### K

Season sheet: `season_totals`

Columns:

`team`, `kicker_name`, `games`, `pred_pat_att`, `projected_xp_made`, `projected_xp_fp`, `pred_fg_attempts`, `pred_fg_att_short`, `pred_fg_att_mid`, `pred_fg_att_long`, `projected_fg_fp`, `total_projected_fp`, `career_xp_pct`, `career_fg_pct_short`, `career_fg_pct_mid`, `career_fg_pct_long`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `espn_fpts`, `diff_vs_espn`, `vlahakis`, `williams`

Weekly sheet: `game_level`

Columns:

`team`, `kicker_name`, `week`, `opponent`, `game_location`, `pred_pat_att`, `career_xp_pct`, `projected_xp_made`, `projected_xp_fp`, `pred_fg_attempts`, `pred_fg_att_short`, `pred_fg_att_mid`, `pred_fg_att_long`, `career_fg_pct_short`, `career_fg_pct_mid`, `career_fg_pct_long`, `exp_fp_short`, `exp_fp_mid`, `exp_fp_long`, `projected_fg_fp`, `total_projected_fp`, `fantasy_pts_floor`, `fantasy_pts_ceiling`

Importer behavior: season point source is `total_projected_fp`.

### DEF

Season sheet: `all_season`

Columns:

`team`, `games`, `pred_sacks`, `pred_ints`, `pred_fr`, `pred_def_tds`, `pred_pa`, `pred_ya`, `fantasy_pts`, `fantasy_pts_floor`, `fantasy_pts_ceiling`, `espn_sacks`, `espn_ints`, `espn_fr`, `espn_td`, `espn_pa`, `espn_ya`, `espn_fantasy_pts`, `vlahakis`, `williams`

Weekly sheet: `game_level`

Columns:

`team`, `week`, `opponent`, `game_location`, `pred_sacks`, `pred_interceptions`, `pred_fumbles_recovered`, `pred_def_tds`, `pred_points_allowed`, `pred_yards_allowed`, `fantasy_pts`, `fantasy_pts_floor`, `fantasy_pts_ceiling`

Importer behavior: season point source is `fantasy_pts`; identity is NFL team code.

## Formula and derived-value status

The checked-in workbooks are value exports. `xlsx` inspection found zero formula cells across every sheet listed above. That means the repo can document the available values, but cannot reverse the upstream spreadsheet formulas from these files.

Derived behavior currently implemented by the app:

- `parseFrancoWorkbooks` calculates a per-game `mean` from `game_level` weekly points when available; otherwise it uses `seasonTotal / 17`.
- `buildProjections` estimates `stdev` from imported stdev/range when provided; otherwise it falls back to position variance curves in `server/projections/curves.json`.
- `loadFromRepo` preserves every season row and weekly row column, including half-PPR/non-PPR fields for RB/WR/TE.
- `adjusted.js` applies agreement tilt and scoring-format selection at runtime.

These are app derivations around Franco projections, not Franco trade workbook logic.

## Current Market trade logic

Current valuation source:

- `server/engine/engine.js`

Main functions:

- `computeMovers(ctx)`: generates waiver and trade lane candidates.
- `priceTrade(ctx, ...)`: prices the trade verdict.
- `tradeLaneMatchesPricedResult(lane, priced)`: checks rendered lane fields against `priceTrade`.
- `rankTradeLanes(lanes)`: orders lanes.
- `laneAcceptReasons(...)`: creates lane reason copy.

Current trade math in `priceTrade`:

- Weekly starter impact is app-computed by comparing optimized lineup distributions before/after the trade.
- Title odds impact is app-computed by re-running the app's futures simulation before/after.
- Player value is app-computed as season-total value over replacement:
  - Replacement rank uses a fixed 12-team reference.
  - Starter count is inferred from roster slots.
  - Flex slots are split across RB/WR/TE.
  - Positional weights are hardcoded: `QB: 1.4`, `RB: 0.85`, `WR: 1.25`, `TE: 1.1`, `DEF: 0.25`, `K: 0.2`.
  - `valueGap = round(giveValue - getValue)`, where positive means the user is overpaying.
- Fair-counter suggestions are app-computed from that same homegrown value currency.
- Acceptance probability is app-computed from starter delta, best-player direction, `valueGap`, roster holes, fit replacement, and persona dials.

Current tests:

- `server/engine/tradeLaneRegression.test.js` validates that app-generated lane display fields match app-priced verdict fields.
- This is not a Franco golden test. It does not compare against any workbook `Trades` tab output.

## Franco Trades tab status

Required by the prompt but not present in the repo artifacts:

- No `Trades` sheet exists in the checked-in workbook files.
- No source workbook with formulas is checked in.
- No CSV/JSON extract of Franco trade values is checked in.
- No importer code currently parses a `Trades` tab.
- No persisted projection snapshot contains imported trade rows.

Because of that, the following cannot be truthfully documented yet:

- Trades-tab columns
- Example Trades-tab rows
- Spreadsheet formulas
- Lookup tables/constants/tiers
- Manual input cells
- Scoring-format or league-size switches inside the trade sheet
- Golden expected outputs for sample trades

Required unblocker for Phase 2:

- Commit or provide the actual Franco workbook containing the `Trades` tab, preferably with formulas intact.
- If formulas cannot be shared, provide a stable export of the `Trades` tab plus a separate written formula spec and several golden sample trades.

## Franco to Market mapping

| Market surface/output today | Current source | Franco replacement status | Phase 2 direction |
| --- | --- | --- | --- |
| Lane candidate generation | App-generated from rosters/projections in `computeMovers` | No Franco equivalent found | Keep app candidate enumeration, but every candidate must be priced by the Franco valuation service before display. |
| Per-side pts/wk to starters | App `computeStarterImpact` inside `priceTrade` | No imported Franco trade output found | If Franco Trades tab has starter-impact outputs, use them. If not, keep as app-computed roster consequence and label it as app layer consuming Franco projections. |
| Fairness rail | App `valueGap` over replacement | No imported Franco trade output found | Map rail from Franco value-given/value-received differential once available. Document the mapping. |
| "You win by X value" / value gap | App season-total VOR with hardcoded replacement/position weights | No imported Franco trade output found | Replace with Franco trade value differential. Delete the hardcoded app value currency after golden tests pass. |
| Verdict stamp | App title/weekly/value thresholds | No imported Franco verdict output found | Derive from Franco value differential plus existing app title/weekly context, or consume Franco verdict if the sheet has one. Founder decision needed. |
| Balancing asset / fair counter | App-computed from homegrown player value | No imported Franco trade output found | If Franco sheet has counter/balance logic, port it. If not, decide whether to retain app counter using Franco value currency. |
| Title odds before/after | App futures simulation | No Franco trade equivalent found in projection exports | Keep app-computed from the single league snapshot. It should not be described as Franco trade logic unless Franco supplies title-odds logic. |
| Depth after | App roster-count/depth computation | No Franco equivalent expected | Keep app-computed. It is a roster consequence layer, not valuation. |
| Acceptance odds | App model using value/starter/best-player/persona facts | No Franco equivalent expected per prompt | Keep app model, but feed it Franco value-given/value-received and Franco starter-impact values if supplied. |
| Acceptance reasons | App copy from valuation/depth facts | No Franco equivalent expected per prompt | Keep app copy layer, but cite Franco-derived facts where valuation is involved. |
| THE MARKET teaser rows | App `movers` output | No Franco trade source yet | Show only Franco-priced lanes once the service exists; provisional state if unavailable. |
| Make it fair | App fair-counter logic | No Franco equivalent found | Product decision: port Franco balancing logic if present, otherwise rebuild on Franco value currency. |

## Import coverage check

Current coverage:

- The generic legacy importer `parseWorkbook` supports one tab per position (`QB`, `RB`, `WR`, `TE`, `K`, `DEF`) with aliases for player/team/points/rank/stats.
- The Franco combined importer `parseFrancoWorkbooks` supports the six per-position combined files and reads season + `game_level` sheets.
- The direct repo loader `loadFromRepo` supports the same six files and preserves all season/weekly columns.
- No path ingests a `Trades` tab.

Needed importer extension for Phase 2:

1. Accept the actual Franco workbook or a seventh trade workbook in the owner import flow.
2. Validate a declared trade schema before reading values.
3. Fail loudly on missing sheet, missing required columns, renamed columns, duplicate player identities, unsupported scoring format, or unsupported workbook version.
4. Store trade valuation data with the projection version, workbook date, scoring basis, source filenames, and file hash.
5. Expose freshness in Market UI using the same imported-version metadata pattern as projections.
6. Add golden fixtures under test data with the workbook and expected trade outputs.

Suggested storage shape, pending real schema:

```json
{
  "version": "franco-YYYY-MM-DD",
  "meta": {
    "format": "franco-combined-with-trades",
    "scoringBasis": "ppr",
    "tradeSchemaVersion": "franco-trades-v1",
    "importedAt": 0,
    "sourceFiles": []
  },
  "projections": [],
  "tradeValues": {
    "players": {
      "providerPlayerId": {
        "playerId": "providerPlayerId",
        "name": "Player Name",
        "position": "RB",
        "team": "NFL",
        "francoTradeValue": 0,
        "replacementValue": 0,
        "tier": null,
        "scoringBasis": "ppr"
      }
    },
    "constants": {},
    "schema": {}
  }
}
```

If the real Trades tab values are matchup-pair-specific rather than player-value-specific, the shape should change to store the exact row-level trade outputs instead of forcing them into player values.

## Product/founder gaps before Phase 2

- Provide the actual workbook containing the `Trades` tab.
- Decide whether Market should support only PPR trade valuation first, or PPR/half/standard at launch.
- Decide whether Franco trade logic varies by league size, roster slots, dynasty/keeper/redraft, or replacement baseline. Current app logic assumes a fixed 12-team redraft reference for trade value even in smaller leagues.
- Decide whether title-odds impact remains app simulation. No Franco title-odds trade output exists in current artifacts.
- Decide whether "Make it fair" must be Franco-authored or can be app-authored on top of Franco value currency.
- Decide what Market should display when a workbook has projections but no valid Trades tab. Recommended: show a provisional Market banner and suppress lanes/verdict valuation rather than falling back to homegrown math.

## Recommended Phase 2 plan once the workbook is available

1. Add a checked-in test fixture workbook containing the `Trades` tab.
2. Write a schema validator for that tab first.
3. Document the real columns/formulas in this file before writing valuation code.
4. Implement a server-side `francoTradeValuation` module as the only valuation entry point.
5. Add golden tests comparing module outputs to workbook outputs.
6. Rewire lane cards, verdict panel, teaser rows, acceptance inputs, and fair counters to the service.
7. Delete or hard-disable the homegrown value-over-replacement path behind `FRANCO_TRADE_VALUATION`.
8. Keep an iron-law test that generates a real lane, prices it through the same service, and asserts exact displayed equality.

## Phase 1 conclusion

Franco projections are present and actively used. Franco trade logic is not present in the repo artifacts available to this investigation.

Phase 2 is blocked on the actual `Trades` tab workbook/fixture. Once that exists, the port should be straightforward and testable: import the tab, create a single valuation service, lock it to workbook golden outputs, and remove the app's competing trade value path.
