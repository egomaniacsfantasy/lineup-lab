import type { LeagueWeekMatchup } from '../mocks/league.ts';
import { teamsFor, type BoardTeam } from './boardSides.ts';
import { isMaterialMove } from './leagueMovement.ts';
import { weekOpen, type HistoryEntry } from './openAnchors.ts';

/**
 * The week at a glance, read off each game's pregame line.
 *
 * The board is live, and it should be: a card for a game in progress quotes
 * the game in progress. The glance cannot, because every question it asks is
 * a question about the market before the games are played. Once anybody in a
 * matchup kicks off, the engine pins whoever has played to his real score, and
 * from then on its price for that game follows the scoreboard. Read off the
 * live board on a Monday night, the biggest favourite was a team that had
 * already won, quoted as a check; the closest line was -313; and the biggest
 * move was one team's Sunday.
 *
 * So each game is read the way a book reads a game that has started: at its
 * closing line, the last price posted before it began.
 *
 *   open     nobody in it has kicked off. Its line is the board's own.
 *   closed   somebody has. Its line is the last snapshot recorded strictly
 *            before its first kickoff.
 *   unknown  it has started and nothing was recorded before it did, or when
 *            it kicked off is not known. It sits out. The only number left
 *            for it is the live one, which is the number this exists to keep
 *            out of the summary.
 *
 * Nothing here prices anything. The closing numbers are the engine's own,
 * stored as it posted them; this only chooses which snapshot to read.
 */

export type KickoffMap = ReadonlyMap<string, { kickoffIso: string }>;

export interface GlanceGameInput {
  matchup: LeagueWeekMatchup;
  /** Earliest kickoff across both starting lineups, in ms. Null when none is known. */
  kickoffAt: number | null;
  /** True once anybody in the matchup has started, by the clock or the scoreboard. */
  started: boolean;
}

export interface GlanceGame {
  status: 'open' | 'closed';
  /* Seated by the board's own rule, applied to the pregame numbers. A game the
     underdog is winning has the live leader in the board's left seat, and the
     glance is not about who is winning. */
  left: BoardTeam;
  right: BoardTeam;
  favorite: BoardTeam;
  underdog: BoardTeam;
  /** Fantasy points. Null on a snapshot that predates projections being stored. */
  total: number | null;
  /** The left team's move since the week opened, in percentage points, when material. */
  move: number | null;
}

export interface WeekGlance {
  biggestFavorite: GlanceGame | null;
  closestLine: GlanceGame | null;
  highestTotal: GlanceGame | null;
  biggestMove: GlanceGame | null;
  /** How much of the week is under way: before the first kickoff, part of it, or every game. */
  kickedOff: 'none' | 'some' | 'all';
}

/**
 * The first kickoff in a matchup, in ms, or null when no starter has one.
 *
 * Both lineups, because the line is over both: one side's Thursday starter
 * puts the whole game in play. A starter on bye, an empty slot and a team the
 * schedule does not list carry no kickoff and are skipped rather than guessed.
 */
export function firstKickoff(
  starters: readonly { team?: string | null }[],
  kickoffs: KickoffMap,
): number | null {
  let first: number | null = null;
  for (const starter of starters) {
    const team = starter.team?.toUpperCase();
    if (!team) continue;
    const at = Date.parse(kickoffs.get(team)?.kickoffIso ?? '');
    if (!Number.isFinite(at)) continue;
    if (first == null || at < first) first = at;
  }
  return first;
}

/**
 * The last snapshot of a week recorded strictly before a moment.
 *
 * Strictly: a snapshot stamped at the kickoff itself may already have the
 * first scores in it, and a closing line is by definition the last price
 * nobody had seen a snap for.
 */
export function lastSnapshotBefore(
  history: readonly HistoryEntry[],
  week: number,
  before: number,
): HistoryEntry | null {
  let found: HistoryEntry | null = null;
  for (const entry of history) {
    if (entry.week !== week || !(entry.computedAt < before)) continue;
    if (!found || entry.computedAt > found.computedAt) found = entry;
  }
  return found;
}

function sideAt(entry: HistoryEntry, matchupId: number, rosterId: number) {
  return entry.lines?.find((line) => line.matchupId === matchupId)?.sides?.[String(rosterId)] ?? null;
}

/**
 * The same game, carrying the numbers a snapshot posted for it. Null when the
 * snapshot did not price both sides, which is a game it cannot speak about.
 */
