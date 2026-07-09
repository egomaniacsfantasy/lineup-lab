import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { tiltFromConsensus, adjustStat, adjustFP, scaleBound } from '../services/agreementTilt';
import './ProjectionsPage.css';

/**
 * Projections — reads the six combined workbooks straight from /api/projections
 * (season + week-by-week, every stat category) and lets you filter by position,
 * sort by any column, and expand a player to see each week's opponent and stats.
 */

type Row = Record<string, unknown>;

interface Player {
  id: string;
  position: Position;
  name: string;
  team: string | null;
  depthRank: number | null;
  point: number | null;
  floor: number | null;
  ceiling: number | null;
  agreement?: Record<string, string>;
  /** Average agreement across all users + how many scored this player. */
  consensus?: { avg: number; n: number } | null;
  season: Row;
  weekly: Row[];
}


interface AgreementColumn {
  key: string;
  label: string;
}

// One per-user agreement column, tied to the logged-in account (no named columns).
const DEFAULT_AGREE_COLS: AgreementColumn[] = [{ key: 'agreement', label: 'Agreement' }];
interface Dataset {
  updatedAt: number;
  count: number;
  perPosition: Record<string, number>;
  agreementColumns?: AgreementColumn[];
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

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Scoring systems. "" = PPR (bare columns). RB/WR/TE carry per-scoring columns;
// QB/K/DEF are identical across scorings (no receptions).
type Scoring = '' | '_half' | '_nonppr';
const SCORING_OPTIONS: { key: Scoring; label: string }[] = [
  { key: '', label: 'PPR' },
  { key: '_half', label: 'Half PPR' },
  { key: '_nonppr', label: 'Non-PPR' },
];
const HAS_SCORING = (p: Position) => p === 'RB' || p === 'WR' || p === 'TE';

/** Season point/floor/ceiling for the selected scoring. */
function scoredSeason(p: Player, suf: Scoring) {
  if (HAS_SCORING(p.position)) {
    return {
      point: numOrNull(p.season['fantasy_pts' + suf]),
      floor: numOrNull(p.season['fantasy_pts_floor' + suf]),
      ceiling: numOrNull(p.season['fantasy_pts_ceiling' + suf]),
    };
  }
  return { point: p.point, floor: p.floor, ceiling: p.ceiling };
}

/** Weekly point/floor/ceiling for the selected scoring. */
function scoredWeek(p: Player, w: Row, suf: Scoring) {
  if (HAS_SCORING(p.position)) {
    return {
      point: w['fantasy_pts' + suf],
      floor: w['fantasy_pts_floor' + suf],
      ceiling: w['fantasy_pts_ceiling' + suf],
    };
  }
  return {
    point: w[WEEKLY_POINT[p.position]],
    floor: w['fantasy_pts_floor'],
    ceiling: w['fantasy_pts_ceiling'],
  };
}

function hasKey(map: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function agreeToneClass(raw: string | null | undefined): string {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  if (Number.isNaN(n)) return '';
  if (n > 50) return 'is-up';
  if (n < 50) return 'is-down';
  return 'is-even';
}

function cssEscape(value: string): string {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return value.replace(/[^\w-]/g, '\\$&');
}

export function ProjectionsPage() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<Position>('QB');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('point');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [openName, setOpenName] = useState<string | null>(null);
  const [scoring, setScoring] = useState<Scoring>('');
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [editing, setEditing] = useState(false);
  const [rapidEntryEnabled, setRapidEntryEnabled] = useState(true);
  const [agreeDraft, setAgreeDraft] = useState<Record<string, string>>({});
  const [agreeSaved, setAgreeSaved] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, 'saving' | 'ok' | 'err'>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const agreeDraftRef = useRef<Record<string, string>>({});
  const agreeSavedRef = useRef<Record<string, string>>({});
  // The user's own scores AS OF PAGE LOAD — i.e. the values the server's
  // consensus already includes. Used to fold their live edits into the displayed
  // consensus so it never looks stale after they save.
  const initialOwnRef = useRef<Record<string, string>>({});

  const agreeCols = DEFAULT_AGREE_COLS;
  const rowId = (p: Player) => p.id;
  const cellKey = (p: Player, columnKey: string) => `${rowId(p)}::${columnKey}`;

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

  // Load THIS user's own agreement scores from Supabase (RLS returns only their
  // rows). Rows are keyed by (position, player name); map them onto our row ids.
  useEffect(() => {
    if (!userId || !data) {
      agreeSavedRef.current = {};
      initialOwnRef.current = {};
      queueMicrotask(() => setAgreeSaved({}));
      return;
    }
    let alive = true;
    supabase
      .from('olympus_agreement')
      .select('position, player, score')
      .then(({ data: rows, error }) => {
        if (!alive || error || !rows) return;
        const idByKey = new Map(data.players.map((p) => [`${p.position}::${p.name}`, p.id]));
        const saved: Record<string, string> = {};
        for (const r of rows) {
          const pid = idByKey.get(`${r.position}::${r.player}`);
          if (pid) saved[`${pid}::agreement`] = String(r.score);
        }
        agreeSavedRef.current = saved;
        initialOwnRef.current = { ...saved };
        setAgreeSaved(saved);
      });
    return () => {
      alive = false;
    };
  }, [userId, data]);

  const cols = STATS[pos];
  const totalColumns = cols.length + 6 + agreeCols.length;

  // Edit mode = rate against the pure PPR model: force the PPR view and show
  // model numbers (delta 0). Normal view shows consensus-adjusted numbers.
  const viewScoring: Scoring = editing ? '' : scoring;
  const showModel = editing;

  /**
   * The population consensus for a player, folding in THIS user's live edits so
   * it never shows stale after they save (the server caches consensus ~30s). We
   * take the server aggregate {avg,n}, remove the user's page-load value, and add
   * their current value. For the only voter, this equals exactly what they typed.
   */
  function consensusAvg(p: Player): number | null {
    const key = cellKey(p, 'agreement');
    const nowStr = readCommittedAgreementValueFromMap(p, 'agreement', agreeSaved);
    const initStr = hasKey(initialOwnRef.current, key) ? initialOwnRef.current[key] : '';
    const now = nowStr === '' ? null : Number(nowStr);
    const init = initStr === '' ? null : Number(initStr);
    const server = p.consensus ?? null;
    if (now === init || (now != null && init != null && now === init)) {
      return server ? server.avg : null;
    }
    let sum = server ? server.avg * server.n : 0;
    let n = server ? server.n : 0;
    if (init != null && !Number.isNaN(init)) { sum -= init; n -= 1; }
    if (now != null && !Number.isNaN(now)) { sum += now; n += 1; }
    return n > 0 ? sum / n : null;
  }

  const deltaFor = (p: Player) => (showModel ? 0 : tiltFromConsensus(consensusAvg(p)));

  function readBaseAgreementValue(player: Player, columnKey: string): string {
    return player.agreement?.[columnKey] ?? '';
  }

  function readCommittedAgreementValueFromMap(
    player: Player,
    columnKey: string,
    savedMap: Record<string, string>,
  ): string {
    const key = cellKey(player, columnKey);
    if (hasKey(savedMap, key)) return savedMap[key];
    return readBaseAgreementValue(player, columnKey);
  }

  function readAgreementValueFromMaps(
    player: Player,
    columnKey: string,
    draftMap: Record<string, string>,
    savedMap: Record<string, string>,
  ): string {
    const key = cellKey(player, columnKey);
    if (hasKey(draftMap, key)) return draftMap[key];
    return readCommittedAgreementValueFromMap(player, columnKey, savedMap);
  }

  function readAgreementValue(player: Player, columnKey: string): string {
    return readAgreementValueFromMaps(player, columnKey, agreeDraft, agreeSaved);
  }

  function readLiveAgreementValue(player: Player, columnKey: string): string {
    return readAgreementValueFromMaps(player, columnKey, agreeDraftRef.current, agreeSavedRef.current);
  }

  function setDraftValue(key: string, value: string) {
    const next = { ...agreeDraftRef.current, [key]: value };
    agreeDraftRef.current = next;
    setAgreeDraft(next);
  }

  function setSavedValue(key: string, value: string) {
    const next = { ...agreeSavedRef.current, [key]: value };
    agreeSavedRef.current = next;
    setAgreeSaved(next);
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = data.players
      .filter((p) => p.position === pos)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.team ?? '').toLowerCase().includes(q));

