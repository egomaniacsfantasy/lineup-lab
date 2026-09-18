/**
 * What a lineup row's numbers mean once games are being played.
 *
 * Each player follows his OWN game, in three phases:
 *
 *  - UPCOMING. His game has not kicked off. The big number is the projection,
 *    exactly as the Hub has always shown it, and the meta line keeps the kickoff
 *    time.
 *
 *  - LIVE. His game is under way. The big number becomes points scored, the
 *    projected final moves underneath it labelled "proj", and a live tag carries
 *    the quarter and clock.
 *
 *  - FINAL. His game is over. The big number is his final score, "proj" shows
 *    what he was projected to score before kickoff so the row reads as a result
 *    against expectation, and a FINAL tag closes it.
 *
 * Why per player rather than one mode for the whole matchup: a Sunday lineup is
 * always a mix, 1pm players final while the 8:20 player has not started, and the
 * useful read of "the rest of my week" is the projection for the players who
 * have not played. Mixing scores and projections in one column is only safe
 * because every row that shows a score says so with its tag. The tag is what
 * makes this work; do not ship one without the other.
 *
 * Game state comes from the NFL scoreboard (/api/nfl/game-state). When that has
 * not loaded, the kickoff time and the points feed stand in: a passed kickoff or
 * any points mean the game has started, though not whether it is still going.
 */

import { NO_VALUE } from './formatOdds.ts';

export type GamePhase = 'upcoming' | 'live' | 'final' | 'started';

/** One NFL team's game, as /api/nfl/game-state reports it. */
export interface TeamGameState {
  state: 'pre' | 'in' | 'post';
  period: number | null;
  clock: string | null;
  detail: string | null;
}

export interface ScorelineInput {
  /** Kickoff of this player's NFL game, when the schedule is known. */
  kickoffIso: string | null;
  /** True when this player's team is on bye. */
  bye: boolean;
  /** Points scored so far. Null when 0 or absent. */
  currentPoints: number | null;
  /** This player's team's game from the scoreboard, when it has loaded. */
  game?: TeamGameState | null;
}

export interface Scoreline {
  phase: GamePhase;
  /** Whether this player's game has kicked off. */
  started: boolean;
  /** Points scored, or null when the player has not played yet. */
  scored: number | null;
}

export function hasKickedOff(kickoffIso: string | null, now: number): boolean {
  if (!kickoffIso) return false;
  const kickoff = Date.parse(kickoffIso);
  return Number.isFinite(kickoff) && kickoff <= now;
}

export function scorelineFor(input: ScorelineInput, now: number): Scoreline {
  const phase = phaseFor(input, now);
  const started = phase !== 'upcoming';
  /* The adapter folds a feed value of 0 into null to keep pregame rows clean.
     Once his game is under way that null is a real zero, and zero is a score
     worth printing. */
  return { phase, started, scored: started ? input.currentPoints ?? 0 : null };
}

function phaseFor(input: ScorelineInput, now: number): GamePhase {
  if (input.bye) return 'upcoming';
  const state = input.game?.state;
  if (state === 'post') return 'final';
  if (state === 'in') return 'live';
  /* Points count as proof of a game only when there ARE points. In live mode the
     server sends every player a live block, and a player whose game is days away
     carries current: 0 in it. Reading any non-null value as "his game started"
     turned a whole Thursday lineup into STARTED over 0.0, when only one of them
     was playing. Zero says nothing about whether a game has begun; the scoreboard
     and the kickoff time do. */
  const hasPoints = input.currentPoints != null && input.currentPoints > 0;
  /* The scoreboard says pre, but the feed already credits points: trust the
     points. A stale scoreboard read must not hide a score that is on the board. */
  if (state === 'pre') return hasPoints ? 'started' : 'upcoming';
  if (hasPoints || hasKickedOff(input.kickoffIso, now)) return 'started';
  return 'upcoming';
}

/**
 * The tag a started row carries. Built from period and clock rather than the
 * scoreboard's own text, which is "4:29 - 1st" and "2:00 - OT" and reads
 * backwards in a narrow cell.
 */
export function gameTagFor(phase: GamePhase, game?: TeamGameState | null): string | null {
  if (phase === 'final') return (game?.period ?? 0) >= 5 ? 'Final/OT' : 'Final';
  if (phase === 'started') return 'Started';
  if (phase !== 'live') return null;
  const detail = game?.detail ?? '';
  if (/halftime/i.test(detail)) return 'Half';
  const period = game?.period ?? null;
  if (/^end of/i.test(detail) && period) return period >= 5 ? 'End OT' : `End Q${period}`;
  const clock = game?.clock && game.clock !== '0:00' ? ` ${game.clock}` : '';
  if (period == null) return 'Live';
  return period >= 5 ? `OT${clock}` : `Q${period}${clock}`;
}

/** Scoreboard as soon as anyone in the matchup has started. Team totals only. */
export function anyStarted(lines: Scoreline[]): boolean {
  return lines.some((line) => line.started);
}

/**
 * A team's points scored, summed across its rows. Null until somebody in the
 * matchup has started, since before that there is no score to report.
 */
export function teamScored(lines: Scoreline[], matchupStarted: boolean): number | null {
  if (!matchupStarted) return null;
  const total = lines.reduce((sum, line) => sum + (line.scored ?? 0), 0);
  return Number(total.toFixed(1));
}

/** The big number a row shows: a score once started, the projection before. */
export function primaryNumber(line: Scoreline | null, projection: string): string {
  if (!line || !line.started) return projection;
  return line.scored == null ? NO_VALUE : line.scored.toFixed(1);
}
