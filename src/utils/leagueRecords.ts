import type { HistoryEntry } from './openAnchors.ts';
import { americanFromPercent } from './openAnchors.ts';
import { closingLine } from './vsBook.ts';

/**
 * League records, denominated in odds.
 *
 * Every league already knows its high score. What none of them has is a record
 * book written in prices: the longest shot that ever came in, the worst beat
 * anybody has taken. Those only exist because we keep what we quoted.
 *
 * Records begin at our install date and grow from there. Nothing is
 * backfilled, invented, or inferred from a season we were not pricing — a
 * record book that quietly starts with fiction is worth less than an empty
 * one, because an empty one becomes true the moment the first game finishes.
 */

export interface CompletedGame {
  week: number;
  matchupId: number;
  rosterId: string;
  opponentRosterId: string;
  points: number;
  opponentPoints: number;
}

export interface LeagueRecord {
  id: 'longest-shot' | 'worst-beat' | 'highest-score';
  label: string;
  /** Null until something has actually happened. Never a placeholder. */
  holder: string | null;
  value: string | null;
  detail: string | null;
}

/** The closing win probability for a side, or null when it was never stored. */
function closingWinProb(
  history: readonly HistoryEntry[],
  game: CompletedGame,
): number | null {
  const side = closingLine(history, game.week)
    ?.lines?.find((line) => line.matchupId === game.matchupId)
    ?.sides?.[game.rosterId];
  return typeof side?.winProbability === 'number' ? side.winProbability : null;
}

/**
 * The record book for what we have actually priced.
 *
 * `nameFor` resolves a roster id to a team name; a game whose team cannot be
 * named is skipped rather than shown against a bare id.
 */
export function leagueRecords(
  history: readonly HistoryEntry[],
  games: readonly CompletedGame[],
  nameFor: (rosterId: string) => string | null,
): LeagueRecord[] {
  let longestShot: { prob: number; game: CompletedGame } | null = null;
  let worstBeat: { prob: number; game: CompletedGame } | null = null;
  let highest: CompletedGame | null = null;

  for (const game of games) {
    if (game.points > (highest?.points ?? -Infinity)) highest = game;

    const prob = closingWinProb(history, game);
    if (prob == null) continue;
    const won = game.points > game.opponentPoints;

    /* The longest price to come in: the smallest closing win probability that
       still went on to win. */
    if (won && prob < (longestShot?.prob ?? Infinity)) longestShot = { prob, game };

    /* The worst beat: the highest closing win probability that lost. */
    if (!won && prob > (worstBeat?.prob ?? -Infinity)) worstBeat = { prob, game };
  }

  const shotName = longestShot ? nameFor(longestShot.game.rosterId) : null;
  const beatName = worstBeat ? nameFor(worstBeat.game.rosterId) : null;
  const highName = highest ? nameFor(highest.rosterId) : null;

  return [
    {
      id: 'longest-shot',
      label: 'Longest shot to come in',
      holder: shotName,
      value: longestShot && shotName ? `+${americanFromPercent(longestShot.prob)}` : null,
      detail:
        longestShot && shotName
          ? `Week ${longestShot.game.week}, priced at ${longestShot.prob.toFixed(1)}%.`
          : null,
    },
    {
      id: 'worst-beat',
      label: 'Worst beat',
      holder: beatName,
      value: worstBeat && beatName ? `${worstBeat.prob.toFixed(1)}%` : null,
      detail:
        worstBeat && beatName
          ? `Week ${worstBeat.game.week}, lost ${worstBeat.game.points.toFixed(1)} to ${worstBeat.game.opponentPoints.toFixed(1)}.`
          : null,
    },
    {
      id: 'highest-score',
      label: 'Highest score',
      holder: highName,
      value: highest && highName ? highest.points.toFixed(1) : null,
      detail: highest && highName ? `Week ${highest.week}.` : null,
    },
  ];
}

/**
 * What a record with no holder should say.
 *
 * Deliberately about the record book rather than about the league: "nothing
 * has beaten this yet" implies a bar that does not exist. Records start at our
 * install date, and saying so is more honest than an em-dash.
 */
export const NO_RECORD_YET = 'No holder yet';
