/**
 * Franco XLSX importer.
 *
 * Contract: one tab per position (QB, RB, WR, TE, K, DEF). Required
 * columns (case-insensitive, order-free): Player, Team, and at least one
 * of Proj Pts / Rank. Optional: Tier, Bye, Wk1..Wk18, StDev/Range, and
 * stat-level columns (PassYds, PassTD, RushYds, Rec, RecYds, RecTD...).
 *
 * Crosswalk: normalized name + team + position against the cached player
 * catalog. Exact matches auto-accept; anything fuzzy goes to review with
 * the best 3 candidates — never silently guessed. Confirmed matches are
 * persisted so Tuesday re-imports are clean.
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CURVES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'curves.json'), 'utf8'),
);

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

const STAT_HEADERS = {
  passyds: 'pass_yd', passtd: 'pass_td', passint: 'pass_int',
  rushyds: 'rush_yd', rushtd: 'rush_td',
  rec: 'rec', recyds: 'rec_yd', rectd: 'rec_td',
  fum: 'fum_lost',
};

// Team aliases → Sleeper's canonical codes (Franco says LA for the Rams).
const TEAM_ALIASES = { JAC: 'JAX', WSH: 'WAS', LA: 'LAR', STL: 'LAR', OAK: 'LV', SD: 'LAC' };

export function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/\b(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTeam(team) {
  const t = String(team ?? '').toUpperCase().trim();
  return TEAM_ALIASES[t] ?? t;
}

function headerKey(header) {
  return String(header).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function classifyHeader(header) {
  const key = headerKey(header);
  if (['player', 'name', 'playername'].includes(key)) return { kind: 'player' };
  if (['team', 'tm', 'nflteam'].includes(key)) return { kind: 'team' };
  if (['projpts', 'pts', 'points', 'fpts', 'proj', 'projectedpoints', 'fantasypts'].includes(key))
    return { kind: 'points' };
  if (['rank', 'rk', 'posrank'].includes(key)) return { kind: 'rank' };
  if (key === 'tier') return { kind: 'tier' };
  if (key === 'bye') return { kind: 'bye' };
  if (['stdev', 'stddev', 'sd', 'range'].includes(key)) return { kind: 'stdev' };
  const wk = key.match(/^wk(\d{1,2})$/) ?? key.match(/^week(\d{1,2})$/);
  if (wk) return { kind: 'week', week: Number(wk[1]) };
  if (STAT_HEADERS[key]) return { kind: 'stat', stat: STAT_HEADERS[key] };
  return { kind: 'ignore' };
}

/** rank → projected ppg via the per-position baseline curve. */
export function rankToPoints(position, rank) {
  const curve = CURVES[position] ?? CURVES.WR;
  return Number((curve.top * Math.exp(-curve.decay * (rank - 1)) + curve.floor * (1 - Math.exp(-0.02 * rank))).toFixed(2));
}

function tokenSimilarity(a, b) {
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let shared = 0;
  ta.forEach((t) => { if (tb.has(t)) shared += 1; });
  const union = new Set([...ta, ...tb]).size;
  // last-name agreement is worth a lot in fantasy crosswalks
  const lastA = a.split(' ').at(-1);
  const lastB = b.split(' ').at(-1);
  return shared / union + (lastA === lastB ? 0.5 : 0);
}

/**
 * Parse the workbook buffer into rows, then crosswalk against the catalog.
 * @returns { tabs, rows, unmatched, stats }
 */
