import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { RankingMechanic } from '../components/rankings/RankingMechanic';
import { toPlayer } from '../adapters/connectedLeague';
import { useAuth } from '../contexts/AuthContext';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { usePlayerVotesEnabled } from '../hooks/useLabsFlags';
import { fetchBoard, type BoardRow } from '../services/leagueApi';
import { supabase } from '../services/supabase';
import type { Player } from '../types';
import { computeLegacyAdjustedValues } from './legacyAdjustedValue';
import './MyBoardPage.css';

type Row = Record<string, unknown>;
type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
type BoardPosition = 'ALL' | Position;
type BoardView = 'board' | 'sheet';
type SavingState = 'saving' | 'ok' | 'err' | 'pending';

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

interface PlayerVoteQueueEntry {
  at: string;
  keep: string;
  keepName: string;
  trade: string;
  tradeName: string;
  cut: string;
  cutName: string;
  trio: string[];
}

interface StatColumn {
  key: string;
  label: string;
}

interface PendingBoardRefresh {
  savedValue: string;
  previousRank: number;
  previousAdjustedValue: number;
}

type RowMotionState = 'moved' | 'recalculating';

const BOARD_POSITIONS: BoardPosition[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const VIEW_OPTIONS: Array<{ key: BoardView; label: string }> = [
  { key: 'board', label: 'Board' },
  { key: 'sheet', label: 'Sheet' },
];
const PLAYER_VOTES_QUEUE_KEY = 'og.playerVotes.queue';

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

function readPlayerVoteQueue(): PlayerVoteQueueEntry[] {
  try {
    const raw = window.localStorage.getItem(PLAYER_VOTES_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePlayerVoteQueue(queue: PlayerVoteQueueEntry[]) {
  try {
    window.localStorage.setItem(PLAYER_VOTES_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage failures
  }
}

function clampRating(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fmtNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '-';
  return digits > 0 ? value.toFixed(digits) : Math.round(value).toString();
}

function statValue(value: unknown, digits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return digits > 0 ? num.toFixed(digits) : Math.round(num).toString();
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

function parseMyCalls(raw: string | null) {
  return raw === 'mine';
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

function rowIdentity(row: BoardRow, projection: ProjectionPlayer | null) {
  return {
    name: projection?.name ?? row.name,
    position: (projection?.position ?? row.position) as Position,
    team: projection?.team ?? row.team,
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

function tierLabel(tier: number | null) {
  return tier == null ? null : `Tier ${tier}`;
}

function toneClass(value: string | null | undefined) {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (num > 50) return 'is-up';
  if (num < 50) return 'is-down';
  return 'is-even';
}

function isMyCallValue(value: string | null | undefined) {
  if (value == null || value === '') return false;
  const num = Number(value);
  return Number.isFinite(num) && num !== 50;
}

function myCallDirection(value: string | null | undefined) {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 50) return null;
  return num > 50 ? 'up' : 'down';
}

function myCallLabel(value: string | null | undefined) {
  const direction = myCallDirection(value);
  if (!direction) return null;
  return direction === 'up' ? 'YOU ▲' : 'YOU ▼';
}

function ratingSummary(value: number) {
  if (value > 50) return `Your rating: ${value} · lifts him vs Franco's number.`;
  if (value < 50) return `Your rating: ${value} · pushes him down vs Franco's number.`;
  return `Your rating: ${value} · aligned with Franco's number.`;
}

function saveConfirmation(value: number) {
  if (value > 50) return `Saved: ${value}. He climbs your board.`;
  if (value < 50) return `Saved: ${value}. He falls.`;
  return `Saved: ${value}. Aligned with Franco.`;
}

function columnCountForSheet(statsCount: number) {
  return 7 + statsCount;
}

export function MyBoardPage() {
  const { bootstrap } = useLeagueConnection();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [projectionData, setProjectionData] = useState<ProjectionDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const [ratingFocusPlayerId, setRatingFocusPlayerId] = useState<string | null>(null);
  const [sheetEditing, setSheetEditing] = useState(false);
  const [rapidEntryEnabled, setRapidEntryEnabled] = useState(true);
  const [agreeSaved, setAgreeSaved] = useState<Record<string, string>>({});
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, SavingState>>({});
  const [saveMessages, setSaveMessages] = useState<Record<string, string>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [pendingRefresh, setPendingRefresh] = useState<Record<string, PendingBoardRefresh>>({});
  const [rowMotion, setRowMotion] = useState<Record<string, RowMotionState>>({});
  const [reloadToken, setReloadToken] = useState(0);
  const [votesPromptSeed, setVotesPromptSeed] = useState(0);
  const [voteQueue, setVoteQueue] = useState<PlayerVoteQueueEntry[]>([]);
  const userId = session?.user?.id ?? null;
  const playerVotesEnabled = usePlayerVotesEnabled();
  const activeView = parseView(searchParams.get('view'));
  const activePosition = parsePosition(searchParams.get('pos'));
  const myCallsOnly = parseMyCalls(searchParams.get('calls'));
  const query = searchParams.get('q') ?? '';
  const [searchDraft, setSearchDraft] = useState(query);
  const votesLabActive = searchParams.get('labs') === 'player-votes' && playerVotesEnabled;
  const deferredQuery = useDeferredValue(searchDraft.trim().toLowerCase());
  const scoring = bootstrap?.league.scoringFamily;
  const numTeams = bootstrap?.league.totalTeams ?? 12;
  const sheetStatColumns =
    activePosition === 'ALL' ? [] : POSITION_STAT_COLUMNS[activePosition as Position];

  useEffect(() => {
    setVoteQueue(readPlayerVoteQueue());
  }, []);

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

  useEffect(() => {
    if (!userId || (!board && !projectionData)) {
      setAgreeSaved({});
      return;
    }
    let alive = true;
    const players = projectionData?.players ?? [];
    const boardRows = board ?? [];
    const idByKey = new Map<string, string>();
    for (const player of players) {
      idByKey.set(`${player.position}::${player.name}`, player.id);
    }
    for (const row of boardRows) {
      if (!idByKey.has(`${row.position}::${row.name}`)) {
        idByKey.set(`${row.position}::${row.name}`, row.playerId);
      }
    }
    supabase
      .from('olympus_agreement')
      .select('position, player, score')
      .eq('user_id', userId)
      .then(({ data, error: loadError }) => {
        if (!alive || loadError || !data) return;
        const next: Record<string, string> = {};
        for (const row of data) {
          const playerId = idByKey.get(`${row.position}::${row.player}`);
          if (playerId) next[playerId] = String(row.score);
        }
        setAgreeSaved(next);
        setRatingDrafts((current) => {
          const nextDrafts = { ...current };
          Object.entries(next).forEach(([playerId, value]) => {
            if (nextDrafts[playerId] === value) {
              delete nextDrafts[playerId];
            }
          });
          return nextDrafts;
        });
      });
    return () => {
      alive = false;
    };
  }, [board, projectionData, userId]);

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
      if (myCallsOnly && !isMyCallValue(agreeSaved[row.board.playerId] ?? '')) return false;
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
    const sorted = filtered
      .slice()
      .sort((a, b) => b.adjustedValue - a.adjustedValue || a.board.rank - b.board.rank);
    return activePosition === 'ALL' ? sorted.slice(0, 300) : sorted;
  }, [activePosition, agreeSaved, deferredQuery, mergedRows, myCallsOnly]);

  const myCallsCount = useMemo(
    () => mergedRows.filter((row) => isMyCallValue(agreeSaved[row.board.playerId] ?? '')).length,
    [agreeSaved, mergedRows],
  );

  const visibleRankByPlayerId = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.board.playerId, index + 1] as const)),
    [visibleRows],
  );

  const voteCandidates = useMemo(
    () =>
      visibleRows.filter(
        (row) => row.board.position !== 'K' && row.board.position !== 'DEF' && row.projection,
      ),
    [visibleRows],
  );

  useEffect(() => {
    if (openPlayerId && !visibleRows.some((row) => row.board.playerId === openPlayerId)) {
      setOpenPlayerId(null);
    }
    if (ratingFocusPlayerId && !visibleRows.some((row) => row.board.playerId === ratingFocusPlayerId)) {
      setRatingFocusPlayerId(null);
    }
  }, [openPlayerId, ratingFocusPlayerId, visibleRows]);

  useEffect(() => {
    const pendingEntries = Object.entries(pendingRefresh);
    if (pendingEntries.length === 0) return;
    let touched = false;
    const nextPending = { ...pendingRefresh };
    const nextSaving = { ...saving };
    const nextRowMotion = { ...rowMotion };

    pendingEntries.forEach(([playerId, pending]) => {
      if ((agreeSaved[playerId] ?? '') !== pending.savedValue) return;
      const row = mergedRows.find((candidate) => candidate.board.playerId === playerId);
      if (!row) return;
      const currentRank = visibleRankByPlayerId.get(playerId) ?? pending.previousRank;
      const moved =
        row.adjustedValue !== pending.previousAdjustedValue || currentRank !== pending.previousRank;

      if (moved) {
        delete nextPending[playerId];
        nextSaving[playerId] = 'ok';
        nextRowMotion[playerId] = 'moved';
        touched = true;
        window.setTimeout(() => {
          setRowMotion((current) => {
            if (current[playerId] !== 'moved') return current;
            const next = { ...current };
            delete next[playerId];
            return next;
          });
          setSaving((current) => {
            if (current[playerId] !== 'ok') return current;
            const next = { ...current };
            delete next[playerId];
            return next;
          });
        }, 1800);
        return;
      }

      if (nextSaving[playerId] !== 'pending' || nextRowMotion[playerId] !== 'recalculating') {
        nextSaving[playerId] = 'pending';
        nextRowMotion[playerId] = 'recalculating';
        touched = true;
      }
    });

    if (!touched) return;
    setPendingRefresh(nextPending);
    setSaving(nextSaving);
    setRowMotion(nextRowMotion);
  }, [agreeSaved, mergedRows, pendingRefresh, rowMotion, saving, visibleRankByPlayerId]);

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

  function readDraftRating(playerId: string) {
    return ratingDrafts[playerId] ?? null;
  }

  function toggleOpenPlayer(playerId: string) {
    setRatingFocusPlayerId(null);
    setOpenPlayerId((current) => (current === playerId ? null : playerId));
  }

  function openPlayerRating(playerId: string) {
    setOpenPlayerId(playerId);
    setRatingFocusPlayerId(playerId);
  }

  async function commitAgreementValue(
    player: MergedBoardPlayer,
    nextValue: string,
    currentRank: number,
  ) {
    const identity = rowIdentity(player.board, player.projection);
    const normalizedValue = String(clampRating(Number(nextValue)));
    const previous = readRating(player.board.playerId);
    if (previous === normalizedValue) {
      setRatingDrafts((current) => {
        if (!(player.board.playerId in current)) return current;
        const next = { ...current };
        delete next[player.board.playerId];
        return next;
      });
      return;
    }

    setRatingDrafts((current) => ({ ...current, [player.board.playerId]: normalizedValue }));
    setSaving((current) => ({ ...current, [player.board.playerId]: 'saving' }));
    setSaveMessages((current) => ({ ...current, [player.board.playerId]: '' }));
    setSaveErrors((current) => {
      if (!(player.board.playerId in current)) return current;
      const next = { ...current };
      delete next[player.board.playerId];
      return next;
    });

    const doWrite = async (uid: string) =>
      supabase.from('olympus_agreement').upsert(
        {
          user_id: uid,
          position: identity.position,
          player: identity.name,
          score: Number(normalizedValue),
        },
        { onConflict: 'user_id,position,player' },
      );

    try {
      if (!userId) {
        setSaving((current) => ({ ...current, [player.board.playerId]: 'err' }));
        setSaveErrors((current) => ({
          ...current,
          [player.board.playerId]: 'Log in to save ratings.',
        }));
        setRatingDrafts((current) => {
          const next = { ...current };
          delete next[player.board.playerId];
          return next;
        });
        return;
      }
      let { error: writeError } = await doWrite(userId);
      if (writeError) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        const freshUid = refreshed?.session?.user?.id ?? userId;
        if (refreshed?.session) {
          ({ error: writeError } = await doWrite(freshUid));
        }
      }
      if (writeError) {
        setSaving((current) => ({ ...current, [player.board.playerId]: 'err' }));
        setSaveErrors((current) => ({
          ...current,
          [player.board.playerId]: `Could not save: ${writeError.message ?? writeError}`,
        }));
        setRatingDrafts((current) => {
          const next = { ...current };
          delete next[player.board.playerId];
          return next;
        });
        return;
      }
      setAgreeSaved((current) => ({ ...current, [player.board.playerId]: normalizedValue }));
      setRatingDrafts((current) => {
        const next = { ...current };
        delete next[player.board.playerId];
        return next;
      });
      setSaveMessages((current) => ({
        ...current,
        [player.board.playerId]: saveConfirmation(Number(normalizedValue)),
      }));
      setPendingRefresh((current) => ({
        ...current,
        [player.board.playerId]: {
          savedValue: normalizedValue,
          previousRank: currentRank,
          previousAdjustedValue: player.adjustedValue,
        },
      }));
      void fetch('/api/projections/refresh-adjusted', { method: 'POST' }).catch(() => null);
      setReloadToken((current) => current + 1);
      window.setTimeout(() => {
        setSaveMessages((current) => {
          if (!current[player.board.playerId]) return current;
          const next = { ...current };
          delete next[player.board.playerId];
          return next;
        });
      }, 1400);
    } catch (err) {
      setSaving((current) => ({ ...current, [player.board.playerId]: 'err' }));
      setSaveErrors((current) => ({
        ...current,
        [player.board.playerId]: `Could not save: ${err instanceof Error ? err.message : String(err)}`,
      }));
      setRatingDrafts((current) => {
        const next = { ...current };
        delete next[player.board.playerId];
        return next;
      });
    }
  }

  function moveRatingFocus(currentId: string, dir: -1 | 1) {
    const cells = Array.from(
      document.querySelectorAll<HTMLInputElement>('.board-page__rating-input'),
    );
    const index = cells.findIndex((cell) => cell.dataset.playerId === currentId);
    const next = cells[index + dir];
    if (!next) return;
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  function handleRatingKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    player: MergedBoardPlayer,
    currentRank: number,
  ) {
    if (!rapidEntryEnabled) {
      if (event.key === 'Enter') {
        event.preventDefault();
        void commitAgreementValue(player, event.currentTarget.value || '50', currentRank);
        event.currentTarget.blur();
      }
      return;
    }

    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      const digit = Number(event.key);
      const value = digit === 0 ? 100 : digit * 10;
      void commitAgreementValue(player, String(value), currentRank);
      moveRatingFocus(player.board.playerId, 1);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
        event.preventDefault();
        moveRatingFocus(player.board.playerId, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveRatingFocus(player.board.playerId, -1);
        break;
      case 'Backspace':
      case 'Delete':
        event.preventDefault();
        void commitAgreementValue(player, '50', currentRank);
        break;
      case 'Escape':
        event.preventDefault();
        event.currentTarget.blur();
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
        }
    }
  }

  function queueVote(entry: PlayerVoteQueueEntry) {
    const next = [entry, ...voteQueue].slice(0, 24);
    setVoteQueue(next);
    writePlayerVoteQueue(next);
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
          <h2 className="board-page__title">Adjusted value</h2>
          <p className="board-page__caption">
            Franco&apos;s projections, adjusted by manager ratings · {scoringLabel(scoring)}
          </p>
          <p className="board-page__freshness">
            Updated {formatUpdatedDate(projectionData.updatedAt)} · {board.length} players
          </p>
        </div>
        <div className="board-page__view-toggle" role="tablist" aria-label="Board view">
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
          <button
            className={[
              'board-page__chip',
              myCallsOnly ? 'board-page__chip--active' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => updateSearchParam({ calls: myCallsOnly ? null : 'mine' })}
            type="button"
          >
            My calls ({myCallsCount})
          </button>
        </div>
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
      </section>

      {votesLabActive ? (
        <PlayerVotesPanel
          key={votesPromptSeed}
          onDismiss={() => updateSearchParam({ labs: null })}
          onQueueVote={queueVote}
          onRefreshPrompt={() => setVotesPromptSeed((current) => current + 1)}
          players={voteCandidates}
          queue={voteQueue}
          scoringLabel={scoringLabel(scoring)}
          seed={votesPromptSeed}
        />
      ) : null}

      {activeView === 'board' ? (
        <section className="board-page__stack" aria-label="Board view">
          {visibleRows.map((player, index) => {
            const isOpen = openPlayerId === player.board.playerId;
            const persistedRating = readRating(player.board.playerId);
            const influenceChip = myCallLabel(persistedRating);
            const motionState = rowMotion[player.board.playerId];
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
                    motionState === 'moved' ? 'board-page__row--moved' : '',
                    motionState === 'recalculating' ? 'board-page__row--recalculating' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {isOpen ? (
                    <BoardPlayerCard
                      currentWeek={bootstrap?.week ?? null}
                      draftRating={readDraftRating(player.board.playerId)}
                      focusRatingControl={ratingFocusPlayerId === player.board.playerId}
                      influenceChip={influenceChip}
                      mode="standalone"
                      onClose={() => setOpenPlayerId(null)}
                      onDraftChange={(value) =>
                        setRatingDrafts((current) => ({ ...current, [player.board.playerId]: String(value) }))
                      }
                      player={player}
                      rating={persistedRating}
                      rank={index + 1}
                      rowMotionState={motionState}
                      saveError={saveErrors[player.board.playerId] ?? ''}
                      saveMessage={saveMessages[player.board.playerId] ?? ''}
                      savingState={saving[player.board.playerId]}
                      onCommit={(value) => void commitAgreementValue(player, String(value), index + 1)}
                      onRatingFocusHandled={() => setRatingFocusPlayerId(null)}
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
                            {influenceChip ? <span className="board-page__influence-chip">{influenceChip}</span> : null}
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
                        {motionState === 'recalculating' ? (
                          <span className="board-page__motion-note">Recalculating…</span>
                        ) : null}
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
          <div className="board-page__sheet-toolbar">
            <div className="board-page__sheet-actions">
              <button
                className={[
                  'board-page__rapid-trigger',
                  sheetEditing ? 'board-page__rapid-trigger--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  if (!userId) {
                    window.alert('Log in to rate players.');
                    return;
                  }
                  setSheetEditing((current) => !current);
                }}
                title="Power-user keyboard grid for rating players quickly"
                type="button"
              >
                Rate players · rapid mode
              </button>
            </div>
          </div>

          {sheetEditing ? (
            <div className="board-page__rapid-note" role="note">
              <span className="board-page__rapid-lead">Power mode</span>
              <span>50 means aligned with Franco.</span>
              <span>Higher pushes him up. Lower pushes him down.</span>
              <span>{rapidEntryEnabled ? 'Rapid keys are live.' : 'Exact typing is live.'}</span>
              <div className="board-page__rapid-switch">
                <button
                  aria-pressed={rapidEntryEnabled}
                  className={rapidEntryEnabled ? 'board-page__rapid-mode board-page__rapid-mode--active' : 'board-page__rapid-mode'}
                  onClick={() => setRapidEntryEnabled(true)}
                  type="button"
                >
                  Rapid
                </button>
                <button
                  aria-pressed={!rapidEntryEnabled}
                  className={!rapidEntryEnabled ? 'board-page__rapid-mode board-page__rapid-mode--active' : 'board-page__rapid-mode'}
                  onClick={() => setRapidEntryEnabled(false)}
                  type="button"
                >
                  Type exact
                </button>
              </div>
            </div>
          ) : null}

          <div className="board-page__table-wrap">
            <table className="board-page__table">
              <thead>
                <tr>
                  <th className="board-page__th board-page__th--rank">#</th>
                  <th className="board-page__th board-page__th--sticky">Player</th>
                  <th className="board-page__th board-page__th--num">Adjusted value</th>
                  <th className="board-page__th board-page__th--num">Proj pts</th>
                  <th className="board-page__th board-page__th--num">Floor</th>
                  <th className="board-page__th board-page__th--num">Ceiling</th>
                  {sheetStatColumns.map((column) => (
                    <th className="board-page__th board-page__th--num" key={column.key}>
                      {column.label}
                    </th>
                  ))}
                  <th className="board-page__th board-page__th--num">Your rating</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((player, index) => {
                  const isOpen = openPlayerId === player.board.playerId;
                  const rating = readRating(player.board.playerId);
                  const draftRating = readDraftRating(player.board.playerId);
                  const influenceChip = myCallLabel(rating);
                  const motionState = rowMotion[player.board.playerId];
                  return (
                    <Fragment key={player.board.playerId}>
                      <tr
                        className={[
                          'board-page__table-row',
                          isOpen ? 'board-page__table-row--open' : '',
                          motionState === 'moved' ? 'board-page__table-row--moved' : '',
                          motionState === 'recalculating' ? 'board-page__table-row--recalculating' : '',
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
                                {influenceChip ? <span className="board-page__influence-chip">{influenceChip}</span> : null}
                              </span>
                              <span className="board-page__table-meta">
                                {player.board.position} · {player.board.team}
                              </span>
                              {motionState === 'recalculating' ? (
                                <span className="board-page__table-recalc">Recalculating…</span>
                              ) : null}
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
                        <td
                          className="board-page__td board-page__td--num"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {sheetEditing ? (
                            <input
                              className={[
                                'board-page__rating-input',
                                toneClass(draftRating ?? rating),
                                saving[player.board.playerId]
                                  ? `board-page__rating-input--${saving[player.board.playerId]}`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              data-player-id={player.board.playerId}
                              inputMode="numeric"
                              onChange={(event) =>
                                setRatingDrafts((current) => ({
                                  ...current,
                                  [player.board.playerId]: event.currentTarget.value,
                                }))
                              }
                              onBlur={(event) =>
                                void commitAgreementValue(player, event.currentTarget.value || '50', index + 1)
                              }
                              onKeyDown={(event) => handleRatingKeyDown(event, player, index + 1)}
                              placeholder="50"
                              value={draftRating ?? rating}
                            />
                          ) : (
                            <button
                              aria-label={`Rate ${player.board.name}`}
                              className={[
                                'board-page__rating-value',
                                'board-page__rating-button',
                                toneClass(rating),
                              ].filter(Boolean).join(' ')}
                              onClick={() => openPlayerRating(player.board.playerId)}
                              title="Rate him"
                              type="button"
                            >
                              {rating || '-'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="board-page__detail-row">
                          <td
                            className="board-page__detail-cell"
                            colSpan={columnCountForSheet(sheetStatColumns.length)}
                          >
                            <BoardPlayerCard
                              currentWeek={bootstrap?.week ?? null}
                              draftRating={draftRating}
                              focusRatingControl={ratingFocusPlayerId === player.board.playerId}
                              influenceChip={influenceChip}
                              mode="embedded"
                              onClose={() => setOpenPlayerId(null)}
                              onDraftChange={(value) =>
                                setRatingDrafts((current) => ({ ...current, [player.board.playerId]: String(value) }))
                              }
                              player={player}
                              rating={rating}
                              rank={index + 1}
                              rowMotionState={motionState}
                              saveError={saveErrors[player.board.playerId] ?? ''}
                              saveMessage={saveMessages[player.board.playerId] ?? ''}
                              savingState={saving[player.board.playerId]}
                              onCommit={(value) => void commitAgreementValue(player, String(value), index + 1)}
                              onRatingFocusHandled={() => setRatingFocusPlayerId(null)}
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

export function BoardPlayerCard({
  player,
  rating,
  draftRating = null,
  savingState,
  saveMessage,
  saveError,
  onCommit,
  onDraftChange,
  currentWeek,
  mode,
  rank,
  onClose,
  influenceChip,
  rowMotionState,
  focusRatingControl = false,
  onRatingFocusHandled,
}: {
  player: MergedBoardPlayer;
  rating: string;
  draftRating?: string | null;
  savingState: SavingState | undefined;
  saveMessage: string;
  saveError: string;
  onCommit: (value: number) => void;
  onDraftChange: (value: number) => void;
  currentWeek: number | null;
  mode: 'standalone' | 'embedded';
  rank: number;
  onClose: () => void;
  influenceChip?: string | null;
  rowMotionState?: RowMotionState | null;
  focusRatingControl?: boolean;
  onRatingFocusHandled?: () => void;
}) {
  const savedValue = rating === '' ? 50 : clampRating(Number(rating));
  const [draftValue, setDraftValue] = useState(draftRating != null ? clampRating(Number(draftRating)) : savedValue);
  const ratingRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLInputElement | null>(null);
  const projection = player.projection;
  const matchup = nextMatchup(projection, currentWeek);
  const stats = POSITION_STAT_COLUMNS[player.board.position as Position];

  useEffect(() => {
    if (draftRating != null) {
      setDraftValue(clampRating(Number(draftRating)));
      return;
    }
    if (savingState === 'saving') return;
    setDraftValue(savedValue);
  }, [draftRating, player.board.playerId, savedValue, savingState]);

  useEffect(() => {
    if (!focusRatingControl) return;
    ratingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    sliderRef.current?.focus({ preventScroll: true });
    onRatingFocusHandled?.();
  }, [focusRatingControl, onRatingFocusHandled]);

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
                {influenceChip ? <span className="board-page__influence-chip">{influenceChip}</span> : null}
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

      <div className="board-card__stat-strip" role="list" aria-label="Player stat summary">
        {stats.map((stat) => (
          <div className="board-card__pill" key={stat.key} role="listitem">
            <span className="board-card__pill-label">{stat.label}</span>
            <span className="board-card__pill-value">{statValue(projection?.season[stat.key])}</span>
          </div>
        ))}
      </div>

      <div className="board-card__rating" ref={ratingRef}>
        <div className="board-card__rating-head">
          <div>
            <p className="board-card__rating-label">Your rating</p>
            <p className="board-card__rating-copy">{ratingSummary(draftValue)}</p>
          </div>
          <span className="board-card__rating-chip">{draftValue}</span>
        </div>

        <div className="board-card__slider-wrap">
          <span className="board-card__slider-end">Much lower</span>
          <div className="board-card__slider-core">
            <span className="board-card__slider-notch" aria-hidden="true" />
            <input
              className="board-card__slider"
              ref={sliderRef}
              max={100}
              min={0}
              onChange={(event) => {
                const nextValue = clampRating(Number(event.target.value));
                setDraftValue(nextValue);
                onDraftChange(nextValue);
              }}
              onKeyUp={(event) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                  onCommit(clampRating(Number(event.currentTarget.value)));
                }
              }}
              onMouseUp={(event) => onCommit(clampRating(Number(event.currentTarget.value)))}
              onTouchEnd={(event) => onCommit(clampRating(Number(event.currentTarget.value)))}
              step={1}
              type="range"
              value={draftValue}
            />
            <span className="board-card__slider-center">Aligned with Franco</span>
          </div>
          <span className="board-card__slider-end board-card__slider-end--right">Much higher</span>
        </div>

        <div className="board-card__rating-actions">
          <button
            className="board-card__reset"
            onClick={() => {
              setDraftValue(50);
              onDraftChange(50);
              onCommit(50);
            }}
            type="button"
          >
            Reset to 50
          </button>
          {savingState === 'saving' ? <span className="board-card__save-note">Saving…</span> : null}
          {savingState === 'pending' || rowMotionState === 'recalculating' ? (
            <span className="board-card__save-note">Recalculating…</span>
          ) : null}
          {saveMessage ? <span className="board-card__save-note board-card__save-note--ok">{saveMessage}</span> : null}
          {saveError ? <span className="board-card__save-note board-card__save-note--error">{saveError}</span> : null}
        </div>
      </div>
    </div>
  );
}

function PlayerVotesPanel({
  players,
  queue,
  onQueueVote,
  onRefreshPrompt,
  onDismiss,
  scoringLabel: scoring,
  seed,
}: {
  players: MergedBoardPlayer[];
  queue: PlayerVoteQueueEntry[];
  onQueueVote: (entry: PlayerVoteQueueEntry) => void;
  onRefreshPrompt: () => void;
  onDismiss: () => void;
  scoringLabel: string;
  seed: number;
}) {
  const trio = useMemo(() => {
    if (players.length < 3) return [];
    const sorted = players.slice(0, 24);
    const offset = seed % sorted.length;
    return [
      sorted[offset],
      sorted[(offset + 7) % sorted.length],
      sorted[(offset + 15) % sorted.length],
    ]
      .filter(Boolean)
      .filter((player, index, list) => list.findIndex((item) => item.board.playerId === player.board.playerId) === index)
      .slice(0, 3);
  }, [players, seed]);
  const [choices, setChoices] = useState<Record<string, 'keep' | 'trade' | 'cut' | null>>({});

  useEffect(() => {
    setChoices({});
  }, [trio]);

  if (trio.length < 3) return null;

  const assignments = trio.reduce<Record<string, 'keep' | 'trade' | 'cut' | null>>((acc, player) => {
    acc[player.board.playerId] = choices[player.board.playerId] ?? null;
    return acc;
  }, {});
  const complete = ['keep', 'trade', 'cut'].every((slot) =>
    Object.values(assignments).includes(slot as 'keep' | 'trade' | 'cut'),
  );

  function choose(playerId: string, slot: 'keep' | 'trade' | 'cut') {
    setChoices((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (next[key] === slot) next[key] = null;
      });
      next[playerId] = slot;
      return next;
    });
  }

  function submit() {
    if (!complete) return;
    const keep = Object.entries(assignments).find(([, value]) => value === 'keep')?.[0];
    const trade = Object.entries(assignments).find(([, value]) => value === 'trade')?.[0];
    const cut = Object.entries(assignments).find(([, value]) => value === 'cut')?.[0];
    if (!keep || !trade || !cut) return;
    onQueueVote({
      at: new Date().toISOString(),
      keep,
      keepName: trio.find((player) => player.board.playerId === keep)?.board.name ?? keep,
      trade,
      tradeName: trio.find((player) => player.board.playerId === trade)?.board.name ?? trade,
      cut,
      cutName: trio.find((player) => player.board.playerId === cut)?.board.name ?? cut,
      trio: trio.map((player) => player.board.playerId),
    });
    onRefreshPrompt();
  }

  return (
    <section className="vote-panel" aria-label="Player votes lab">
      <div className="vote-panel__head">
        <div>
          <p className="vote-panel__eyebrow">Labs</p>
          <h3 className="vote-panel__title">Your read?</h3>
          <p className="vote-panel__copy">
            Rank these three: Keep the most valuable, Trade the middle, Cut the least.
          </p>
          <p className="vote-panel__meta">
            {scoring} · your score applies across formats
          </p>
        </div>
        <button className="vote-panel__dismiss" onClick={onDismiss} type="button">
          Dismiss
        </button>
      </div>

      <div className="vote-panel__grid">
        {trio.map((player) => (
          <article className="vote-panel__card" key={player.board.playerId}>
            <PlayerHeadshot
              className="vote-panel__shot"
              fallbackClassName="vote-panel__shot-fallback"
              imageClassName="vote-panel__shot-image"
              player={boardPlayer(player.board)}
            />
            <p className="vote-panel__player">{player.board.name}</p>
            <p className="vote-panel__team">
              {player.board.position} · {player.board.team} · {fmtNumber(player.board.seasonTotal)} proj pts
            </p>
            <div className="vote-panel__actions">
              {(['keep', 'trade', 'cut'] as const).map((slot) => (
                <button
                  className={[
                    'vote-panel__action',
                    choices[player.board.playerId] === slot ? 'vote-panel__action--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={slot}
                  onClick={() => choose(player.board.playerId, slot)}
                  type="button"
                >
                  {slot.toUpperCase()}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="vote-panel__footer">
        <button className="vote-panel__skip" onClick={onRefreshPrompt} type="button">
          I don&apos;t know all of these players
        </button>
        <button
          className="vote-panel__submit"
          disabled={!complete}
          onClick={submit}
          type="button"
        >
          Submit
        </button>
      </div>

      <div className="vote-panel__queue">
        <p className="vote-panel__queue-title">Local queue · {queue.length}</p>
        {queue.slice(0, 3).map((entry) => (
          <p className="vote-panel__queue-row" key={`${entry.at}:${entry.keep}`}>
            Keep {entry.keepName} · Trade {entry.tradeName} · Cut {entry.cutName}
          </p>
        ))}
      </div>
    </section>
  );
}