function atSnapshot(matchup: LeagueWeekMatchup, snapshot: HistoryEntry): LeagueWeekMatchup | null {
  const { matchupId, teamARosterId, teamBRosterId } = matchup;
  if (matchupId == null || teamARosterId == null || teamBRosterId == null) return null;
  const a = sideAt(snapshot, matchupId, teamARosterId);
  const b = sideAt(snapshot, matchupId, teamBRosterId);
  if (!a || !b) return null;
  return {
    ...matchup,
    teamAOdds: a.moneyline,
    teamAWinProb: a.winProbability,
    teamAProjection: a.projection,
    teamASpread: a.spread,
    teamBOdds: b.moneyline,
    teamBWinProb: b.winProbability,
    teamBProjection: b.projection,
    teamBSpread: b.spread,
    /* A snapshot keeps each side's projection, not the total. The engine's
       total is the same two means added and then rounded once, so this can
       sit a tenth off the figure it posted and no further. */
    totalProjection:
      typeof a.projection === 'number' && typeof b.projection === 'number'
        ? Number((a.projection + b.projection).toFixed(1))
        : undefined,
  };
}

/**
 * A side's move from the week's open to a snapshot, when it is material.
 *
 * The same subtraction weekMovement makes for the board's arrows. For a game
 * that has not started, `at` is the latest snapshot, which is exactly the
 * pair the board measures, so the glance still names the card whose arrow is
 * biggest. For a game that has, `at` is its close, and the move stops at
 * kickoff instead of running on into the scoreboard.
 */
function moveSinceOpen(
  open: HistoryEntry | null,
  at: HistoryEntry | null,
  matchupId: number | undefined,
  rosterId: number | undefined,
): number | null {
  if (!open || !at || open.computedAt === at.computedAt) return null;
  if (matchupId == null || rosterId == null) return null;
  const from = sideAt(open, matchupId, rosterId);
  const to = sideAt(at, matchupId, rosterId);
  if (!from || !to) return null;
  const move = to.winProbability - from.winProbability;
  return isMaterialMove(move) ? move : null;
}

export function weekGlance({
  games,
  history,
  week,
  movement = true,
}: {
  games: readonly GlanceGameInput[];
  history: readonly HistoryEntry[];
  week: number;
  /** Off when line movement is switched off for the board, so the glance cannot report one. */
  movement?: boolean;
}): WeekGlance {
  const open = weekOpen(history, week);
  const latest = lastSnapshotBefore(history, week, Number.POSITIVE_INFINITY);

  const read: GlanceGame[] = [];
  let started = 0;
  for (const game of games) {
    let status: GlanceGame['status'] = 'open';
    let priced: LeagueWeekMatchup | null = game.matchup;
    let at = latest;
    if (game.started) {
      started += 1;
      const close = game.kickoffAt == null ? null : lastSnapshotBefore(history, week, game.kickoffAt);
      priced = close ? atSnapshot(game.matchup, close) : null;
      if (!priced) continue;
      status = 'closed';
      at = close;
    }
    const { left, right } = teamsFor(priced);
    const favorite = left.winProb >= right.winProb ? left : right;
    read.push({
      status,
      left,
      right,
      favorite,
      underdog: favorite === left ? right : left,
      total: typeof priced.totalProjection === 'number' ? priced.totalProjection : null,
      move: movement ? moveSinceOpen(open, at, priced.matchupId, left.rosterId) : null,
    });
  }

  /* Each pick keeps the first game on a tie, in the order the board lists
     them, which is what these reductions did when they read the board. */
  const pick = (
    better: (game: GlanceGame, best: GlanceGame) => boolean,
    eligible?: (game: GlanceGame) => boolean,
  ) =>
    read.reduce<GlanceGame | null>((best, game) => {
      if (eligible && !eligible(game)) return best;
      return !best || better(game, best) ? game : best;
    }, null);

  return {
    biggestFavorite: pick((game, best) => game.favorite.winProb > best.favorite.winProb),
    closestLine: pick(
      (game, best) => Math.abs(game.left.winProb - 50) < Math.abs(best.left.winProb - 50),
    ),
    highestTotal: pick(
      (game, best) => (game.total ?? 0) > (best.total ?? 0),
      (game) => game.total != null,
    ),
    biggestMove: pick(
      (game, best) => Math.abs(game.move ?? 0) > Math.abs(best.move ?? 0),
      (game) => game.move != null,
    ),
    kickedOff: started === 0 ? 'none' : started === games.length ? 'all' : 'some',
  };
}