export function parseWorkbook(buffer, { pointsAre = 'per-game' } = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const tabs = [];
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const position = POSITIONS.find(
      (p) => sheetName.trim().toUpperCase() === p || sheetName.trim().toUpperCase().startsWith(p + ' '),
    ) ?? (['DST', 'D/ST', 'DEFENSE'].includes(sheetName.trim().toUpperCase()) ? 'DEF' : null);

    if (!position) continue;

    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (raw.length < 2) {
      tabs.push({ tab: sheetName, position, rows: 0 });
      continue;
    }

    const headers = raw[0].map(classifyHeader);
    let parsed = 0;

    for (const line of raw.slice(1)) {
      const row = { position, weekly: {}, stats: {} };

      headers.forEach((h, i) => {
        const value = line[i];
        if (value == null || value === '') return;
        if (h.kind === 'player') row.name = String(value).trim();
        else if (h.kind === 'team') row.team = normalizeTeam(value);
        else if (h.kind === 'points') row.points = Number(value);
        else if (h.kind === 'rank') row.rank = Number(value);
        else if (h.kind === 'tier') row.tier = Number(value);
        else if (h.kind === 'bye') row.bye = Number(value);
        else if (h.kind === 'stdev') row.stdev = Number(value);
        else if (h.kind === 'week') row.weekly[h.week] = Number(value);
        else if (h.kind === 'stat') row.stats[h.stat] = Number(value);
      });

      if (!row.name) continue;
      if (row.points == null && row.rank == null) continue;

      // points config: full-season totals → per-game
      if (row.points != null && pointsAre === 'full-season') {
        row.points = Number((row.points / 17).toFixed(2));
      }

      row.normalized = normalizeName(row.name);
      rows.push(row);
      parsed += 1;
    }

    tabs.push({ tab: sheetName, position, rows: parsed });
  }

  return { tabs, rows };
}

/**
 * Franco combined-format workbooks: one file per position, each holding a
 * season-totals sheet plus a `game_level` sheet (per-week, opponent-
 * adjusted points). All numbers are full PPR.
 *
 * @param files [{ name, buffer }]
 * @returns { tabs, rows } — rows compatible with crosswalk()
 */
export function parseFrancoWorkbooks(files) {
  const tabs = [];
  const rows = [];

  for (const file of files) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    const seasonSheetName =
      sheetNames.find((n) => ['all_season', 'all_qbs', 'season_totals'].includes(n)) ??
      sheetNames[0];
    const season = XLSX.utils.sheet_to_json(workbook.Sheets[seasonSheetName], { defval: null });
    const headers = Object.keys(season[0] ?? {});

    let position =
      ['QB', 'RB', 'WR', 'TE'].find((p) => headers.includes(p)) ??
      (headers.includes('kicker_name') ? 'K' : headers.includes('pred_sacks') ? 'DEF' : null);
    if (!position) {
      const fromName = String(file.name ?? '').toLowerCase().match(/(qb|rb|wr|te|kicker|def)/);
      position = fromName ? (fromName[1] === 'kicker' ? 'K' : fromName[1].toUpperCase()) : null;
    }
    if (!position) {
      tabs.push({ tab: file.name, position: null, rows: 0, error: 'position_unknown' });
      continue;
    }

    const identityOf = (r) =>
      position === 'DEF'
        ? normalizeTeam(r.team)
        : normalizeName(position === 'K' ? r.kicker_name : r[position]);
    const pointsOf = (r) =>
      position === 'QB'
        ? (r.fantasy_pts_adj ?? r.fantasy_pts_raw)
        : position === 'K'
          ? r.total_projected_fp
          : r.fantasy_pts;

    // per-week grid from game_level (the real prize: opponent-adjusted)
    const weeklyByKey = new Map();
    if (sheetNames.includes('game_level')) {
      const games = XLSX.utils.sheet_to_json(workbook.Sheets.game_level, { defval: null });
      for (const g of games) {
        const key = identityOf(g);
        const pts = pointsOf(g) ?? g.fantasy_pts;
        if (!key || g.week == null || pts == null) continue;
        const grid = weeklyByKey.get(key) ?? {};
        grid[Number(g.week)] = Number(Number(pts).toFixed(2));
        weeklyByKey.set(key, grid);
      }
    }

    let parsed = 0;
    for (const r of season) {
      const key = identityOf(r);
      const seasonTotal = Number(pointsOf(r));
      if (!key || !Number.isFinite(seasonTotal)) continue;

      const team = normalizeTeam(r.team);
      const weekly = weeklyByKey.get(key) ?? {};
      const weekValues = Object.values(weekly);
      const mean =
        weekValues.length > 0
          ? weekValues.reduce((a, b) => a + b, 0) / weekValues.length
          : seasonTotal / 17;
      const name =
        position === 'DEF'
          ? team
          : String(position === 'K' ? r.kicker_name : r[position]).trim();

      rows.push({
        position,
        name,
        team,
        points: Number(mean.toFixed(2)),
        weekly,
        seasonTotal: Number(seasonTotal.toFixed(1)),
        floor: r.fantasy_pts_floor != null ? Number(r.fantasy_pts_floor) : null,
        ceiling: r.fantasy_pts_ceiling != null ? Number(r.fantasy_pts_ceiling) : null,
        depthRank: r.depth_rank != null ? Number(r.depth_rank) : null,
        stats: {},
        normalized: position === 'DEF' ? team.toLowerCase() : normalizeName(name),
      });
      parsed += 1;
    }

    tabs.push({ tab: file.name ?? seasonSheetName, position, rows: parsed });
  }

  return { tabs, rows };
}

