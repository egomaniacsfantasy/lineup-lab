import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { RankingMechanic } from '../components/rankings/RankingMechanic';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useModelOverlay } from '../contexts/ModelOverlayContext';
import { fetchBoard, type BoardRow } from '../services/leagueApi';
import { toPlayer } from '../adapters/connectedLeague';
import './MyBoardPage.css';

const BOARD_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const RAPID_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

/** Roughly where the replacement player sits per position in a redraft league;
 *  used only to order the Overall board by value over replacement. */
const REPLACEMENT_RANK: Record<string, number> = {
  QB: 12,
  RB: 24,
  WR: 30,
  TE: 12,
  K: 12,
  DEF: 12,
};

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
        <span className="setsw__name">{activeSetName}</span>
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
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [mode, setMode] = useState<'rapid' | 'board'>('rapid');
  const [position, setPosition] = useState<(typeof BOARD_POSITIONS)[number]>('RB');
  const [expanded, setExpanded] = useState<string | null>(null);

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
        <div className="myboard__head-right">
          <span className="myboard__count">
            {overrideCount === 0 ? 'All Franco' : `${overrideCount} moved`}
          </span>
          {overrideCount > 0 ? (
            <button className="myboard__reset" onClick={() => reset()} type="button">
              Reset to Franco
            </button>
          ) : null}
        </div>
      </header>

      <p className="myboard__sub">
        Your numbers set your line. Franco sits underneath as the anchor; your
        matchup and season odds price off your board.
      </p>

      <div className="myboard__modes" role="tablist">
        <button
          aria-selected={mode === 'rapid'}
          className={mode === 'rapid' ? 'myboard__mode myboard__mode--on' : 'myboard__mode'}
          onClick={() => setMode('rapid')}
          role="tab"
          type="button"
        >
          Rapid fire
        </button>
        <button
          aria-selected={mode === 'board'}
          className={mode === 'board' ? 'myboard__mode myboard__mode--on' : 'myboard__mode'}
          onClick={() => setMode('board')}
          role="tab"
          type="button"
        >
          Board
        </button>
      </div>

      {!board ? (
        <p className="myboard__empty">Loading your board…</p>
      ) : mode === 'rapid' ? (
        <RapidFire
          board={board}
          bootstrap={bootstrap}
          effective={effective}
          onPick={(winner, loser, conviction) => {
            const wEff = effective(winner);
            const lEff = effective(loser);
            const margin = MARGIN[conviction];
            if (wEff < lEff + margin) setPlayerBase(winner.playerId, lEff + margin);
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

function buildPairs(board: BoardRow[]): Array<[BoardRow, BoardRow]> {
  const pairs: Array<[BoardRow, BoardRow]> = [];
  for (const pos of RAPID_POSITIONS) {
    const list = board.filter((r) => r.position === pos).sort((a, b) => b.mean - a.mean);
    for (let i = 0; i < list.length - 1; i += 1) {
      if (list[i].mean - list[i + 1].mean <= 3) pairs.push([list[i], list[i + 1]]);
    }
  }
  // Interleave by walking positions round-robin for variety, capped.
  return pairs.slice(0, 60);
}

function RapidFire({
  board,
  bootstrap,
  effective,
  onPick,
}: {
  board: BoardRow[];
  bootstrap: NonNullable<ReturnType<typeof useLeagueConnection>['bootstrap']>;
  effective: (row: BoardRow) => number;
  onPick: (winner: BoardRow, loser: BoardRow, conviction: Conviction) => void;
}) {
  const pairs = useMemo(() => buildPairs(board), [board]);
  const [index, setIndex] = useState(0);
  const [conviction, setConviction] = useState<Conviction>('clear');
  const [last, setLast] = useState<{ winner: string; loser: string } | null>(null);

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
  const pick = (winner: BoardRow, loser: BoardRow) => {
    onPick(winner, loser, conviction);
    setLast({ winner: winner.name, loser: loser.name });
    setIndex((i) => i + 1);
  };

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
            className="rapid__card"
            key={row.playerId}
            onClick={() => pick(row, i === 0 ? b : a)}
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
            <span className="rapid__franco">Franco {row.mean.toFixed(1)}</span>
            {effective(row) !== row.mean ? (
              <span className="rapid__yours">You {effective(row).toFixed(1)}</span>
            ) : null}
          </button>
        ))}
      </div>

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
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  setPlayerBase: (id: string, base: number | null) => void;
  clearPlayer: (id: string) => void;
}) {
  // Replacement level per position (from Franco's means) for Overall ordering.
  const replacement = useMemo(() => {
    const out: Record<string, number> = {};
    for (const pos of Object.keys(REPLACEMENT_RANK)) {
      const sorted = board.filter((r) => r.position === pos).sort((a, b) => b.mean - a.mean);
      out[pos] = sorted[REPLACEMENT_RANK[pos]]?.mean ?? 0;
    }
    return out;
  }, [board]);

  // Order: by the user's number within a position, or by value-over-replacement
  // for Overall. Recomputes when the model changes...
  const ordered = useMemo(() => {
    if (position === 'ALL') {
      return board
        .filter((r) => REPLACEMENT_RANK[r.position] != null)
        .slice()
        .sort((a, b) => effective(b) - replacement[b.position] - (effective(a) - replacement[a.position]))
        .slice(0, 120);
    }
    return board.filter((r) => r.position === position).slice().sort((a, b) => effective(b) - effective(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, position, overlay, replacement]);

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
        <span>{position === 'ALL' ? 'Ranked by value over replacement' : 'Your order'}</span>
        <span>Proj pts / game</span>
      </div>

      <div className="myboard__list">
        {rows.map((row, index) => {
          const value = effective(row);
          const drift = value - row.mean;
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
                  <span className="myboard__yours">{value.toFixed(1)}</span>
                  {Math.abs(drift) >= 0.05 ? (
                    <span
                      className={
                        drift > 0
                          ? 'myboard__drift myboard__drift--up'
                          : 'myboard__drift myboard__drift--down'
                      }
                    >
                      {drift > 0 ? '+' : ''}
                      {drift.toFixed(1)} vs Franco
                    </span>
                  ) : (
                    <span className="myboard__drift">Franco {row.mean.toFixed(1)}</span>
                  )}
                </span>
              </button>
              {isOpen ? (
                <Dial
                  row={row}
                  value={value}
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
  onSet,
  onReset,
}: {
  row: BoardRow;
  value: number;
  onSet: (v: number) => void;
  onReset: () => void;
}) {
  const { floor, ceiling, min, max } = scaleFor(row);
  const offBook = value > ceiling + 0.01 || value < floor - 0.01;
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;

  return (
    <div className="dial">
      <input
        className="dial__slider"
        max={max}
        min={min}
        onChange={(e) => onSet(parseFloat(e.target.value))}
        step={0.1}
        type="range"
        value={value}
        aria-label={`Set your projection for ${row.name}`}
      />
      <div className="dial__scale">
        <span style={{ left: pct(floor) }}>
          floor<br />
          {floor.toFixed(0)}
        </span>
        <span className="dial__scale-franco" style={{ left: pct(row.mean) }}>
          Franco<br />
          {row.mean.toFixed(1)}
        </span>
        <span style={{ left: pct(ceiling) }}>
          ceiling<br />
          {ceiling.toFixed(0)}
        </span>
      </div>
      <div className="dial__foot">
        {offBook ? (
          <span className="dial__offbook">
            Off-book. Franco has him {row.mean.toFixed(1)}.
          </span>
        ) : (
          <span className="dial__here">You: {value.toFixed(1)}</span>
        )}
        <button className="dial__reset" onClick={onReset} type="button">
          Reset to Franco
        </button>
      </div>
    </div>
  );
}
