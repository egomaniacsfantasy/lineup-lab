import { Fragment, useEffect, useMemo, useState } from 'react';
import './ProjectionsPage.css';

/**
 * Projections — reads the six combined workbooks straight from /api/projections
 * (season + week-by-week, every stat category) and lets you filter by position,
 * sort by any column, and expand a player to see each week's opponent and stats.
 */

type Row = Record<string, unknown>;

interface Player {
  position: Position;
  name: string;
  team: string | null;
  depthRank: number | null;
  point: number | null;
  floor: number | null;
  ceiling: number | null;
  season: Row;
  weekly: Row[];
}

interface Dataset {
  updatedAt: number;
  count: number;
  perPosition: Record<string, number>;
  players: Player[];
}

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';

interface StatCol {
  /** season-sheet column */
  key: string;
  label: string;
  /** game_level column, when it differs from `key` */
  weeklyKey?: string;
}

// Per-position stat columns, in display order. Point/floor/ceiling are appended
// uniformly for every position and read from the normalized top-level fields.
const STATS: Record<Position, StatCol[]> = {
  QB: [
    { key: 'passing_yards_adj', label: 'Pass Yds', weeklyKey: 'passing_yards' },
    { key: 'passing_tds_adj', label: 'Pass TD', weeklyKey: 'passing_tds' },
    { key: 'rushing_yards_adj', label: 'Rush Yds', weeklyKey: 'rushing_yards' },
    { key: 'rushing_tds_adj', label: 'Rush TD', weeklyKey: 'rushing_tds' },
    { key: 'interceptions_adj', label: 'INT', weeklyKey: 'interceptions' },
    { key: 'fumbles_adj', label: 'FUM', weeklyKey: 'fumbles' },
  ],
  RB: [
    { key: 'rushing_yards', label: 'Rush Yds' },
    { key: 'rushing_tds', label: 'Rush TD' },
    { key: 'receiving_yards', label: 'Rec Yds' },
    { key: 'receiving_tds', label: 'Rec TD' },
    { key: 'receptions', label: 'Rec' },
    { key: 'fumbles_lost', label: 'FL' },
  ],
  WR: [
    { key: 'receiving_yards', label: 'Rec Yds' },
    { key: 'receiving_tds', label: 'Rec TD' },
    { key: 'receptions', label: 'Rec' },
    { key: 'rushing_yards', label: 'Rush Yds' },
    { key: 'rushing_tds', label: 'Rush TD' },
  ],
  TE: [
    { key: 'receiving_yards', label: 'Rec Yds' },
    { key: 'receiving_tds', label: 'Rec TD' },
    { key: 'receptions', label: 'Rec' },
  ],
  K: [
    { key: 'pred_fg_attempts', label: 'FGA' },
    { key: 'projected_fg_fp', label: 'FG FP' },
    { key: 'pred_pat_att', label: 'XPA' },
    { key: 'projected_xp_fp', label: 'XP FP', weeklyKey: 'projected_xp_made' },
  ],
  DEF: [
    { key: 'pred_sacks', label: 'Sacks' },
    { key: 'pred_ints', label: 'INT', weeklyKey: 'pred_interceptions' },
    { key: 'pred_fr', label: 'FR', weeklyKey: 'pred_fumbles_recovered' },
    { key: 'pred_def_tds', label: 'DEF TD' },
    { key: 'pred_pa', label: 'PA', weeklyKey: 'pred_points_allowed' },
    { key: 'pred_ya', label: 'YA', weeklyKey: 'pred_yards_allowed' },
  ],
};

// The weekly fantasy-points column differs by position.
const WEEKLY_POINT: Record<Position, string> = {
  QB: 'fantasy_pts',
  RB: 'fantasy_pts',
  WR: 'fantasy_pts',
  TE: 'fantasy_pts',
  K: 'total_projected_fp',
  DEF: 'fantasy_pts',
};

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

function fmt(v: unknown, dp = 1): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(dp);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : -Infinity;
}

