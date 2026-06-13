import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { RankingMechanic } from '../components/rankings/RankingMechanic';
import { useAuth } from '../contexts/AuthContext';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useModelOverlay } from '../contexts/ModelOverlayContext';
import { fetchBoard, type BoardRow } from '../services/leagueApi';
import { supabase } from '../services/supabase';
import { toPlayer } from '../adapters/connectedLeague';
import './MyBoardPage.css';

const BOARD_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const RAPID_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

const SKILL = ['QB', 'RB', 'WR', 'TE'];
/** Nudge the order toward consensus/ESPN. Raw VOR overrates RB scarcity and
 *  underrates elite (PPR) WRs and QBs, so temper RB and lift WR/QB/TE. */
const POS_MULT: Record<string, number> = { QB: 1.4, RB: 0.85, WR: 1.25, TE: 1.1 };

type Starters = Record<'QB' | 'RB' | 'WR' | 'TE', number>;

/** How many of each position a league effectively starts (FLEX/superflex split
 *  out), from the roster slots — this is what makes the board league-aware. */
function computeStarters(slots: string[] | undefined): Starters {
  if (!slots?.length) return { QB: 1, RB: 3, WR: 3, TE: 1.3 };
  const c = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SF: 0, REC: 0 };
  for (const s of slots) {
    if (s === 'QB') c.QB += 1;
    else if (s === 'RB') c.RB += 1;
    else if (s === 'WR') c.WR += 1;
    else if (s === 'TE') c.TE += 1;
    else if (s === 'FLEX') c.FLEX += 1;
    else if (s === 'SUPER_FLEX') c.SF += 1;
    else if (s === 'WRRB_FLEX' || s === 'REC_FLEX') c.REC += 1;
  }
  return {
    QB: c.QB + c.SF * 0.7 || 1,
    RB: c.RB + c.FLEX * 0.5 + c.SF * 0.1 + c.REC * 0.4,
    WR: c.WR + c.FLEX * 0.4 + c.SF * 0.1 + c.REC * 0.4,
    TE: c.TE + c.FLEX * 0.1 + c.SF * 0.1 + c.REC * 0.2,
  };
}

/**
 * The "GOD" rating: one 1–100 number per player combining Franco's projection
 * with value over replacement, on SEASON TOTALS (not per-game, so a no-snaps
 * backup like a QB3 doesn't read as elite). The scale is league-aware
 * (replacement = starters × a 12-team reference, so superflex lifts QBs) and
 * uses a compressed-top curve so the elite tier clusters near 100. DEF and K —
 * streamable, draft-them-last — are anchored just outside the top 120 the way a
 * real big board treats them, never buried hundreds of spots down.
 */
