/**
 * Direct loader for the six combined-format workbooks committed under /projections.
 * For each position it reads the season sheet (point + floor/ceiling + every stat)
 * and the game_level sheet (per-week opponent + every stat) and returns ONE
 * normalized dataset that carries every column. Read on server boot; the admin
 * /reload endpoint forces a refresh without a redeploy.
 *
 * This replaces the upload/crosswalk/version flow — the files ARE the source of truth.
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', '..', 'projections');

// Per-position config: the three things that differ across the six files.
//   nameKey  — the column holding the player identity (team for DEF, kicker_name for K)
//   point    — the season fantasy-points column (QB is _adj, K is total_projected_fp)
// floor/ceiling are uniformly `fantasy_pts_floor` / `fantasy_pts_ceiling`.
const POS = {
  QB:  { file: 'qb_2026_combined.xlsx',     seasonSheet: 'all_qbs',       nameKey: 'QB',          point: 'fantasy_pts_adj' },
  RB:  { file: 'rb_2026_combined.xlsx',     seasonSheet: 'all_season',    nameKey: 'RB',          point: 'fantasy_pts' },
  WR:  { file: 'wr_2026_combined.xlsx',     seasonSheet: 'all_season',    nameKey: 'WR',          point: 'fantasy_pts' },
  TE:  { file: 'te_2026_combined.xlsx',     seasonSheet: 'all_season',    nameKey: 'TE',          point: 'fantasy_pts' },
  K:   { file: 'kicker_2026_combined.xlsx', seasonSheet: 'season_totals', nameKey: 'kicker_name', point: 'total_projected_fp' },
  DEF: { file: 'def_2026_combined.xlsx',    seasonSheet: 'all_season',    nameKey: 'team',        point: 'fantasy_pts' },
};

function readSheet(wb, name) {
  const sheet = name ? wb.Sheets[name] : null;
  return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: null }) : [];
}

function pickSeasonSheet(wb, preferred) {
  if (wb.SheetNames.includes(preferred)) return preferred;
  return wb.SheetNames.find((n) => ['all_season', 'season_totals', 'all_qbs'].includes(n)) ?? wb.SheetNames[0];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

let _cache = null;

export function loadProjections({ force = false } = {}) {
  if (_cache && !force) return _cache;

  const players = [];
  const perPosition = {};
  let newest = 0;

  for (const [position, cfg] of Object.entries(POS)) {
    const file = path.join(DIR, cfg.file);
    if (!fs.existsSync(file)) {
      console.warn(`[projections] missing ${cfg.file} — skipping ${position}`);
      perPosition[position] = 0;
      continue;
    }
    newest = Math.max(newest, fs.statSync(file).mtimeMs);
    const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });

    const seasonRows = readSheet(wb, pickSeasonSheet(wb, cfg.seasonSheet));
    const gameRows = readSheet(wb, wb.SheetNames.includes('game_level') ? 'game_level' : null);

    // Group weekly rows by identity (player name, or team for DEF).
    const weeklyBy = new Map();
    for (const g of gameRows) {
      const key = String(g[cfg.nameKey] ?? g.team ?? '').trim();
      if (!key) continue;
      const arr = weeklyBy.get(key) ?? [];
      arr.push(g);
      weeklyBy.set(key, arr);
    }

    let n = 0;
    for (const s of seasonRows) {
      const name = String(s[cfg.nameKey] ?? '').trim();
      if (!name) continue;
      const weekly = (weeklyBy.get(name) ?? [])
        .slice()
        .sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0));
      players.push({
        position,
        name,
        team: s.team ?? null,
        depthRank: s.depth_rank ?? null,
        point: num(s[cfg.point]),
        floor: num(s.fantasy_pts_floor),
        ceiling: num(s.fantasy_pts_ceiling),
        season: s,   // every season-sheet column
        weekly,      // every game_level column, per week (incl. opponent)
      });
      n += 1;
    }
    perPosition[position] = n;
  }

  players.sort((a, b) => (b.point ?? -Infinity) - (a.point ?? -Infinity));
  _cache = {
    updatedAt: newest || Date.now(),
    count: players.length,
    perPosition,
    players,
  };
  console.log(`[projections] loaded ${players.length} entities`, perPosition);
  return _cache;
}

export function reloadProjections() {
  return loadProjections({ force: true });
}
