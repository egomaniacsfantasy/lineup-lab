import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { RankingMechanic } from '../components/rankings/RankingMechanic';
import { PlayerVotePrompt } from '../components/votes/PlayerVotePrompt';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { isAgreementAdmin } from '../utils/admin';
import { toPlayer } from '../adapters/connectedLeague';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { fetchBoard, type BoardRow } from '../services/leagueApi';
import type { Player } from '../types';
import { computeLegacyAdjustedValues } from './legacyAdjustedValue';
import './MyBoardPage.css';

type Row = Record<string, unknown>;
type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
type BoardPosition = 'ALL' | Position;
type BoardView = 'board' | 'sheet';
interface ProjectionPlayer {
  id: string;
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

interface ProjectionDataset {
  updatedAt: number;
  count: number;
  perPosition: Record<string, number>;
  players: ProjectionPlayer[];
}

interface MergedBoardPlayer {
  board: BoardRow;
  projection: ProjectionPlayer | null;
  adjustedValue: number;
  vor: number;
}

interface StatColumn {
  key: string;
  label: string;
}

const BOARD_POSITIONS: BoardPosition[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
/* One surface, two densities. Both render the same rows, the same filters
   and the same sort; only the amount of detail per row changes. */
const VIEW_OPTIONS: Array<{ key: BoardView; label: string }> = [
  { key: 'board', label: 'Cards' },
  { key: 'sheet', label: 'Table' },
];

/* Board order is the default and is the board's own ranking. The other
   options are user-initiated lenses on columns already displayed; none of
   them re-rank an engine recommendation list. */
type BoardSort = 'board' | 'points' | 'floor' | 'ceiling';
const SORT_OPTIONS: Array<{ key: BoardSort; label: string }> = [
  { key: 'board', label: 'Board order' },
  { key: 'points', label: 'Proj pts' },
  { key: 'floor', label: 'Floor' },
  { key: 'ceiling', label: 'Ceiling' },
];

function parseSort(raw: string | null): BoardSort {
  return SORT_OPTIONS.some((option) => option.key === raw) ? (raw as BoardSort) : 'board';
}

const POSITION_STAT_COLUMNS: Record<Position, StatColumn[]> = {
  QB: [
    { key: 'passing_yards_adj', label: 'Pass yards' },
    { key: 'passing_tds_adj', label: 'Pass TDs' },
    { key: 'rushing_yards_adj', label: 'Rush yards' },
    { key: 'rushing_tds_adj', label: 'Rush TDs' },
    { key: 'interceptions_adj', label: 'Interceptions' },
    { key: 'fumbles_adj', label: 'Fumbles' },
  ],
  RB: [
    { key: 'rushing_yards', label: 'Rush yards' },
    { key: 'rushing_tds', label: 'Rush TDs' },
    { key: 'receiving_yards', label: 'Rec yards' },
    { key: 'receiving_tds', label: 'Rec TDs' },
    { key: 'receptions', label: 'Receptions' },
    { key: 'fumbles_lost', label: 'Fumbles lost' },
  ],
  WR: [
    { key: 'receiving_yards', label: 'Rec yards' },
    { key: 'receiving_tds', label: 'Rec TDs' },
    { key: 'receptions', label: 'Receptions' },
    { key: 'rushing_yards', label: 'Rush yards' },
    { key: 'rushing_tds', label: 'Rush TDs' },
  ],
  TE: [
    { key: 'receiving_yards', label: 'Rec yards' },
    { key: 'receiving_tds', label: 'Rec TDs' },
    { key: 'receptions', label: 'Receptions' },
  ],
  K: [
    { key: 'pred_fg_attempts', label: 'FG attempts' },
    { key: 'projected_fg_fp', label: 'FG points' },
    { key: 'pred_pat_att', label: 'XP attempts' },
    { key: 'projected_xp_fp', label: 'XP points' },
  ],
  DEF: [
    { key: 'pred_sacks', label: 'Sacks' },
    { key: 'pred_ints', label: 'Interceptions' },
    { key: 'pred_fr', label: 'Fumble recs' },
    { key: 'pred_def_tds', label: 'Def TDs' },
    { key: 'pred_pa', label: 'Points allowed' },
    { key: 'pred_ya', label: 'Yards allowed' },
  ],
};

function fmtNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '-';
  return digits > 0 ? value.toFixed(digits) : Math.round(value).toString();
}

function statValue(value: unknown, digits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return digits > 0 ? num.toFixed(digits) : Math.round(num).toString();
}

function clampRating(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratingSummary(value: number) {
  if (value > 50) return `Agreement ${value} · lifts him vs Franco's number.`;
  if (value < 50) return `Agreement ${value} · pushes him down vs Franco's number.`;
  return `Agreement ${value} · aligned with Franco's number.`;
}

function saveConfirmation(value: number) {
  return `Saved ${value}. The board reprices in a few seconds.`;
}

function scoringLabel(scoring: string | undefined) {
  if (scoring === 'half-ppr') return 'Half-PPR';
  if (scoring === 'standard') return 'Standard';
  return 'PPR';
}

function formatUpdatedDate(timestamp: number | null | undefined) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function parseView(raw: string | null): BoardView {
  return raw === 'sheet' ? 'sheet' : 'board';
}

function parsePosition(raw: string | null): BoardPosition {
  return BOARD_POSITIONS.includes((raw ?? '').toUpperCase() as BoardPosition)
    ? ((raw ?? '').toUpperCase() as BoardPosition)
    : 'ALL';
}

function boardPlayer(row: BoardRow, catalog?: Parameters<typeof toPlayer>[1]): Player {
  if (catalog?.[row.playerId]) {
    return toPlayer(row.playerId, catalog);
  }
  return {
    id: row.playerId,
    name: row.name,
    shortName: row.name,
    position:
      row.position === 'QB' ||
      row.position === 'RB' ||
      row.position === 'WR' ||
      row.position === 'TE' ||
      row.position === 'K' ||
      row.position === 'DEF'
        ? row.position
        : 'WR',
    team: row.team || 'FA',
    headshotUrl:
      row.position === 'DEF'
        ? `/api/img/logo/${(row.team || row.playerId).toLowerCase()}`
        : `/api/img/headshot/${row.playerId}`,
    teamLogoUrl: `/api/img/logo/${(row.team || 'fa').toLowerCase()}`,
    bye: 0,
    isActive: true,
  };
}

function nextMatchup(projection: ProjectionPlayer | null, currentWeek: number | null) {
  if (!projection?.weekly.length) return null;
  const sorted = projection.weekly
    .slice()
    .sort((a, b) => Number(a.week ?? 0) - Number(b.week ?? 0));
  if (currentWeek != null) {
    const upcoming = sorted.find((week) => Number(week.week) >= currentWeek);
    if (upcoming) return upcoming;
  }
  return sorted[0] ?? null;
}

/* Franco publishes a floor, a point projection and a ceiling for every week,
   in each scoring format. Pick the fields the league actually scores; nothing
   is derived here. */
const WEEKLY_SCORING_FIELDS: Record<string, { pts: string; floor: string; ceiling: string }> = {
  ppr: { pts: 'fantasy_pts', floor: 'fantasy_pts_floor', ceiling: 'fantasy_pts_ceiling' },
  'half-ppr': { pts: 'fantasy_pts_half', floor: 'fantasy_pts_floor_half', ceiling: 'fantasy_pts_ceiling_half' },
  standard: { pts: 'fantasy_pts_nonppr', floor: 'fantasy_pts_floor_nonppr', ceiling: 'fantasy_pts_ceiling_nonppr' },
};

type WeekColumn = {
  week: number;
  pts: number | null;
  floor: number | null;
  ceiling: number | null;
  opponent: string | null;
  home: boolean | null;
};

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Franco's week-by-week projection for one player: each week is a floor to
 * ceiling range with his point projection marked inside it. Weeks missing
 * from the payload are byes. Display only; bars scale to the player's own
 * highest ceiling and no value is derived.
 */
function WeeklyProjectionStrip({
  projection,
  fallbackWeekly,
  scoring,
  currentWeek,
  playoffWeekStart,
}: {
  projection: ProjectionPlayer | null;
  fallbackWeekly: Record<string, number> | null | undefined;
  scoring: string | undefined;
  currentWeek: number | null;
  playoffWeekStart: number | null;
}) {
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const fields = WEEKLY_SCORING_FIELDS[scoring ?? 'ppr'] ?? WEEKLY_SCORING_FIELDS.ppr;

  const byWeek = new Map<number, WeekColumn>();
  for (const row of projection?.weekly ?? []) {
    const week = num(row.week);
    if (week == null) continue;
    byWeek.set(week, {
      week,
      pts: num(row[fields.pts]),
      floor: num(row[fields.floor]),
      ceiling: num(row[fields.ceiling]),
      opponent: typeof row.opponent === 'string' ? row.opponent : null,
      home: row.game_location == null ? null : Number(row.game_location) === 1,
    });
  }
  // Leagues whose projection sheet has not landed still get the points curve
  // the rankings endpoint returns.
  if (byWeek.size === 0) {
    for (const [key, value] of Object.entries(fallbackWeekly ?? {})) {
      const week = Number(key);
      if (!Number.isFinite(week)) continue;
      byWeek.set(week, { week, pts: num(value), floor: null, ceiling: null, opponent: null, home: null });
    }
  }
  if (byWeek.size === 0) return null;

  const weeks = [...byWeek.keys()].sort((left, right) => left - right);
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const scale = Math.max(
    ...weeks.map((week) => byWeek.get(week)!.ceiling ?? byWeek.get(week)!.pts ?? 0),
  );
  if (!(scale > 0)) return null;

  const played = weeks.map((week) => byWeek.get(week)!).filter((column) => column.pts != null);
  const best = played.reduce((top, column) => (column.pts! > top.pts! ? column : top), played[0]);
  const worst = played.reduce((low, column) => (column.pts! < low.pts! ? column : low), played[0]);

  const columns: WeekColumn[] = [];
  for (let week = first; week <= last; week += 1) {
    columns.push(byWeek.get(week) ?? { week, pts: null, floor: null, ceiling: null, opponent: null, home: null });
  }
  const hasPlayoffWeeks = playoffWeekStart != null && columns.some((c) => c.week >= playoffWeekStart);
  const detail = openWeek == null ? null : byWeek.get(openWeek) ?? null;
  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / scale) * 100))}%`;

  return (
    <div className="board-card__weekly">
      <div className="board-card__weekly-head">
        <span className="board-card__stat-label">Week by week</span>
        <span className="board-card__weekly-legend">
          Floor to ceiling · best wk {best.week} · {fmtNumber(best.pts)} · worst wk {worst.week} · {fmtNumber(worst.pts)}
        </span>
      </div>
      <div className="board-card__weekly-bars">
        {columns.map((column) => {
          const isBye = column.pts == null;
          const isPlayoff = playoffWeekStart != null && column.week >= playoffWeekStart;
          const isNow = currentWeek != null && column.week === currentWeek;
          const isOpen = openWeek === column.week;
          const floor = column.floor ?? column.pts ?? 0;
          const ceiling = column.ceiling ?? column.pts ?? 0;
          return (
            <button
              aria-label={
                isBye
                  ? `Week ${column.week}: bye week`
                  : `Week ${column.week}: ${fmtNumber(column.pts)} points, floor ${fmtNumber(column.floor)}, ceiling ${fmtNumber(column.ceiling)}`
              }
              className={[
                'board-card__weekly-col',
                isBye ? 'board-card__weekly-col--bye' : '',
                isPlayoff ? 'board-card__weekly-col--playoff' : '',
                isNow ? 'board-card__weekly-col--now' : '',
                isOpen ? 'board-card__weekly-col--open' : '',
                column.week === best.week && !isBye ? 'board-card__weekly-col--best' : '',
                column.week === worst.week && !isBye ? 'board-card__weekly-col--worst' : '',
              ].filter(Boolean).join(' ')}
              key={column.week}
              onClick={() => setOpenWeek(isOpen || isBye ? null : column.week)}
              type="button"
            >
              <span className="board-card__weekly-track">
                {isBye ? (
                  <span className="board-card__weekly-bye">Bye</span>
                ) : (
                  <>
                    <span
                      className="board-card__weekly-range"
                      style={{ bottom: pct(floor), height: pct(Math.max(0, ceiling - floor)) }}
                    />
                    <span className="board-card__weekly-point" style={{ bottom: pct(column.pts!) }} />
                  </>
                )}
              </span>
              <span className="board-card__weekly-week">{column.week}</span>
            </button>
          );
        })}
      </div>
      {detail ? (
        <p className="board-card__weekly-detail">
          <strong>Week {detail.week}</strong>
          {detail.opponent ? ` · ${detail.home === false ? '@' : 'vs'} ${detail.opponent}` : ''}
          {' · '}
          <span className="board-card__weekly-detail-pts">{fmtNumber(detail.pts, 1)}</span> proj
          {detail.floor != null && detail.ceiling != null
            ? ` · floor ${fmtNumber(detail.floor, 1)} · ceiling ${fmtNumber(detail.ceiling, 1)}`
            : ''}
        </p>
      ) : (
        <p className="board-card__weekly-note">
          Tap a week for its floor and ceiling.
          {hasPlayoffWeeks ? ' Shaded weeks are your league\u2019s playoffs.' : ''}
        </p>
      )}
    </div>
  );
}

function tierLabel(tier: number | null) {
  return tier == null ? null : `Tier ${tier}`;
}

function columnCountForSheet(statsCount: number) {
  return 6 + statsCount;
}

export function MyBoardPage() {
  const { bootstrap } = useLeagueConnection();
  const [searchParams, setSearchParams] = useSearchParams();
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [projectionData, setProjectionData] = useState<ProjectionDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [voteOpen, setVoteOpen] = useState(false);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isAdmin = isAgreementAdmin(user?.email);
  const [agreeSaved, setAgreeSaved] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, 'saving' | 'ok' | 'err'>>({});
  const [saveMessages, setSaveMessages] = useState<Record<string, string>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const activeView = parseView(searchParams.get('view'));
  const activePosition = parsePosition(searchParams.get('pos'));
  const activeSort = parseSort(searchParams.get('sort'));
  const query = searchParams.get('q') ?? '';
  const [searchDraft, setSearchDraft] = useState(query);
  const deferredQuery = useDeferredValue(searchDraft.trim().toLowerCase());
  const scoring = bootstrap?.league.scoringFamily;
  const numTeams = bootstrap?.league.totalTeams ?? 12;
  const sheetStatColumns =
    activePosition === 'ALL' ? [] : POSITION_STAT_COLUMNS[activePosition as Position];


  useEffect(() => {
    setSearchDraft((current) => (current === query ? current : query));
  }, [query]);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchBoard(800, scoring)
      .then((payload) => {
        if (!alive) return;
        if (!payload.available) {
          setBoard([]);
          return;
        }
        setBoard(payload.rankings);
      })
      .catch((err) => {
        if (!alive) return;
        setError(String(err?.message ?? err));
      });
    return () => {
      alive = false;
    };
  }, [reloadToken, scoring]);

  useEffect(() => {
    let alive = true;
    fetch('/api/projections')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((payload: ProjectionDataset) => {
        if (!alive) return;
        setProjectionData(payload);
      })
      .catch((err) => {
        if (!alive) return;
        setError(String(err?.message ?? err));
      });
    return () => {
      alive = false;
    };
  }, [reloadToken]);

  /* Only admins edit agreement, so only admins need their saved values. The
     server averages every collaborator's row per player; this shows yours. */
  useEffect(() => {
    if (!isAdmin || !userId) {
      setAgreeSaved({});
      return undefined;
    }
    let alive = true;
    supabase
      .from('olympus_agreement')
      .select('position, player, score')
      .eq('user_id', userId)
      .then(({ data, error: loadError }) => {
        if (!alive || loadError || !data || !board) return;
        const byIdentity = new Map<string, string>();
        for (const row of data) byIdentity.set(`${row.position}::${row.player}`, String(row.score));
        const next: Record<string, string> = {};
        for (const row of board) {
          const hit = byIdentity.get(`${row.position}::${row.name}`);
          if (hit != null) next[row.playerId] = hit;
        }
        setAgreeSaved(next);
      });
    return () => {
      alive = false;
    };
  }, [board, isAdmin, userId]);

  const projectionById = useMemo(
    () =>
      new Map(
        (projectionData?.players ?? []).map((player) => [player.id, player] as const),
      ),
    [projectionData],
  );

  const projectionByIdentity = useMemo(
    () =>
      new Map<string, ProjectionPlayer>(
        (projectionData?.players ?? []).map((player) => [
          `${player.position}::${player.name}`,
          player,
        ] as const),
      ),
    [projectionData],
  );

  const legacyValues = useMemo(
    () =>
      board
        ? computeLegacyAdjustedValues(board, numTeams, bootstrap?.league.rosterPositions)
        : new Map<string, { adjustedValue: number; vor: number }>(),
    [board, bootstrap?.league.rosterPositions, numTeams],
  );

  const mergedRows = useMemo(() => {
    if (!board) return [];
    return board.map((row) => {
      const projection =
        projectionById.get(row.playerId)
        ?? projectionByIdentity.get(`${row.position}::${row.name}`)
        ?? null;
      const legacy = legacyValues.get(row.playerId) ?? { adjustedValue: 0, vor: 0 };
      return {
        board: row,
        projection,
        adjustedValue: legacy.adjustedValue,
        vor: legacy.vor,
      } satisfies MergedBoardPlayer;
    });
  }, [board, legacyValues, projectionById, projectionByIdentity]);

  const visibleRows = useMemo(() => {
    const filtered = mergedRows.filter((row) => {
      if (activePosition !== 'ALL' && row.board.position !== activePosition) return false;
      if (!deferredQuery) return true;
      const haystack = [
        row.board.name,
        row.board.team,
        row.projection?.team,
        row.projection?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(deferredQuery);
    });
    const boardOrder = (a: MergedBoardPlayer, b: MergedBoardPlayer) =>
      b.adjustedValue - a.adjustedValue || a.board.rank - b.board.rank;
    const numeric = (value: number | null | undefined) =>
      value == null || !Number.isFinite(value) ? Number.NEGATIVE_INFINITY : value;
    const sorted = filtered.slice().sort((a, b) => {
      switch (activeSort) {
        case 'points':
          return numeric(b.board.seasonTotal) - numeric(a.board.seasonTotal) || boardOrder(a, b);
        case 'floor':
          return numeric(b.board.floor) - numeric(a.board.floor) || boardOrder(a, b);
        case 'ceiling':
          return numeric(b.board.ceiling) - numeric(a.board.ceiling) || boardOrder(a, b);
        default:
          return boardOrder(a, b);
      }
    });
    return activePosition === 'ALL' ? sorted.slice(0, 300) : sorted;
  }, [activePosition, activeSort, deferredQuery, mergedRows]);




  useEffect(() => {
    if (openPlayerId && !visibleRows.some((row) => row.board.playerId === openPlayerId)) {
      setOpenPlayerId(null);
    }
  }, [openPlayerId, visibleRows]);

  function updateSearchParam(next: Record<string, string | null>) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      Object.entries(next).forEach(([key, value]) => {
        if (!value) params.delete(key);
        else params.set(key, value);
      });
      return params;
    }, { replace: true });
  }

  function readRating(playerId: string) {
    return agreeSaved[playerId] ?? '';
  }

  /* Writes this admin's agreement score, then pings the server so the
     agreement-weighted board and pricing recompute in seconds. The value is
     stored and averaged server side; nothing is computed here. */
  async function commitAgreementValue(player: MergedBoardPlayer, nextValue: string) {
    if (!isAdmin) return;
    const id = player.board.playerId;
    const normalized = String(clampRating(Number(nextValue)));
    if (readRating(id) === normalized) return;

    setSaving((current) => ({ ...current, [id]: 'saving' }));
    setSaveErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    if (!userId) {
      setSaving((current) => ({ ...current, [id]: 'err' }));
      setSaveErrors((current) => ({ ...current, [id]: 'Log in to save agreement.' }));
      return;
    }

    const { error: writeError } = await supabase.from('olympus_agreement').upsert(
      {
        user_id: userId,
        position: player.board.position,
        player: player.board.name,
        score: Number(normalized),
      },
      { onConflict: 'user_id,position,player' },
    );

    if (writeError) {
      setSaving((current) => ({ ...current, [id]: 'err' }));
      setSaveErrors((current) => ({ ...current, [id]: `Could not save: ${writeError.message}` }));
      return;
    }

    setAgreeSaved((current) => ({ ...current, [id]: normalized }));
    setSaving((current) => ({ ...current, [id]: 'ok' }));
    setSaveMessages((current) => ({ ...current, [id]: saveConfirmation(Number(normalized)) }));
    void fetch('/api/projections/refresh-adjusted', { method: 'POST' }).catch(() => null);
    setReloadToken((current) => current + 1);
    window.setTimeout(() => {
      setSaveMessages((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }, 2400);
  }

  function toggleOpenPlayer(playerId: string) {
    setOpenPlayerId((current) => (current === playerId ? null : playerId));
  }


  if (error) {
    return (
      <div className="board-page">
        <p className="board-page__state board-page__state--error">Could not load Board: {error}</p>
      </div>
    );
  }

  if (!board || !projectionData) {
    return (
      <div className="board-page">
        {!bootstrap ? (
          <SeasonalNotice>
            Your league is still syncing, so the Board is waiting on league context before it can load.
          </SeasonalNotice>
        ) : null}
        {bootstrap ? <p className="board-page__state">Loading Board…</p> : <RankingMechanic />}
      </div>
    );
  }

  return (
    <div className="board-page">
      <h1 className="visually-hidden">Board</h1>
      {!bootstrap ? (
        <SeasonalNotice>
          Your league is still syncing, so this Board is using league-neutral starter assumptions for now.
        </SeasonalNotice>
      ) : null}

      <header className="board-page__hero">
        <div className="board-page__hero-copy">
          <p className="board-page__eyebrow">Board</p>
          <h2 className="board-page__title">Player value</h2>
          <p className="board-page__caption">
            Franco&apos;s projections · {scoringLabel(scoring)}
          </p>
          <p className="board-page__freshness">
            Updated {formatUpdatedDate(projectionData.updatedAt)} · {board.length} players
          </p>
        </div>
        <div className="board-page__view-toggle" role="tablist" aria-label="Row density">
          {VIEW_OPTIONS.map((option) => (
            <button
              aria-selected={activeView === option.key}
              className={[
                'board-page__view-pill',
                activeView === option.key ? 'board-page__view-pill--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={option.key}
              onClick={() => updateSearchParam({ view: option.key })}
              role="tab"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <section className="board-page__filter-bar" aria-label="Board filters">
        <div className="board-page__position-row">
          {BOARD_POSITIONS.map((position) => (
            <button
              className={[
                'board-page__chip',
                activePosition === position ? 'board-page__chip--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={position}
              onClick={() => updateSearchParam({ pos: position === 'ALL' ? null : position })}
              type="button"
            >
              {position === 'ALL' ? 'Overall' : position}
            </button>
          ))}
        </div>
        <div className="board-page__filter-tools">
          <label className="board-page__sort">
            <span className="board-page__sort-label">Sort</span>
            <select
              className="board-page__sort-select"
              onChange={(event) =>
                updateSearchParam({ sort: event.target.value === 'board' ? null : event.target.value })
              }
              value={activeSort}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <input
            className="board-page__search"
            onChange={(event) => {
              const nextValue = event.target.value;
              setSearchDraft(nextValue);
              updateSearchParam({ q: nextValue || null });
            }}
            placeholder="Search player or team"
            type="search"
            value={searchDraft}
          />
        </div>
      </section>

      <PlayerVotePrompt onClose={() => setVoteOpen(false)} open={voteOpen} />

      {activeView === 'board' ? (
        <section className="board-page__stack" aria-label="Board view">
          {visibleRows.map((player, index) => {
            const isOpen = openPlayerId === player.board.playerId;
                const currentTier = player.board.tier;
            const previousTier = index > 0 ? visibleRows[index - 1]?.board.tier ?? null : null;
            return (
              <Fragment key={player.board.playerId}>
                {currentTier != null && currentTier !== previousTier ? (
                  <div className="board-page__tier-break">
                    <span>{tierLabel(currentTier)}</span>
                  </div>
                ) : null}
                <article
                  className={[
                    'board-page__row',
                    isOpen ? 'board-page__row--open' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {isOpen ? (
                    <BoardPlayerCard
                      admin={isAdmin ? {
                        rating: readRating(player.board.playerId),
                        savingState: saving[player.board.playerId],
                        saveMessage: saveMessages[player.board.playerId] ?? '',
                        saveError: saveErrors[player.board.playerId] ?? '',
                        onCommit: (value: number) => void commitAgreementValue(player, String(value)),
                      } : null}
                      currentWeek={bootstrap?.week ?? null}
                      playoffWeekStart={bootstrap?.league.playoffWeekStart ?? null}
                      scoring={scoring}
                      mode="standalone"
                      onClose={() => setOpenPlayerId(null)}
                      player={player}
                      rank={index + 1}
                    />
                  ) : (
                    <button
                      aria-expanded={false}
                      className="board-page__row-button"
                      onClick={() => toggleOpenPlayer(player.board.playerId)}
                      type="button"
                    >
                      <div className="board-page__identity">
                        <span className="board-page__rank">{index + 1}</span>
                        <PlayerHeadshot
                          className="board-page__headshot"
                          fallbackClassName="board-page__headshot-fallback"
                          imageClassName="board-page__headshot-image"
                          player={boardPlayer(player.board, bootstrap?.players)}
                        />
                        <span className="board-page__identity-copy">
                          <span className="board-page__name-row">
                            <span className="board-page__name">{player.board.name}</span>
                                      </span>
                          <span className="board-page__meta">
                            {player.board.position} · {player.board.team}
                          </span>
                        </span>
                      </div>

                      <div className="board-page__value">
                        <span className="board-page__value-label">Value</span>
                        <span className="board-page__headline">{fmtNumber(player.adjustedValue)}</span>
                        <span className="board-page__subline">
                          {player.vor >= 0 ? '+' : ''}
                          {fmtNumber(player.vor)} vs waiver-level starter · {fmtNumber(player.board.seasonTotal)} proj pts
                        </span>
                      </div>
                    </button>
                  )}
                </article>
              </Fragment>
            );
          })}
          {visibleRows.length === 0 ? (
            <p className="board-page__empty">No players match this filter.</p>
          ) : null}
        </section>
      ) : (
        <section className="board-page__sheet" aria-label="Sheet view">
          <div className="board-page__table-wrap">
            <table className="board-page__table">
              <thead>
                <tr>
                  <th className="board-page__th board-page__th--rank">#</th>
                  <th className="board-page__th board-page__th--sticky">Player</th>
                  <th className="board-page__th board-page__th--num">Value</th>
                  <th className="board-page__th board-page__th--num">Proj pts</th>
                  <th className="board-page__th board-page__th--num">Floor</th>
                  <th className="board-page__th board-page__th--num">Ceiling</th>
                  {sheetStatColumns.map((column) => (
                    <th className="board-page__th board-page__th--num" key={column.key}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((player, index) => {
                  const isOpen = openPlayerId === player.board.playerId;
                  return (
                    <Fragment key={player.board.playerId}>
                      <tr
                        className={[
                          'board-page__table-row',
                          isOpen ? 'board-page__table-row--open' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => toggleOpenPlayer(player.board.playerId)}
                      >
                        <td className="board-page__td board-page__td--rank">{index + 1}</td>
                        <td className="board-page__td board-page__td--sticky">
                          <div className="board-page__table-player">
                            <PlayerHeadshot
                              className="board-page__table-shot"
                              fallbackClassName="board-page__table-shot-fallback"
                              imageClassName="board-page__table-shot-image"
                              player={boardPlayer(player.board, bootstrap?.players)}
                            />
                            <span className="board-page__table-copy">
                              <span className="board-page__name-row">
                                <span className="board-page__table-name">{player.board.name}</span>
                              </span>
                              <span className="board-page__table-meta">
                                {player.board.position} · {player.board.team}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="board-page__td board-page__td--num board-page__td--headline">
                          {fmtNumber(player.adjustedValue)}
                        </td>
                        <td className="board-page__td board-page__td--num">{fmtNumber(player.board.seasonTotal)}</td>
                        <td className="board-page__td board-page__td--num">{fmtNumber(player.board.floor)}</td>
                        <td className="board-page__td board-page__td--num">{fmtNumber(player.board.ceiling)}</td>
                        {sheetStatColumns.map((column) => (
                          <td className="board-page__td board-page__td--num" key={column.key}>
                            {statValue(player.projection?.season[column.key])}
                          </td>
                        ))}
                      </tr>
                      {isOpen ? (
                        <tr className="board-page__detail-row">
                          <td
                            className="board-page__detail-cell"
                            colSpan={columnCountForSheet(sheetStatColumns.length)}
                          >
                            <BoardPlayerCard
                              admin={isAdmin ? {
                                rating: readRating(player.board.playerId),
                                savingState: saving[player.board.playerId],
                                saveMessage: saveMessages[player.board.playerId] ?? '',
                                saveError: saveErrors[player.board.playerId] ?? '',
                                onCommit: (value: number) => void commitAgreementValue(player, String(value)),
                              } : null}
                              currentWeek={bootstrap?.week ?? null}
                              playoffWeekStart={bootstrap?.league.playoffWeekStart ?? null}
                              scoring={scoring}
                              mode="embedded"
                              onClose={() => setOpenPlayerId(null)}
                              player={player}
                              rank={index + 1}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      className="board-page__empty-cell"
                      colSpan={columnCountForSheet(sheetStatColumns.length)}
                    >
                      No players match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/** Agreement is the collaborators' dial on Franco's number: 50 is aligned,
 *  higher lifts him, lower pushes him down. The server averages every
 *  collaborator's value and reweights the board from it. */
function AgreementEditor({
  rating,
  savingState,
  saveMessage,
  saveError,
  onCommit,
}: {
  rating: string;
  savingState: 'saving' | 'ok' | 'err' | undefined;
  saveMessage: string;
  saveError: string;
  onCommit: (value: number) => void;
}) {
  const saved = rating === '' ? 50 : clampRating(Number(rating));
  const [draft, setDraft] = useState(saved);
  useEffect(() => {
    if (savingState === 'saving') return;
    setDraft(saved);
  }, [saved, savingState]);

  return (
    <div className="board-card__rating">
      <div className="board-card__rating-head">
        <div>
          <p className="board-card__rating-label">Agreement · admin</p>
          <p className="board-card__rating-copy">{ratingSummary(draft)}</p>
        </div>
        <span className="board-card__rating-chip">{draft}</span>
      </div>
      <div className="board-card__slider-wrap">
        <span className="board-card__slider-end">Much lower</span>
        <input
          aria-label="Agreement score"
          className="board-card__slider"
          max={100}
          min={0}
          onChange={(event) => setDraft(clampRating(Number(event.currentTarget.value)))}
          onMouseUp={(event) => onCommit(clampRating(Number(event.currentTarget.value)))}
          onKeyUp={(event) => onCommit(clampRating(Number(event.currentTarget.value)))}
          onTouchEnd={(event) => onCommit(clampRating(Number(event.currentTarget.value)))}
          type="range"
          value={draft}
        />
        <span className="board-card__slider-end">Much higher</span>
      </div>
      <div className="board-card__rating-actions">
        <button
          className="board-card__rating-reset"
          onClick={() => {
            setDraft(50);
            onCommit(50);
          }}
          type="button"
        >
          Reset to 50
        </button>
        {savingState === 'saving' ? <span className="board-card__save-note">Saving…</span> : null}
        {saveMessage ? <span className="board-card__save-note board-card__save-note--ok">{saveMessage}</span> : null}
        {saveError ? <span className="board-card__save-note board-card__save-note--error">{saveError}</span> : null}
      </div>
    </div>
  );
}

export function BoardPlayerCard({
  player,
  currentWeek,
  playoffWeekStart = null,
  scoring,
  mode,
  rank,
  onClose,
  admin,
}: {
  player: MergedBoardPlayer;
  currentWeek: number | null;
  playoffWeekStart?: number | null;
  scoring?: string;
  mode: 'standalone' | 'embedded';
  rank: number;
  onClose: () => void;
  admin?: {
    rating: string;
    savingState: 'saving' | 'ok' | 'err' | undefined;
    saveMessage: string;
    saveError: string;
    onCommit: (value: number) => void;
  } | null;
}) {
  const projection = player.projection;
  const matchup = nextMatchup(projection, currentWeek);
  const stats = POSITION_STAT_COLUMNS[player.board.position as Position];

  const floor = player.board.floor ?? 0;
  const ceiling = player.board.ceiling ?? 0;
  const total = player.board.seasonTotal ?? 0;
  const rangeSpan = Math.max(1, ceiling - floor);
  const marker = Math.min(100, Math.max(0, ((total - floor) / rangeSpan) * 100));
  const tier = tierLabel(player.board.tier);

  return (
    <div className={['board-card', mode === 'embedded' ? 'board-card--embedded' : ''].filter(Boolean).join(' ')}>
      {mode === 'standalone' ? (
        <div className="board-card__hero board-card__hero--full">
          <div className="board-card__identity">
            <span className="board-page__rank">{rank}</span>
            <PlayerHeadshot
              className="board-card__shot"
              fallbackClassName="board-card__shot-fallback"
              imageClassName="board-card__shot-image"
              player={boardPlayer(player.board)}
            />
            <div className="board-card__hero-copy">
              <p className="board-card__name-row">
                <span className="board-card__name">{player.board.name}</span>
              </p>
              <p className="board-card__meta">
                {player.board.position} · {player.board.team}
                {matchup ? (
                  <>
                    {' '}
                    · Week {String(matchup.week ?? '-')} {Number(matchup.game_location) === 1 ? 'vs' : '@'}{' '}
                    {String(matchup.opponent ?? '-')}
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="board-card__hero-value">
            <span className="board-card__value-label">Value</span>
            <span className="board-card__headline">{fmtNumber(player.adjustedValue)}</span>
            <span className="board-card__subline">
              {player.vor >= 0 ? '+' : ''}
              {fmtNumber(player.vor)} vs waiver-level starter
            </span>
          </div>
          <button
            aria-label={`Collapse ${player.board.name}`}
            className="board-card__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="board-card__summary">
        <div className="board-card__stat">
          <span className="board-card__stat-label">Proj pts</span>
          <span className="board-card__stat-value">{fmtNumber(player.board.seasonTotal)}</span>
        </div>
        <div className="board-card__stat">
          <span className="board-card__stat-label">Floor</span>
          <span className="board-card__stat-value">{fmtNumber(player.board.floor)}</span>
        </div>
        <div className="board-card__stat">
          <span className="board-card__stat-label">Ceiling</span>
          <span className="board-card__stat-value">{fmtNumber(player.board.ceiling)}</span>
        </div>
        {tier ? (
          <div className="board-card__stat">
            <span className="board-card__stat-label">Tier</span>
            <span className="board-card__stat-value">{tier}</span>
          </div>
        ) : null}
      </div>

      <div className="board-card__range">
        <div className="board-card__range-copy">
          <span>Floor to ceiling</span>
          <span>
            {fmtNumber(player.board.floor)} → {fmtNumber(player.board.ceiling)}
          </span>
        </div>
        <div className="board-card__range-track" aria-hidden="true">
          <span className="board-card__range-fill" style={{ width: `${marker}%` }} />
          <span className="board-card__range-marker" style={{ left: `${marker}%` }} />
        </div>
      </div>

      <WeeklyProjectionStrip
        currentWeek={currentWeek}
        fallbackWeekly={player.board.weekly}
        playoffWeekStart={playoffWeekStart}
        projection={player.projection}
        scoring={scoring}
      />

      {admin ? <AgreementEditor {...admin} /> : null}

      <div className="board-card__stat-strip" role="list" aria-label="Player stat summary">
        {stats.map((stat) => (
          <div className="board-card__pill" key={stat.key} role="listitem">
            <span className="board-card__pill-label">{stat.label}</span>
            <span className="board-card__pill-value">{statValue(projection?.season[stat.key])}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