function buildGodScale(board: BoardRow[], starters: Starters) {
  const replTotal: Record<string, number> = {};
  for (const pos of SKILL) {
    const rank = Math.max(1, Math.round(starters[pos as keyof Starters] * 12));
    const sorted = board.filter((r) => r.position === pos).sort((a, b) => (b.seasonTotal ?? 0) - (a.seasonTotal ?? 0));
    replTotal[pos] = sorted[rank]?.seasonTotal ?? 0;
  }
  const vorAdj = (pos: string, total: number) => (total - (replTotal[pos] ?? 0)) * (POS_MULT[pos] ?? 1);

  const skillVors = board
    .filter((r) => SKILL.includes(r.position))
    .map((r) => vorAdj(r.position, r.seasonTotal ?? 0))
    .sort((a, b) => b - a);
  const maxV = skillVors[0] ?? 1;
  const floorV = skillVors[Math.min(skillVors.length - 1, 320)] ?? 0;
  const skillGod = (pos: string, total: number) => {
    const x = Math.max(0, Math.min(1, (vorAdj(pos, total) - floorV) / (maxV - floorV || 1)));
    return Math.max(1, Math.min(100, 1 + 99 * Math.pow(x, 0.82)));
  };

  // Anchor DEF/K to a target overall rank (~129 / ~154) so they sit just
  // outside the top 120, then spread within position from there.
  const skillGodSorted = board
    .filter((r) => SKILL.includes(r.position))
    .map((r) => skillGod(r.position, r.seasonTotal ?? 0))
    .sort((a, b) => b - a);
  const capAt = (idx: number) => skillGodSorted[Math.min(idx, skillGodSorted.length - 1)] ?? 20;
  const band = (pos: string, cap: number) => {
    const totals = board.filter((r) => r.position === pos).map((r) => r.seasonTotal ?? 0);
    return { cap, tmin: Math.min(...totals, 0), tmax: Math.max(...totals, 1) };
  };
  const defB = band('DEF', capAt(127));
  const kB = band('K', capAt(151));

  const score = (position: string, total: number) => {
    if (SKILL.includes(position)) return skillGod(position, total);
    const b = position === 'DEF' ? defB : kB;
    const g = b.cap * 0.6 + (b.cap - b.cap * 0.6) * ((total - b.tmin) / (b.tmax - b.tmin || 1));
    return Math.max(1, Math.min(b.cap, g));
  };
  // Inverse: the season total that produces a given GOD — lets the dial be
  // GOD-native (drag the rating, back out the implied projection).
  const totalForGod = (position: string, god: number) => {
    const gg = Math.max(1, Math.min(100, god));
    if (SKILL.includes(position)) {
      const x = Math.pow((gg - 1) / 99, 1 / 0.82);
      const vor = floorV + x * (maxV - floorV);
      return (replTotal[position] ?? 0) + vor / (POS_MULT[position] ?? 1);
    }
    const b = position === 'DEF' ? defB : kB;
    const denom = b.cap - b.cap * 0.6 || 1;
    return b.tmin + ((Math.min(gg, b.cap) - b.cap * 0.6) / denom) * (b.tmax - b.tmin);
  };
  return { score, totalForGod };
}

type Conviction = 'lean' | 'clear' | 'huge';
const MARGIN: Record<Conviction, number> = { lean: 0.5, clear: 1.5, huge: 3.5 };
const CONVICTION_LABEL: Record<Conviction, string> = {
  lean: 'Slight lean',
  clear: 'Clearly',
  huge: 'By a lot',
};

/**
 * Per-game floor/ceiling for the dial scale. Franco's floor/ceiling fields are
 * season *totals* (wrong scale for a per-game number), so derive the per-game
 * band from the per-game stdev until he ships real per-week ranges.
 */
function scaleFor(row: BoardRow) {
  const stdev = row.stdev ?? Math.max(2, row.mean * 0.3);
  const floor = Math.max(0, row.mean - 1.5 * stdev);
  const ceiling = row.mean + 1.5 * stdev;
  const span = Math.max(1, ceiling - floor);
  return { floor, ceiling, min: Math.max(0, floor - 0.3 * span), max: ceiling + 0.3 * span };
}

