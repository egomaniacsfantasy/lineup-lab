import { useEffect, useMemo, useState } from 'react';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { RankingMechanic } from '../components/rankings/RankingMechanic';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { fetchBoard, type BoardRow } from '../services/leagueApi';
import { toPlayer } from '../adapters/connectedLeague';
import type { Player } from '../types';
import './MyBoardPage.css';

const BOARD_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const VOR_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

/** Roster slot tokens -> how many of each dedicated/flex slot the league starts. */
function slotCounts(slots: string[] | undefined) {
  const c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0, FLEX: 0, SF: 0, REC: 0 };
  for (const raw of slots ?? []) {
    const s = String(raw).toUpperCase();
    if (s === 'QB') c.QB += 1;
    else if (s === 'RB') c.RB += 1;
    else if (s === 'WR') c.WR += 1;
    else if (s === 'TE') c.TE += 1;
    else if (s === 'K' || s === 'PK') c.K += 1;
    else if (s === 'DEF' || s === 'DST' || s === 'D/ST') c.DEF += 1;
    else if (s === 'FLEX' || s === 'W/R/T' || s === 'WRT') c.FLEX += 1;
    else if (s === 'SUPER_FLEX' || s === 'SUPERFLEX' || s === 'Q/W/R/T') c.SF += 1;
    else if (s === 'WRRB_FLEX' || s === 'REC_FLEX' || s === 'W/R' || s === 'W/T') c.REC += 1;
  }
  return c;
}

/**
 * Value over replacement in SEASON points, league-aware with flex handled by a
 * shared pool. Dedicated slots fill first (teams × slots per position); the flex
 * slots are then filled from the best remaining RB/WR/TE (plus QB for superflex)
 * BY POINTS, so the data decides how flex splits across positions. A position's
 * replacement level is the last player at that position who still starts
 * (dedicated OR flex) — the point value a waiver-level starter would match. VOR
 * = a player's season points − that replacement. QB/K/DEF use their own line.
 * Returns the replacement season total per position.
 */
function computeReplacement(
  board: BoardRow[],
  numTeams: number,
  slots: string[] | undefined,
): Record<string, number> {
  const T = Math.max(1, numTeams || 12);
  const c = slotCounts(slots);

  const byPos: Record<string, BoardRow[]> = {};
  for (const pos of VOR_POS) {
    byPos[pos] = board
      .filter((r) => r.position === pos && (r.seasonTotal ?? 0) > 0)
      .sort((a, b) => (b.seasonTotal ?? 0) - (a.seasonTotal ?? 0));
  }

  const dedicated: Record<string, number> = {
    QB: Math.round(T * c.QB),
    RB: Math.round(T * c.RB),
    WR: Math.round(T * c.WR),
    TE: Math.round(T * c.TE),
    K: Math.round(T * c.K),
    DEF: Math.round(T * c.DEF),
  };

  // Flex pool: players past each flex-eligible position's dedicated cutoff.
  const flexPos = new Set<string>();
  if (c.FLEX) ['RB', 'WR', 'TE'].forEach((p) => flexPos.add(p));
  if (c.REC) ['WR', 'TE'].forEach((p) => flexPos.add(p));
  if (c.SF) ['QB', 'RB', 'WR', 'TE'].forEach((p) => flexPos.add(p));
  const flexSeats = Math.round(T * (c.FLEX + c.REC + c.SF));

  const leftovers: BoardRow[] = [];
  for (const pos of flexPos) {
    const list = byPos[pos] ?? [];
    for (let i = dedicated[pos] ?? 0; i < list.length; i += 1) leftovers.push(list[i]);
  }
  leftovers.sort((a, b) => (b.seasonTotal ?? 0) - (a.seasonTotal ?? 0));

  const flexTaken: Record<string, number> = {};
  for (let i = 0; i < Math.min(flexSeats, leftovers.length); i += 1) {
    const p = leftovers[i].position;
    flexTaken[p] = (flexTaken[p] ?? 0) + 1;
  }

  const repl: Record<string, number> = {};
  for (const pos of VOR_POS) {
    const list = byPos[pos] ?? [];
    const started = (dedicated[pos] ?? 0) + (flexTaken[pos] ?? 0);
    if (!list.length || started <= 0) {
      repl[pos] = 0;
      continue;
    }
    const idx = Math.min(list.length - 1, started - 1); // last starter = replacement (VOR 0)
    repl[pos] = list[idx]?.seasonTotal ?? 0;
  }

  // K/DEF get a DIFFERENT (global) baseline. They're streamed, single-slot,
  // tiny-spread positions, so their own positional replacement (the 4th DEF)
  // wildly overstates their edge and floats them up the board. Instead, baseline
  // them against a mid-lineup startable level — the total of the ~(teams ×
  // KDEF_BASELINE_DEPTH)-th player overall — so a kicker is worth only what it
  // adds over a replaceable roster spot. This lands them near where they're
  // actually drafted; raise KDEF_BASELINE_DEPTH to sink them further.
  const allTotals = board
    .map((r) => r.seasonTotal ?? 0)
    .filter((t) => t > 0)
    .sort((a, b) => b - a);
  const kdefRank = Math.max(1, Math.round(T * KDEF_BASELINE_DEPTH));
  const kdefBase = allTotals[Math.min(kdefRank, allTotals.length - 1)] ?? 0;
  repl.K = kdefBase;
  repl.DEF = kdefBase;

  return repl;
}