export function ProjectionsPage() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<Position>('QB');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('point');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [openName, setOpenName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/projections')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Dataset) => alive && setData(d))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  const cols = STATS[pos];

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = data.players
      .filter((p) => p.position === pos)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.team ?? '').toLowerCase().includes(q));

    const valueOf = (p: Player): number => {
      if (sortKey === 'point') return num(p.point);
      if (sortKey === 'floor') return num(p.floor);
      if (sortKey === 'ceiling') return num(p.ceiling);
      return num(p.season[sortKey]);
    };
    const sorted = [...filtered].sort((a, b) => valueOf(b) - valueOf(a));
    if (sortDir === 'asc') sorted.reverse();
    return sorted;
  }, [data, pos, query, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortMark = (key: string) => (key === sortKey ? (sortDir === 'desc' ? ' ▾' : ' ▴') : '');

  if (error) {
    return (
      <div className="proj-page">
        <p className="proj-error">Couldn’t load projections: {error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="proj-page">
        <p className="proj-loading">Loading projections…</p>
      </div>
    );
  }

  const nameLabel = pos === 'DEF' ? 'Defense' : pos === 'K' ? 'Kicker' : 'Player';

  return (
    <div className="proj-page">
      <header className="proj-head">
        <h1>Projections 2026</h1>
        <span className="proj-meta">
          {data.count} players · updated {new Date(data.updatedAt).toLocaleDateString()}
        </span>
      </header>

      <div className="proj-controls">
        <div className="proj-tabs" role="tablist" aria-label="Position">
          {POSITIONS.map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={p === pos}
              className={`proj-tab${p === pos ? ' proj-tab--on' : ''}`}
              onClick={() => {
                setPos(p);
                setOpenName(null);
                setSortKey('point');
                setSortDir('desc');
              }}
            >
              {p}
              <span className="proj-tab__count">{data.perPosition[p] ?? 0}</span>
            </button>
          ))}
        </div>
        <input
          className="proj-search"
          type="search"
          placeholder={`Search ${nameLabel.toLowerCase()} or team…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="proj-table-wrap">
        <table className="proj-table">
          <thead>
            <tr>
              <th className="proj-th proj-th--rank">#</th>
              <th className="proj-th proj-th--name">{nameLabel}</th>
              <th className="proj-th">Tm</th>
              {cols.map((c) => (
                <th key={c.key} className="proj-th proj-th--num proj-th--sort" onClick={() => toggleSort(c.key)}>
                  {c.label}
                  {sortMark(c.key)}
                </th>
              ))}
              <th className="proj-th proj-th--num proj-th--sort proj-th--fp" onClick={() => toggleSort('point')}>
                FP{sortMark('point')}
              </th>
              <th className="proj-th proj-th--num proj-th--sort" onClick={() => toggleSort('floor')}>
                Floor{sortMark('floor')}
              </th>
              <th className="proj-th proj-th--num proj-th--sort" onClick={() => toggleSort('ceiling')}>
                Ceil{sortMark('ceiling')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const isOpen = openName === p.name;
              return (
                <Fragment key={p.name}>
                  <tr
                    className={`proj-row${isOpen ? ' proj-row--open' : ''}`}
                    onClick={() => setOpenName(isOpen ? null : p.name)}
                  >
                    <td className="proj-td proj-td--rank">{i + 1}</td>
                    <td className="proj-td proj-td--name">
                      <span className="proj-caret" aria-hidden="true">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      {p.name}
                      {p.depthRank ? <span className="proj-dr">{p.position}{p.depthRank}</span> : null}
                    </td>
                    <td className="proj-td">{p.team ?? '—'}</td>
                    {cols.map((c) => (
                      <td key={c.key} className="proj-td proj-td--num">
                        {fmt(p.season[c.key])}
                      </td>
                    ))}
                    <td className="proj-td proj-td--num proj-td--fp">{fmt(p.point)}</td>
                    <td className="proj-td proj-td--num proj-td--floor">{fmt(p.floor)}</td>
                    <td className="proj-td proj-td--num proj-td--ceil">{fmt(p.ceiling)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="proj-week-row">
                      <td className="proj-week-cell" colSpan={cols.length + 5}>
                        <WeeklyGrid player={p} cols={cols} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="proj-empty" colSpan={cols.length + 5}>
                  No players match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeeklyGrid({ player, cols }: { player: Player; cols: StatCol[] }) {
  const pointCol = WEEKLY_POINT[player.position];
  if (!player.weekly.length) {
    return <p className="proj-week-empty">No week-by-week schedule available.</p>;
  }
  return (
    <div className="proj-week-wrap">
      <table className="proj-week-table">
        <thead>
          <tr>
            <th>Wk</th>
            <th className="proj-week-th--opp">Opp</th>
            {cols.map((c) => (
              <th key={c.key} className="proj-th--num">
                {c.label}
              </th>
            ))}
            <th className="proj-th--num proj-th--fp">FP</th>
          </tr>
        </thead>
        <tbody>
          {player.weekly.map((w, idx) => {
            const home = w.game_location === 'H' || w.game_location === 'home';
            return (
              <tr key={`${w.week}-${idx}`}>
                <td>{String(w.week ?? idx + 1)}</td>
                <td className="proj-week-opp">
                  {home ? 'vs ' : '@ '}
                  {String(w.opponent ?? '—')}
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="proj-td--num">
                    {fmt(w[c.weeklyKey ?? c.key])}
                  </td>
                ))}
                <td className="proj-td--num proj-td--fp">{fmt(w[pointCol])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
