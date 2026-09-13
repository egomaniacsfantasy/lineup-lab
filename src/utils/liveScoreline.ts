/**
 * What a lineup row's numbers mean once games are being played.
 *
 * Before any kickoff a row carries one number, the projection, and there is
 * nothing to confuse it with. The moment a game starts there are two: points
 * scored and the projected final. They are both one-decimal fantasy points in
 * the same face, so the reader cannot tell them apart by looking, and a row
 * that shows "20.9" over "0.1 now" reads as twenty points scored. On a Sunday
 * that is the only question anybody opens the Hub to answer.
 *
 * So a matchup is in one of two modes, and every row in it follows the mode:
 *
 *  - PROJECTION, before anybody on either roster has kicked off. One number
 *    per row, the projection, exactly as the Hub has always shown it.
 *
 *  - SCOREBOARD, from the first kickoff on. The big number is points scored
 *    and the projection moves underneath it, labelled. A player whose game has
 *    not started yet shows a dash as the big number rather than 0.0, because
 *    0.0 is a score and he has not had the chance to make one.
 *
 * The mode is per matchup, not per row, so a column never mixes the two
 * meanings. That is the whole point: the big number in a column must always be
 * the same kind of number, or the column cannot be scanned.
 */

export type ScoreMode = 'projection' | 'scoreboard';

export interface ScorelineInput {
  /** Kickoff of this player's NFL game, when the schedule is known. */
  kickoffIso: string | null;
  /** True when this player's team is on bye. */
  bye: boolean;
  /** Points scored so far from the provider feed. Null when 0 or absent. */
  currentPoints: number | null;
}

export interface Scoreline {
  /** Points scored, or null when the player has not played yet. */
  scored: number | null;
  /** Whether this player's game has kicked off. */
  started: boolean;
}

export function hasKickedOff(kickoffIso: string | null, now: number): boolean {
  if (!kickoffIso) return false;
  const kickoff = Date.parse(kickoffIso);
  return Number.isFinite(kickoff) && kickoff <= now;
}

/**
 * A player has started if his game has kicked off, or if the feed already
 * credits him with points. The second clause matters when the schedule failed
 * to load: points on the board are proof of a game, and hiding them because a
 * different request failed would be the scoreboard losing to its own plumbing.
 */
export function scorelineFor(input: ScorelineInput, now: number): Scoreline {
  const started = input.currentPoints != null || (!input.bye && hasKickedOff(input.kickoffIso, now));
  /* The feed reports a player who has played and scored nothing as 0, and the
     adapter folds 0 into null to keep pregame rows clean. Once his game is
     under way, null means zero, and zero is a real score worth printing. */
  return { started, scored: started ? input.currentPoints ?? 0 : null };
}

/** Scoreboard as soon as any player in the matchup has started. */
export function scoreModeFor(lines: Scoreline[]): ScoreMode {
  return lines.some((line) => line.started) ? 'scoreboard' : 'projection';
}

/**
 * A team's points scored, summed from rows that have started. Null in
 * projection mode, where there is no score yet to report.
 */
export function teamScored(lines: Scoreline[], mode: ScoreMode): number | null {
  if (mode !== 'scoreboard') return null;
  const total = lines.reduce((sum, line) => sum + (line.scored ?? 0), 0);
  return Number(total.toFixed(1));
}