// Adjusted value = VOR + α[pos] × projected season points, with a PER-POSITION
// α. VOR alone subtracts out absolute scoring (a +13 kicker looks like a +13
// back); adding points back lifts high-scoring positions. A single α couldn't
// both temper QBs (which ride raw points) and keep the RB/WR premium, so α is
// per-position: QB gets a small α (its high raw total shouldn't float it over
// scarcer RB/WR), RB/WR/TE moderate. K/DEF are handled by their global baseline
// in computeReplacement (their VOR goes negative), so their α barely matters.
const POS_ALPHA: Record<string, number> = {
  QB: 0.22,
  RB: 0.34,
  WR: 0.34,
  TE: 0.30,
  K: 0.34,
  DEF: 0.34,
};

// K/DEF baseline = the (teams × this)-th best total overall. LOWER sinks them
// further (shallower rank = higher baseline = more negative K/DEF VOR). 3 lands
// the top DEF/K near consensus draft position (~#140-150).
const KDEF_BASELINE_DEPTH = 3;

function baselineDate(version: string | null) {
  if (!version) return '—';
  return version.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? version;
}

function scoringLabel(scoring: string | undefined) {
  if (scoring === 'half-ppr') return 'Half-PPR';
  if (scoring === 'standard') return 'Standard';
  return 'PPR';
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

export function MyBoardPage() {
  const { bootstrap } = useLeagueConnection();
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [position, setPosition] = useState<(typeof BOARD_POSITIONS)[number]>('ALL');

  const scoring = bootstrap?.league.scoringFamily;
  useEffect(() => {
    let cancelled = false;
    fetchBoard(800, scoring)
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
  }, [scoring]);

  const numTeams = bootstrap?.league.totalTeams ?? 12;
  const repl = useMemo(
    () => (board ? computeReplacement(board, numTeams, bootstrap?.league.rosterPositions) : {}),
    [board, numTeams, bootstrap?.league.rosterPositions],
  );
  const vorOf = (row: BoardRow) => (row.seasonTotal ?? 0) - (repl[row.position] ?? 0);
  // Adjusted value = VOR + per-position α × projected points.
  const adjOf = (row: BoardRow) => vorOf(row) + (POS_ALPHA[row.position] ?? 0.34) * (row.seasonTotal ?? 0);

  const ordered = useMemo(() => {
    if (!board) return [];
    const pool = position === 'ALL' ? board : board.filter((r) => r.position === position);
    const sorted = pool.slice().sort((a, b) => adjOf(b) - adjOf(a));
    return position === 'ALL' ? sorted.slice(0, 300) : sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, position, repl]);

  const statusSegments = [
    `Agreement-weighted · ${scoringLabel(scoring)}`,
    `${numTeams}-team replacement`,
    `Baseline: ${baselineDate(version)}`,
  ];

  return (
    <div className="myboard">
      <h1 className="visually-hidden">Board</h1>
      {!bootstrap ? (
        <SeasonalNotice>
          Your league is still syncing, so this board is using league-neutral starter assumptions for now.
        </SeasonalNotice>
      ) : null}
      <header className="myboard__head">
        <div>
          <p className="myboard__kicker">Board</p>
          <div className="myboard__title-line">
            <h2 className="myboard__title">Adjusted value</h2>
          </div>
        </div>
      </header>

      <p className="myboard__status-row">{statusSegments.join(' · ')}</p>

      {!board ? (
        bootstrap ? <p className="myboard__empty">Loading your board…</p> : <RankingMechanic />
      ) : (
        <>
          <div className="myboard__positions">
            {BOARD_POSITIONS.map((pos) => (
              <button
                className={position === pos ? 'myboard__pos myboard__pos--on' : 'myboard__pos'}
                key={pos}
                onClick={() => setPosition(pos)}
                type="button"
              >
                {pos === 'ALL' ? 'Overall' : pos}
              </button>
            ))}
          </div>

          <div className="myboard__legend">
            <span>{position === 'ALL' ? 'Overall · by adjusted value' : 'By adjusted value'}</span>
            <span className="myboard__legend-god" tabIndex={0} role="button" aria-label="What is adjusted value?">
              Adjusted value
              <i className="myboard__info" aria-hidden="true">i</i>
              <span className="myboard__tip" role="tooltip">
                Adjusted value = value over replacement + a per-position share of projected points. VOR is a
                player&apos;s points above the last startable player at his position (flex filled from the best
                remaining RB/WR/TE), keeping the RB/WR scarcity premium; the points share is small for QB (so its
                high raw total doesn&apos;t float it over scarcer backs/receivers). K/DEF are measured against a
                mid-lineup baseline, so they sit near where they&apos;re actually drafted. Agreement-weighted for
                {' '}{scoringLabel(scoring)}, your roster, {numTeams} teams.
              </span>
            </span>
          </div>

          <div className="myboard__list">
            {ordered.map((row, index) => {
              const adj = adjOf(row);
              const vor = vorOf(row);
              const total = row.seasonTotal ?? 0;
              return (
                <div className="myboard__item" key={row.playerId}>
                  <div className="myboard__rowbtn myboard__rowbtn--static">
                    <span className="myboard__rank">{index + 1}</span>
                    <PlayerHeadshot
                      className="myboard__shot"
                      fallbackClassName="myboard__shot-fallback"
                      imageClassName="myboard__shot-image"
                      player={boardPlayer(row, bootstrap?.players)}
                    />
                    <span className="myboard__playercopy">
                      <span className="myboard__name">{row.name}</span>
                      <span className="myboard__meta">
                        {row.position} · {row.team}
                      </span>
                    </span>
                    <span className="myboard__nums">
                      <span className={adj >= 0 ? 'myboard__yours' : 'myboard__yours myboard__yours--neg'}>
                        {adj.toFixed(0)}
                      </span>
                      <span className="myboard__drift">
                        VOR {vor >= 0 ? '+' : ''}{vor.toFixed(0)} · {Math.round(total)} pts
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