/** Save / name / switch / delete named ranking sets, from the board title. */
function SetSwitcher({
  sets,
  activeSetId,
  activeSetName,
  createSet,
  renameSet,
  deleteSet,
  switchSet,
}: {
  sets: Array<{ id: string; name: string; count: number }>;
  activeSetId: string;
  activeSetName: string;
  createSet: (name?: string) => void;
  renameSet: (id: string, name: string) => void;
  deleteSet: (id: string) => void;
  switchSet: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(activeSetName);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftName(activeSetName);
  }, [activeSetName]);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setRenaming(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setRenaming(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commitRename = () => {
    renameSet(activeSetId, draftName);
    setRenaming(false);
  };

  return (
    <div className="setsw" ref={ref}>
      <button className="setsw__trigger" onClick={() => setOpen((v) => !v)} type="button">
        <span className="setsw__namewrap">
          <span className="setsw__name">{activeSetName}</span>
          <span className="setsw__hint">
            {sets.length} {sets.length === 1 ? 'board' : 'boards'} · auto-saved · tap to switch or
            add
          </span>
        </span>
        <svg className="setsw__chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open ? (
        <div className="setsw__pop" role="menu">
          <p className="setsw__poplabel">Your boards</p>
          {sets.map((s) => (
            <button
              className={s.id === activeSetId ? 'setsw__set setsw__set--on' : 'setsw__set'}
              key={s.id}
              onClick={() => {
                switchSet(s.id);
                setOpen(false);
              }}
              type="button"
            >
              <span className="setsw__set-name">{s.name}</span>
              <span className="setsw__set-count">{s.count === 0 ? 'Franco' : `${s.count} moved`}</span>
            </button>
          ))}

          <div className="setsw__actions">
            {renaming ? (
              <form
                className="setsw__renameform"
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename();
                }}
              >
                <input
                  autoFocus
                  className="setsw__input"
                  onBlur={commitRename}
                  onChange={(e) => setDraftName(e.target.value)}
                  value={draftName}
                />
              </form>
            ) : (
              <button className="setsw__action" onClick={() => setRenaming(true)} type="button">
                Rename
              </button>
            )}
            <button
              className="setsw__action"
              onClick={() => {
                createSet();
                setOpen(false);
              }}
              type="button"
            >
              + New board
            </button>
            {sets.length > 1 ? (
              <button
                className="setsw__action setsw__action--danger"
                onClick={() => {
                  deleteSet(activeSetId);
                  setOpen(false);
                }}
                type="button"
              >
                Delete this board
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MyBoardPage() {
  const { bootstrap } = useLeagueConnection();
  const {
    overlay,
    setPlayerBase,
    clearPlayer,
    overrideCount,
    reset,
    sets,
    activeSetId,
    activeSetName,
    createSet,
    renameSet,
    deleteSet,
    switchSet,
  } = useModelOverlay();
  const { user } = useAuth();
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [mode, setMode] = useState<'board' | 'rapid'>('board');
  const [position, setPosition] = useState<(typeof BOARD_POSITIONS)[number]>('RB');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Every who's-better pick is logged as a crowd signal. Individually it tunes
  // the user's own board; in aggregate these pairwise votes are a consensus
  // layer that can feed back into Franco's rankings. Best-effort, silent.
  const logPick = useCallback(
    (winner: BoardRow, loser: BoardRow, conviction: Conviction) => {
      if (!user) return;
      void supabase
        .from('olympus_pairwise')
        .insert({
          user_id: user.id,
          winner_id: winner.playerId,
          loser_id: loser.playerId,
          winner_pos: winner.position,
          conviction,
          scoring: bootstrap?.league.scoringFamily ?? null,
        })
        .then(() => undefined, () => undefined);
    },
    [user, bootstrap],
  );

  useEffect(() => {
    if (!bootstrap) return;
    let cancelled = false;
    fetchBoard(800)
      .then((payload) => {
        if (!cancelled && payload.available) {
          setBoard(payload.rankings);
          setVersion(payload.version);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  const effective = (row: BoardRow) => overlay[row.playerId]?.base ?? row.mean;

  // GOD rating: built from the whole board (season totals + VOR), league-aware
  // via the roster slots, recomputed live as overrides change implied totals.
  const starters = useMemo(
    () => computeStarters(bootstrap?.league.rosterPositions),
    [bootstrap],
  );
  const godScale = useMemo(
    () => (board ? buildGodScale(board, starters) : null),
    [board, starters],
  );
  const gamesOf = (row: BoardRow) => (row.seasonTotal && row.mean ? row.seasonTotal / row.mean : 17);
  const effTotalOf = (row: BoardRow) => {
    const ov = overlay[row.playerId]?.base;
    return ov == null ? row.seasonTotal ?? 0 : ov * gamesOf(row);
  };
  const godOf = (row: BoardRow) => (godScale ? godScale.score(row.position, effTotalOf(row)) : 0);
  const francoGodOf = (row: BoardRow) =>
    godScale ? godScale.score(row.position, row.seasonTotal ?? 0) : 0;

  // Rapid fire only pits the top ~150 overall (by Franco's GOD) against each
  // other — the calls that matter, no deep scrubs.
  const rapidPool = useMemo(() => {
    if (!board || !godScale) return new Set<string>();
    return new Set(
      [...board]
        .sort(
          (x, y) =>
            godScale.score(y.position, y.seasonTotal ?? 0) -
            godScale.score(x.position, x.seasonTotal ?? 0),
        )
        .slice(0, 150)
        .map((r) => r.playerId),
    );
  }, [board, godScale]);

  if (!bootstrap) {
    return (
      <div className="myboard">
        <h1 className="visually-hidden">Your board</h1>
        <RankingMechanic />
      </div>
    );
  }

  return (
    <div className="myboard">
      <header className="myboard__head">
        <div>
          <p className="myboard__kicker">
            Your model{version ? ` · on Franco ${version}` : ''}
          </p>
          <SetSwitcher
            sets={sets}
            activeSetId={activeSetId}
            activeSetName={activeSetName}
            createSet={createSet}
            renameSet={renameSet}
            deleteSet={deleteSet}
            switchSet={switchSet}
          />
        </div>
        {overrideCount > 0 ? (
          <div className="myboard__head-right">
            <span className="myboard__count">{overrideCount} moved</span>
            <button className="myboard__reset" onClick={() => reset()} type="button">
              Reset to Franco
            </button>
          </div>
        ) : null}
      </header>

      <p className="myboard__sub">
        This is your board to edit, not a printout. Tap any player to set your
        own number, or run Rapid fire to build it fast. Your matchup and season
        odds price off it, with Franco as the anchor.
      </p>

      <div className="myboard__modes" role="tablist">
        <button
          aria-selected={mode === 'board'}
          className={mode === 'board' ? 'myboard__mode myboard__mode--on' : 'myboard__mode'}
          onClick={() => setMode('board')}
          role="tab"
          type="button"
        >
          Board
        </button>
        <button
          aria-selected={mode === 'rapid'}
          className={mode === 'rapid' ? 'myboard__mode myboard__mode--on' : 'myboard__mode'}
          onClick={() => setMode('rapid')}
          role="tab"
          type="button"
        >
          Rapid fire
        </button>
      </div>

      {!board ? (
        <p className="myboard__empty">Loading your board…</p>
      ) : mode === 'rapid' ? (
        <RapidFire
          board={board}
          poolIds={rapidPool}
          bootstrap={bootstrap}
          onPick={(winner, loser, conviction) => {
            const wEff = effective(winner);
            const lEff = effective(loser);
            const margin = MARGIN[conviction];
            if (wEff < lEff + margin) setPlayerBase(winner.playerId, lEff + margin);
            logPick(winner, loser, conviction);
          }}
        />
      ) : (
        <BoardView
          board={board}
          overlay={overlay}
          bootstrap={bootstrap}
          position={position}
          setPosition={setPosition}
          effective={effective}
          godOf={godOf}
          francoGodOf={francoGodOf}
          effTotalOf={effTotalOf}
          godScale={godScale}
          expanded={expanded}
          setExpanded={setExpanded}
          setPlayerBase={setPlayerBase}
          clearPlayer={clearPlayer}
        />
      )}
    </div>
  );
}

/* ── Rapid fire: the fun bulk loop. Close pairs, who's better, advance. ── */

function buildPairs(board: BoardRow[], poolIds: Set<string>): Array<[BoardRow, BoardRow]> {
  const pairs: Array<[BoardRow, BoardRow]> = [];
  const seen = new Set<string>();
  for (const pos of RAPID_POSITIONS) {
    // Only the relevant guys (top ~150 overall) get compared — no deep scrubs.
    const list = board
      .filter((r) => r.position === pos && (r.seasonTotal ?? 0) > 0 && poolIds.has(r.playerId))
      .sort((a, b) => (b.seasonTotal ?? 0) - (a.seasonTotal ?? 0));
    for (let i = 0; i < list.length - 1; i += 1) {
      // Pair each player with a RANDOM nearby one (small window), not always the
      // very next — breaks the QB1-vs-QB2, QB2-vs-QB3 chain and adds variety.
      const window = Math.min(4, list.length - 1 - i);
      const j = i + 1 + Math.floor(Math.random() * window);
      const key = `${list[i].playerId}:${list[j].playerId}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push([list[i], list[j]]);
      }
    }
  }
  // Shuffle so positions interleave and you don't get four QB calls in a row.
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const k = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[k]] = [pairs[k], pairs[i]];
  }
  // Best-effort: avoid two consecutive pairs sharing a player.
  for (let i = 1; i < pairs.length; i += 1) {
    const prev = new Set([pairs[i - 1][0].playerId, pairs[i - 1][1].playerId]);
    if (prev.has(pairs[i][0].playerId) || prev.has(pairs[i][1].playerId)) {
      const swapWith = pairs.findIndex(
        (p, idx) => idx > i && !prev.has(p[0].playerId) && !prev.has(p[1].playerId),
      );
      if (swapWith > -1) [pairs[i], pairs[swapWith]] = [pairs[swapWith], pairs[i]];
    }
  }
  // ~60 calls is the sweet spot — enough to shape the board, before fatigue.
  return pairs.slice(0, 60);
}

function RapidFire({
  board,
  poolIds,
  bootstrap,
  onPick,
}: {
  board: BoardRow[];
  poolIds: Set<string>;
  bootstrap: NonNullable<ReturnType<typeof useLeagueConnection>['bootstrap']>;
  onPick: (winner: BoardRow, loser: BoardRow, conviction: Conviction) => void;
}) {
  const pairs = useMemo(() => buildPairs(board, poolIds), [board, poolIds]);
  const [index, setIndex] = useState(0);
  const [conviction, setConviction] = useState<Conviction>('clear');
  const [last, setLast] = useState<{ winner: string; loser: string } | null>(null);
  const [picked, setPicked] = useState<0 | 1 | null>(null);

  // A pick flashes the chosen card, then advances — identical feedback whether
  // you tap or use an arrow key.
  const choose = useCallback(
    (side: 0 | 1) => {
      if (picked !== null) return;
      const pair = pairs[index];
      if (!pair) return;
      setPicked(side);
      window.setTimeout(() => {
        const winner = side === 0 ? pair[0] : pair[1];
        const loser = side === 0 ? pair[1] : pair[0];
        onPick(winner, loser, conviction);
        setLast({ winner: winner.name, loser: loser.name });
        setPicked(null);
        setIndex((i) => i + 1);
      }, 200);
    },
    [picked, pairs, index, onPick, conviction],
  );

  // Left / right arrow keys pick the left / right player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        choose(0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        choose(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose]);

  if (pairs.length === 0) {
    return <p className="myboard__empty">No close calls to make right now.</p>;
  }
  if (index >= pairs.length) {
    return (
      <div className="rapid rapid--done">
        <p className="rapid__done-title">That is the close calls, done.</p>
        <p className="rapid__done-sub">
          Your board reflects every call. Flip to Board to fine-tune any number.
        </p>
        <button className="rapid__again" onClick={() => setIndex(0)} type="button">
          Run through again
        </button>
      </div>
    );
  }

  const [a, b] = pairs[index];

  return (
    <div className="rapid">
      <div className="rapid__progress">
        <span>{index + 1} of {pairs.length}</span>
        {last ? (
          <span className="rapid__last">
            You have <b>{last.winner}</b> over {last.loser}
          </span>
        ) : (
          <span className="rapid__hint">Who would you rather have?</span>
        )}
      </div>

      <div className="rapid__pair">
        {[a, b].map((row, i) => (
          <button
            className={[
              'rapid__card',
              picked === i ? 'rapid__card--picked' : '',
              picked !== null && picked !== i ? 'rapid__card--dim' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={row.playerId}
            onClick={() => choose(i as 0 | 1)}
            type="button"
          >
            <PlayerHeadshot
              className="rapid__shot"
              fallbackClassName="rapid__shot-fallback"
              imageClassName="rapid__shot-image"
              player={toPlayer(row.playerId, bootstrap.players)}
            />
            <span className="rapid__name">{row.name}</span>
            <span className="rapid__meta">
              {row.position} · {row.team}
            </span>
            <span className="rapid__franco">{Math.round(row.seasonTotal ?? 0)} proj pts</span>
          </button>
        ))}
      </div>

      <p className="rapid__keys" aria-hidden="true">Tap a card, or use ← / → keys</p>

      <div className="rapid__conviction">
        {(['lean', 'clear', 'huge'] as Conviction[]).map((c) => (
          <button
            className={conviction === c ? 'rapid__conv rapid__conv--on' : 'rapid__conv'}
            key={c}
            onClick={() => setConviction(c)}
            type="button"
          >
            {CONVICTION_LABEL[c]}
          </button>
        ))}
      </div>

      <button className="rapid__skip" onClick={() => setIndex((i) => i + 1)} type="button">
        Skip, no read
      </button>
    </div>
  );
}

/* ── Board view: your order by position, dial to fine-tune. ── */

function BoardView({
  board,
  overlay,
  bootstrap,
  position,
  setPosition,
  effective,
  godOf,
  francoGodOf,
  effTotalOf,
  godScale,
  expanded,
  setExpanded,
  setPlayerBase,
  clearPlayer,
}: {
  board: BoardRow[];
  overlay: Record<string, { base?: number }>;
  bootstrap: NonNullable<ReturnType<typeof useLeagueConnection>['bootstrap']>;
  position: (typeof BOARD_POSITIONS)[number];
  setPosition: (p: (typeof BOARD_POSITIONS)[number]) => void;
  effective: (row: BoardRow) => number;
  godOf: (row: BoardRow) => number;
  francoGodOf: (row: BoardRow) => number;
  effTotalOf: (row: BoardRow) => number;
  godScale: ReturnType<typeof buildGodScale> | null;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  setPlayerBase: (id: string, base: number | null) => void;
  clearPlayer: (id: string) => void;
}) {
  // Order by GOD rating: Overall is everyone (DEF/K sink on their own), a
  // position tab is just that position. Recomputes when the model changes.
  const ordered = useMemo(() => {
    const pool = position === 'ALL' ? board : board.filter((r) => r.position === position);
    const sorted = pool.slice().sort((a, b) => godOf(b) - godOf(a));
    return position === 'ALL' ? sorted.slice(0, 400) : sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, position, overlay]);

  // ...but freeze that order while a dial is open, so dragging the slider
  // doesn't re-sort the list and yank the row out from under your finger.
  const [frozen, setFrozen] = useState<BoardRow[]>(ordered);
  useEffect(() => {
    if (!expanded) setFrozen(ordered);
  }, [ordered, expanded]);
  const rows = expanded ? frozen : ordered;

  return (
    <>
      <div className="myboard__positions">
        {BOARD_POSITIONS.map((pos) => (
          <button
            className={position === pos ? 'myboard__pos myboard__pos--on' : 'myboard__pos'}
            key={pos}
            onClick={() => {
              setExpanded(null);
              setPosition(pos);
            }}
            type="button"
          >
            {pos === 'ALL' ? 'Overall' : pos}
          </button>
        ))}
      </div>

      <div className="myboard__legend">
        <span>{position === 'ALL' ? 'Overall · by GOD' : 'Your order · by GOD'}</span>
        <span className="myboard__legend-god" tabIndex={0} role="button" aria-label="What is the GOD score?">
          GOD score
          <i className="myboard__info" aria-hidden="true">i</i>
          <span className="myboard__tip" role="tooltip">
            GOD is one 1–100 rating per player: Franco&apos;s projection, value over
            replacement, and position scarcity combined. 100 is the best player on
            the board; ~50 is replacement level. Tap any player to set your own.
          </span>
        </span>
      </div>

      <div className="myboard__list">
        {rows.map((row, index) => {
          const value = effective(row);
          const god = godOf(row);
          const drift = god - francoGodOf(row);
          const total = effTotalOf(row);
          const isOpen = expanded === row.playerId;
          return (
            <div className="myboard__item" key={row.playerId}>
              <button
                className="myboard__rowbtn"
                onClick={() => setExpanded(isOpen ? null : row.playerId)}
                type="button"
              >
                <span className="myboard__rank">{index + 1}</span>
                <PlayerHeadshot
                  className="myboard__shot"
                  fallbackClassName="myboard__shot-fallback"
                  imageClassName="myboard__shot-image"
                  player={toPlayer(row.playerId, bootstrap.players)}
                />
                <span className="myboard__playercopy">
                  <span className="myboard__name">{row.name}</span>
                  <span className="myboard__meta">
                    {row.position} · {row.team}
                  </span>
                </span>
                <span className="myboard__nums">
                  <span className="myboard__yours">{god.toFixed(1)}</span>
                  {Math.abs(drift) >= 0.05 ? (
                    <span
                      className={
                        drift > 0
                          ? 'myboard__drift myboard__drift--up'
                          : 'myboard__drift myboard__drift--down'
                      }
                    >
                      {drift > 0 ? '+' : ''}
                      {drift.toFixed(1)} GOD vs Franco
                    </span>
                  ) : (
                    <span className="myboard__drift">{Math.round(total)} pts proj</span>
                  )}
                </span>
                <svg
                  className={isOpen ? 'myboard__caret myboard__caret--open' : 'myboard__caret'}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
              {isOpen && godScale ? (
                <Dial
                  row={row}
                  value={value}
                  god={god}
                  godScale={godScale}
                  onSet={(v) => setPlayerBase(row.playerId, v)}
                  onReset={() => clearPlayer(row.playerId)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Dial({
  row,
  value,
  god,
  godScale,
  onSet,
  onReset,
}: {
  row: BoardRow;
  value: number;
  god: number;
  godScale: ReturnType<typeof buildGodScale>;
  onSet: (v: number) => void;
  onReset: () => void;
}) {
  // The slider is GOD-native: you drag the rating, and the implied projection
  // (what the engine actually prices off) is backed out from it.
  const pts = scaleFor(row);
  const games = row.seasonTotal && row.mean ? row.seasonTotal / row.mean : 17;
  const godAt = (p: number) => godScale.score(row.position, p * games);
  const ptsAt = (g: number) => godScale.totalForGod(row.position, g) / games;
  const gMin = godAt(pts.min);
  const gMax = godAt(pts.max);
  const gFloor = godAt(pts.floor);
  const gCeil = godAt(pts.ceiling);
  const gFranco = godAt(row.mean);
  const span = gMax - gMin || 1;
  const pct = (g: number) => `${Math.max(0, Math.min(100, ((g - gMin) / span) * 100))}%`;
  const offBook = god > gCeil + 0.1 || god < gFloor - 0.1;

  return (
    <div className="dial">
      <input
        className="dial__slider"
        max={gMax}
        min={gMin}
        onChange={(e) => onSet(Math.round(ptsAt(parseFloat(e.target.value)) * 10) / 10)}
        step={0.1}
        type="range"
        value={god}
        aria-label={`Set the GOD rating for ${row.name}`}
      />
      <div className="dial__scale">
        <span style={{ left: pct(gFloor) }}>
          floor<br />
          {gFloor.toFixed(0)}
        </span>
        <span className="dial__scale-franco" style={{ left: pct(gFranco) }}>
          Franco<br />
          {gFranco.toFixed(1)}
        </span>
        <span style={{ left: pct(gCeil) }}>
          ceiling<br />
          {gCeil.toFixed(0)}
        </span>
      </div>
      <div className="dial__foot">
        <span className="dial__readout">
          <span className="dial__god">GOD {god.toFixed(1)}</span>
          {offBook ? (
            <span className="dial__offbook">Off-book · Franco {gFranco.toFixed(1)}</span>
          ) : (
            <span className="dial__pts">{value.toFixed(1)} proj pts/game</span>
          )}
        </span>
        <button className="dial__reset" onClick={onReset} type="button">
          Reset to Franco
        </button>
      </div>
    </div>
  );
}