/**
 * Crosswalk rows to catalog ids.
 * confirmedMatches: { `${normalized}|${position}` -> sleeperId } persisted
 * from earlier imports/reviews.
 */
export function crosswalk(rows, catalog, confirmedMatches = {}) {
  const byNamePos = new Map();
  const byPos = new Map();

  for (const [id, p] of Object.entries(catalog)) {
    const norm = normalizeName(p.name);
    byNamePos.set(`${norm}|${p.position}`, { id, ...p });
    const list = byPos.get(p.position) ?? [];
    list.push({ id, ...p, normalized: norm });
    byPos.set(p.position, list);
  }

  const matched = [];
  const unmatched = [];

  for (const row of rows) {
    // D/ST identity IS the Sleeper team code — no name matching needed.
    if (row.position === 'DEF' && row.team && catalog[row.team]) {
      matched.push({
        ...row,
        playerId: row.team,
        name: catalog[row.team].name ?? row.name,
        matchType: 'exact',
      });
      continue;
    }

    const key = `${row.normalized}|${row.position}`;

    if (confirmedMatches[key]) {
      matched.push({ ...row, playerId: confirmedMatches[key], matchType: 'confirmed' });
      continue;
    }

    const exact = byNamePos.get(key);
    if (exact && (!row.team || !exact.team || exact.team === row.team)) {
      matched.push({ ...row, playerId: exact.id, matchType: 'exact' });
      continue;
    }

    if (exact) {
      // name+pos matched but team disagrees (trade or stale sheet) — still
      // exact on identity; accept, note the team difference.
      matched.push({ ...row, playerId: exact.id, matchType: 'exact-team-mismatch' });
      continue;
    }

    // fuzzy: best 3 candidates at this position; NEVER auto-accepted
    const pool = byPos.get(row.position) ?? [];
    const candidates = pool
      .map((p) => ({ id: p.id, name: p.name, team: p.team, score: tokenSimilarity(row.normalized, p.normalized) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .filter((c) => c.score > 0.3);

    unmatched.push({ key, name: row.name, team: row.team ?? null, position: row.position, candidates, row });
  }

  return { matched, unmatched };
}

/** Build final Projection records from matched rows. */
export function buildProjections(matched, { source, scoringBasis }) {
  const variance = CURVES.variance;

  // One record per player: a name can match the same Sleeper id from two
  // sheet rows (depth-chart duplicates). Keep the higher-mean row.
  const byId = new Map();
  for (const row of matched) {
    const existing = byId.get(row.playerId);
    if (!existing || (row.points ?? 0) > (existing.points ?? 0)) {
      byId.set(row.playerId, row);
    }
  }

  return [...byId.values()].map((row) => {
    const derived = row.points == null;
    const mean = row.points ?? rankToPoints(row.position, row.rank);
    const stdev =
      row.stdev != null && Number.isFinite(row.stdev) && row.stdev > 0
        ? row.stdev
        : Number((mean * (variance[row.position] ?? 0.45)).toFixed(2));

    return {
      playerId: row.playerId,
      name: row.name,
      position: row.position,
      team: row.team ?? null,
      week: null, // rest-of-season per-game
      source,
      mean: Number(mean.toFixed(2)),
      stdev,
      scoringBasis,
      derived,
      defaultedVariance: row.stdev == null,
      weekly: row.weekly,
      seasonTotal: row.seasonTotal ?? null,
      floor: row.floor ?? null,
      ceiling: row.ceiling ?? null,
      depthRank: row.depthRank ?? null,
      stats: Object.keys(row.stats).length > 0 ? row.stats : null,
      tier: row.tier ?? null,
    };
  });
}