    const valueOf = (p: Player): number => {
      const d = editing ? 0 : tiltFromConsensus(consensusAvg(p));
      if (sortKey === 'point' || sortKey === 'floor' || sortKey === 'ceiling') {
        const sv = scoredSeason(p, viewScoring);
        const adjPoint = adjustFP(p.position, sv.point, p.season, viewScoring, 'season', d);
        if (sortKey === 'point') return num(adjPoint);
        return num(scaleBound(sv[sortKey], sv.point, adjPoint));
      }
      return num(adjustStat(p.position, sortKey, p.season[sortKey], d));
    };
    const sorted = [...filtered].sort((a, b) => valueOf(b) - valueOf(a));
    if (sortDir === 'asc') sorted.reverse();
    return sorted;
  }, [data, pos, query, sortKey, sortDir, viewScoring, editing]);

  function unlockEditing() {
    if (!userId) {
      window.alert('Log in to enter your agreement scores.');
      return;
    }
    setEditing(true);
  }
  function lockEditing() {
    setEditing(false);
  }

  async function commitAgreement(player: Player, columnKey: string, valueString: string) {
    const key = cellKey(player, columnKey);
    const value = valueString.trim();
    const current = readCommittedAgreementValueFromMap(player, columnKey, agreeSavedRef.current);
    setDraftValue(key, value);
    if (value === current) return;
    setSavedValue(key, value);
    if (!userId) {
      setSaving((s) => ({ ...s, [key]: 'err' }));
      return;
    }
    setSaving((s) => ({ ...s, [key]: 'saving' }));

    const doWrite = async (uid: string) => {
      if (value === '') {
        // Clearing a cell deletes the user's row (RLS restricts it to their own).
        return supabase
          .from('olympus_agreement')
          .delete()
          .eq('position', player.position)
          .eq('player', player.name);
      }
      const score = Math.max(0, Math.min(100, Math.round(Number(value))));
      return supabase.from('olympus_agreement').upsert(
        { user_id: uid, position: player.position, player: player.name, score },
        { onConflict: 'user_id,position,player' },
      );
    };

    try {
      let { error } = await doWrite(userId);
      // A stale/expired session is the usual "can't save" cause: refresh once and retry.
      if (error) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        const freshUid = refreshed?.session?.user?.id ?? userId;
        if (refreshed?.session) {
          ({ error } = await doWrite(freshUid));
        }
      }
      if (error) {
        console.error('[agreement] save failed:', error);
        setSaveError(`Couldn’t save: ${error.message ?? error}. Make sure you’re logged in as the account that owns these scores, then try again.`);
        setSaving((s) => ({ ...s, [key]: 'err' }));
      } else {
        setSaveError(null);
        setSaving((s) => ({ ...s, [key]: 'ok' }));
      }
    } catch (e) {
      console.error('[agreement] save threw:', e);
      setSaveError(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
      setSaving((s) => ({ ...s, [key]: 'err' }));
    }
  }

  function moveAgreeFocus(currentRowId: string, columnKey: string, dir: -1 | 1) {
    const cells = Array.from(
      document.querySelectorAll<HTMLInputElement>(`.proj-agree-input[data-agree-col="${cssEscape(columnKey)}"]`),
    );
    const index = cells.findIndex((cell) => cell.dataset.agreeRow === currentRowId);
    const next = cells[index + dir];
    if (!next) return;
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  function moveAgreeColumn(currentRowId: string, columnKey: string, dir: -1 | 1) {
    const keys = agreeCols.map((column) => column.key);
    const index = keys.indexOf(columnKey);
    const targetKey = keys[index + dir];
    if (!targetKey) return;
    const target = document.querySelector<HTMLInputElement>(
      `.proj-agree-input[data-agree-col="${cssEscape(targetKey)}"][data-agree-row="${cssEscape(currentRowId)}"]`,
    );
    if (!target) return;
    target.focus();
    target.scrollIntoView({ block: 'nearest' });
  }

  function handleAgreeKeyDown(event: KeyboardEvent<HTMLInputElement>, player: Player, columnKey: string) {
    if (!rapidEntryEnabled) {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.currentTarget.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.currentTarget.blur();
      }
      return;
    }

    const key = event.key;

    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      const digit = Number(key);
      const value = digit === 0 ? 100 : digit * 10;
      void commitAgreement(player, columnKey, String(value));
      moveAgreeFocus(rowId(player), columnKey, 1);
      return;
    }

    switch (key) {
      case 'ArrowDown':
      case 'Enter':
        event.preventDefault();
        moveAgreeFocus(rowId(player), columnKey, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveAgreeFocus(rowId(player), columnKey, -1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveAgreeColumn(rowId(player), columnKey, 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveAgreeColumn(rowId(player), columnKey, -1);
        break;
      case 'Backspace':
      case 'Delete':
        event.preventDefault();
        void commitAgreement(player, columnKey, '');
        break;
      case 'Escape':
        event.preventDefault();
        event.currentTarget.blur();
        break;
      default:
        if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
        }
    }
  }

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
        <div className="proj-scoring" role="group" aria-label="Scoring system">
          {SCORING_OPTIONS.map((o) => (
            <button
              key={o.key}
              className={`proj-scoring__btn${o.key === viewScoring ? ' proj-scoring__btn--on' : ''}`}
              onClick={() => !editing && setScoring(o.key)}
              disabled={editing}
              title={editing ? 'Ratings are made against PPR' : `Show ${o.label} fantasy points`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="proj-controls__right">
          <input
            className="proj-search"
            type="search"
            placeholder={`Search ${nameLabel.toLowerCase()} or team…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {editing ? (
            <button className="proj-edit proj-edit--on" onClick={lockEditing} title="Stop editing agreement">
              Editing · Lock
            </button>
          ) : (
            <button
              className="proj-edit"
              onClick={unlockEditing}
              title={userId ? 'Edit your agreement scores' : 'Log in to edit'}
            >
              {userId ? 'Edit agreement' : 'Log in to edit'}
            </button>
          )}
          {editing ? (
            <div className="proj-agree-hint" role="note">
              <span className="proj-agree-hint__lead">Rapid entry</span>
              <span className="proj-rapid-mode" aria-label="Agreement entry mode">
                <button
                  aria-pressed={rapidEntryEnabled}
                  className={rapidEntryEnabled ? 'proj-rapid-mode__btn proj-rapid-mode__btn--on' : 'proj-rapid-mode__btn'}
                  onClick={() => setRapidEntryEnabled(true)}
                  type="button"
                >
                  Rapid
                </button>
                <button
                  aria-pressed={!rapidEntryEnabled}
                  className={!rapidEntryEnabled ? 'proj-rapid-mode__btn proj-rapid-mode__btn--on' : 'proj-rapid-mode__btn'}
                  onClick={() => setRapidEntryEnabled(false)}
                  type="button"
                >
                  Type exact
                </button>
              </span>
              {rapidEntryEnabled ? (
                <>
                  <span>
                    <kbd>1</kbd>–<kbd>9</kbd> = 10–90
                  </span>
                  <span>
                    <kbd>0</kbd> = 100
                  </span>
                  <span>
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> move
                  </span>
                  <span>
                    <kbd>←</kbd>
                    <kbd>→</kbd> switch name
                  </span>
                  <span>
                    <kbd>⌫</kbd> clear
                  </span>
                  <span>
                    <kbd>Esc</kbd> done
                  </span>
                </>
              ) : (
                <>
                  <span>Typing mode is on for exact values like 45.</span>
                  <span>
                    <kbd>Enter</kbd> save
                  </span>
                  <span>
                    <kbd>Esc</kbd> done
                  </span>
                </>
              )}
              <span className="proj-agree-hint__scale">
                <b>50</b> aligned · higher = up · lower = down
              </span>
              <span className="proj-agree-hint__ppr">Rate in <b>PPR</b> — your score applies across all formats.</span>
              <span className="proj-agree-hint__ppr">
                Signed in as <b>{session?.user?.email ?? '—'}</b>. Your scores save to this account only.
              </span>
              {saveError ? (
                <span className="proj-agree-hint__ppr" style={{ color: '#ff6b6b' }}>{saveError}</span>
              ) : null}
            </div>
          ) : null}
        </div>
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
              {agreeCols.map((column) => (
                <th key={column.key} className="proj-th proj-th--agree">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const isOpen = openName === p.id;
              return (
                <Fragment key={rowId(p)}>
                  <tr
                    className={`proj-row${isOpen ? ' proj-row--open' : ''}`}
                    onClick={() => setOpenName(isOpen ? null : p.id)}
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
                    {(() => {
                      const d = deltaFor(p);
                      return cols.map((c) => (
                        <td key={c.key} className="proj-td proj-td--num">
                          {fmt(adjustStat(p.position, c.key, p.season[c.key], d))}
                        </td>
                      ));
                    })()}
                    {(() => {
                      const d = deltaFor(p);
                      const sv = scoredSeason(p, viewScoring);
                      const point = adjustFP(p.position, sv.point, p.season, viewScoring, 'season', d);
                      const floor = scaleBound(sv.floor, sv.point, point);
                      const ceiling = scaleBound(sv.ceiling, sv.point, point);
                      return (
                        <>
                          <td className="proj-td proj-td--num proj-td--fp">{fmt(point)}</td>
                          <td className="proj-td proj-td--num proj-td--floor">{fmt(floor)}</td>
                          <td className="proj-td proj-td--num proj-td--ceil">{fmt(ceiling)}</td>
                        </>
                      );
                    })()}
                    {agreeCols.map((column) => {
                      const key = cellKey(p, column.key);
                      const currentValue = readAgreementValue(p, column.key);
                      return (
                        <td key={column.key} className="proj-td proj-td--agree" onClick={(e) => e.stopPropagation()}>
                          {editing ? (
                            <input
                              autoComplete="off"
                              className={[
                                'proj-agree-input',
                                agreeToneClass(currentValue),
                                saving[key] ? `proj-agree-input--${saving[key]}` : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              data-agree-col={column.key}
                              data-agree-row={rowId(p)}
                              inputMode="numeric"
                              placeholder="—"
                              spellCheck={false}
                              value={currentValue}
                              onBlur={() => {
                                void commitAgreement(p, column.key, readLiveAgreementValue(p, column.key));
                              }}
                              onChange={(e) => setDraftValue(key, e.target.value)}
                              onKeyDown={(e) => handleAgreeKeyDown(e, p, column.key)}
                            />
                          ) : (
                            // Overall view: the population consensus (average of
                            // everyone who rated), folding in this user's live
                            // edits so it's never stale after they save.
                            (() => {
                              const avg = consensusAvg(p);
                              const shown = avg == null ? null : Math.round(avg);
                              const n = p.consensus?.n ?? 0;
                              return (
                                <span
                                  className={['proj-agree-val', agreeToneClass(shown == null ? null : String(shown))]
                                    .filter(Boolean)
                                    .join(' ')}
                                  title={shown == null ? 'No ratings yet' : `Consensus of ${Math.max(1, n)} ${Math.max(1, n) === 1 ? 'rating' : 'ratings'}`}
                                >
                                  {shown ?? '—'}
                                </span>
                              );
                            })()
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="proj-week-row">
                      <td className="proj-week-cell" colSpan={totalColumns}>
                        <WeeklyGrid player={p} cols={cols} scoring={viewScoring} delta={deltaFor(p)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="proj-empty" colSpan={totalColumns}>
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

function WeeklyGrid({
  player,
  cols,
  scoring,
  delta,
}: {
  player: Player;
  cols: StatCol[];
  scoring: Scoring;
  delta: number;
}) {
  if (!player.weekly.length) {
    return <p className="proj-week-empty">No week-by-week schedule available.</p>;
  }
  // QB2s are backups: they carry real fill-in projections in the data, but week to
  // week we assume they don't start, so their weekly cells are shown as 0.
  const zeroWk = player.position === 'QB' && Number(player.depthRank) === 2;
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
            <th className="proj-th--num">Floor</th>
            <th className="proj-th--num">Ceil</th>
          </tr>
        </thead>
        <tbody>
          {player.weekly.map((w, idx) => {
            const home = Number(w.game_location) === 1; // 1 = home, -1 = away
            const sw = scoredWeek(player, w, scoring);
            const point = adjustFP(player.position, numOrNull(sw.point), w, scoring, 'weekly', delta);
            const floor = scaleBound(numOrNull(sw.floor), numOrNull(sw.point), point);
            const ceiling = scaleBound(numOrNull(sw.ceiling), numOrNull(sw.point), point);
            return (
              <tr key={`${w.week}-${idx}`}>
                <td>{String(w.week ?? idx + 1)}</td>
                <td className="proj-week-opp">
                  {home ? 'vs ' : '@ '}
                  {String(w.opponent ?? '—')}
                </td>
                {cols.map((c) => {
                  const key = c.weeklyKey ?? c.key;
                  return (
                    <td key={c.key} className="proj-td--num">
                      {zeroWk ? fmt(0) : fmt(adjustStat(player.position, key, w[key], delta))}
                    </td>
                  );
                })}
                <td className="proj-td--num proj-td--fp">{zeroWk ? fmt(0) : fmt(point)}</td>
                <td className="proj-td--num proj-week-floor">{zeroWk ? fmt(0) : fmt(floor)}</td>
                <td className="proj-td--num proj-week-ceil">{zeroWk ? fmt(0) : fmt(ceiling)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
