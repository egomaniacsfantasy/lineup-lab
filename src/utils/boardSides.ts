import { impliedProbability } from './formatOdds.ts';
import type { LeagueWeekMatchup } from '../mocks/league.ts';
import type { LineupSlotEntry } from './matchupLineups.ts';

/**
 * Which team sits on which side of a card, and what each side's numbers are.
 *
 * This lives outside the component because seating is the part that gets a
 * board wrong. A matchup arrives as ten fields named teamAThis and teamBThat,
 * the card seats them by who is favoured rather than by which letter they
 * were given, and every number rendered after that has to follow the team
 * across the swap. It shipped not doing so: the left cell read
 * matchup.teamASpread while the left seat held team B, so a favourite priced
 * at -113 was quoted at +2.9 - the underdog's line, with the underdog's sign.
 *
 * Nothing here computes a price. The seating is a sort and the spread label
 * is a sign flip on a number the engine already produced.
 */
export type BoardTeam = {
  side: 'a' | 'b';
  rosterId?: number;
  name: string;
  ownerName?: string;
  record: string;
  odds: number;
  winProb: number;
  projection?: number;
  /** Projected margin over the other side. Positive means favoured. */
  spread?: number;
  avatarUrl?: string | null;
  isUser?: boolean;
  /* This side's starting lineup, carried through the seating swap with the
     rest of its numbers. The whole point of this module is that a team's
     figures follow it across the seat; a lineup read off matchup.teamA
     after the seats were swapped would put one team's players under the
     other team's name. */
  starters?: LineupSlotEntry[];
};

export function teamsFor(matchup: LeagueWeekMatchup): { left: BoardTeam; right: BoardTeam } {
  const teamA: BoardTeam = {
    side: 'a',
    rosterId: matchup.teamARosterId,
    name: matchup.teamA,
    ownerName: matchup.teamAOwnerName,
    record: matchup.teamARecord,
    odds: matchup.teamAOdds,
    winProb: matchup.teamAWinProb ?? impliedProbability(matchup.teamAOdds),
    projection: matchup.teamAProjection,
    spread: matchup.teamASpread,
    avatarUrl: matchup.teamAAvatarUrl,
    isUser: matchup.teamAIsUser,
    starters: matchup.teamAStarters,
  };
  const teamB: BoardTeam = {
    side: 'b',
    rosterId: matchup.teamBRosterId,
    name: matchup.teamB,
    ownerName: matchup.teamBOwnerName,
    record: matchup.teamBRecord,
    odds: matchup.teamBOdds,
    winProb: matchup.teamBWinProb ?? impliedProbability(matchup.teamBOdds),
    projection: matchup.teamBProjection,
    spread: matchup.teamBSpread,
    avatarUrl: matchup.teamBAvatarUrl,
    isUser: matchup.teamBIsUser,
    starters: matchup.teamBStarters,
  };

  /* Your game reads left to right the way you would say it out loud, whoever
     is favoured. Everyone else's is sorted so the chalk is on the left. */
  if (matchup.isUserGame) {
    return teamA.isUser || (!teamA.isUser && !teamB.isUser)
      ? { left: teamA, right: teamB }
      : { left: teamB, right: teamA };
  }

  return teamA.winProb >= teamB.winProb ? { left: teamA, right: teamB } : { left: teamB, right: teamA };
}

/**
 * A margin, printed as a book would post it.
 *
 * The engine prices each side's projected margin over the other, so the
 * favourite's is positive. A board posts the opposite: the favourite lays the
 * points, so it is the side carrying a minus. Hence the flip. PK for a
 * pick'em, and an empty cell rather than a dash when there is no line at all
 * - a dash where a number goes reads as a number being withheld.
 */
export function spreadLabel(spread: number | undefined): string {
  if (typeof spread !== 'number') return '';
  if (spread === 0) return 'PK';
  return `${spread > 0 ? '-' : '+'}${Math.abs(spread).toFixed(1)}`;
}
