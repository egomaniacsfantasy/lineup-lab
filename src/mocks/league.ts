import type { LeagueConnection } from '../types';
import { MOCK_MATCHUP } from './matchup';

export interface LeagueFutureRow {
  rosterId?: number;
  teamName: string;
  ownerName?: string;
  avatarUrl?: string | null;
  record: string;
  projRecord?: string;
  projWins?: number;
  projLosses?: number;
  championOdds: number;
  finalsOdds?: number;
  playoffOdds: number;
  playoffProb: number;
  playoffClinched?: boolean;
  avgSeed?: number;
  isUser: boolean;
}

export interface LeagueWeekMatchup {
  matchupId?: number;
  teamARosterId?: number;
  teamA: string;
  teamAOwnerName?: string;
  teamAAvatarUrl?: string | null;
  teamARecord: string;
  teamAOdds: number;
  teamAWinProb?: number;
  teamAProjection?: number;
  teamASpread?: number;
  teamBSpread?: number;
  totalProjection?: number;
  teamAIsUser?: boolean;
  teamBRosterId?: number;
  teamB: string;
  teamBOwnerName?: string;
  teamBAvatarUrl?: string | null;
  teamBRecord: string;
  teamBOdds: number;
  teamBWinProb?: number;
  teamBProjection?: number;
  teamBIsUser?: boolean;
  isUserGame: boolean;
}

export const MOCK_LEAGUE: LeagueConnection = {
  platform: 'sleeper',
  leagueId: 'odds-gods-2024-replay',
  leagueName: 'Odds Gods League (2024 Replay)',
  teamName: "Zeus's Bolts",
  teamId: 'zeus-01',
  scoringFormat: 'ppr',
  rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'],
  totalTeams: 12,
  currentWeek: 8,
  roster: MOCK_MATCHUP.yourTeam.roster,
};

/**
 * The demo league, and the only league anyone sees before they connect one.
 *
 * It is a BOOK, so it obeys a book's arithmetic. `probToAmerican` in
 * server/engine/engine.js charges no vig, which means a board the engine could
 * actually produce has to balance:
 *
 * - title prices imply exactly 100%, because one team wins it;
 * - finals prices imply 200%, because two teams reach the final;
 * - playoff prices imply 600%, because six of the twelve get in;
 * - playoffProb is the same number as playoffOdds, not a second opinion;
 * - records total 42-42, because every win in a league is someone's loss;
 * - projected wins total 84, i.e. 14 games across 12 teams;
 * - average seed averages 6.5, the midpoint of a twelve-team ladder.
 *
 * The previous board met none of these. Its title prices implied 144.3%, a
 * 44-point overround we do not charge and do not model; its playoff prices
 * implied 4.92 of 6 seats; every row's playoffProb disagreed with its own
 * playoffOdds; and the records summed to 39-45, which cannot happen. That was
 * survivable while this was only a mock. It stopped being survivable when the
 * board became the first thing on the marketing page, where it is the most
 * screenshottable artifact we publish.
 *
 * Every price below was generated from those probabilities by the engine's own
 * conversion, so the two can never disagree. test/demoBookIsFair.test.mjs
 * holds them to it.
 */
export const MOCK_LEAGUE_FUTURES: LeagueFutureRow[] = [
  {
    rosterId: 1,
    teamName: 'Apollo Archers',
    record: '7-0',
    projWins: 11.2,
    projLosses: 2.8,
    projRecord: '11.2-2.8',
    championOdds: 376,
    finalsOdds: 163,
    playoffOdds: -2400,
    playoffProb: 96.0,
    avgSeed: 1.6,
    isUser: false,
  },
  {
    rosterId: 2,
    teamName: 'Hermes Express',
    record: '5-2',
    projWins: 9.1,
    projLosses: 4.9,
    projRecord: '9.1-4.9',
    championOdds: 614,
    finalsOdds: 285,
    playoffOdds: -456,
    playoffProb: 82.0,
    avgSeed: 3.2,
    isUser: false,
  },
  {
    rosterId: 3,
    teamName: "Zeus's Bolts",
    record: '5-2',
    projWins: 8.9,
    projLosses: 5.1,
    projRecord: '8.9-5.1',
    championOdds: 669,
    finalsOdds: 308,
    playoffOdds: -376,
    playoffProb: 79.0,
    avgSeed: 3.6,
    isUser: true,
  },
  {
    rosterId: 4,
    teamName: 'Poseidon Waves',
    record: '5-2',
    projWins: 8.6,
    projLosses: 5.4,
    projRecord: '8.6-5.4',
    championOdds: 770,
    finalsOdds: 355,
    playoffOdds: -285,
    playoffProb: 74.0,
    avgSeed: 4.1,
    isUser: false,
  },
  {
    rosterId: 5,
    teamName: 'Hades Hounds',
    record: '4-3',
    projWins: 7.8,
    projLosses: 6.2,
    projRecord: '7.8-6.2',
    championOdds: 953,
    finalsOdds: 441,
    playoffOdds: -163,
    playoffProb: 62.0,
    avgSeed: 5.3,
    isUser: false,
  },
  {
    rosterId: 6,
    teamName: 'Athena Owls',
    record: '4-3',
    projWins: 7.5,
    projLosses: 6.5,
    projRecord: '7.5-6.5',
    championOdds: 1076,
    finalsOdds: 488,
    playoffOdds: -133,
    playoffProb: 57.0,
    avgSeed: 5.8,
    isUser: false,
  },
  {
    rosterId: 7,
    teamName: 'Ares Warriors',
    record: '3-4',
    projWins: 6.6,
    projLosses: 7.4,
    projRecord: '6.6-7.4',
    championOdds: 1567,
    finalsOdds: 700,
    playoffOdds: 127,
    playoffProb: 44.0,
    avgSeed: 7.1,
    isUser: false,
  },
  {
    rosterId: 8,
    teamName: 'Dionysus Vines',
    record: '3-4',
    projWins: 6.4,
    projLosses: 7.6,
    projRecord: '6.4-7.6',
    championOdds: 1718,
    finalsOdds: 770,
    playoffOdds: 144,
    playoffProb: 41.0,
    avgSeed: 7.4,
    isUser: false,
  },
  {
    rosterId: 9,
    teamName: 'Artemis Arrows',
    record: '2-5',
    projWins: 5.6,
    projLosses: 8.4,
    projRecord: '5.6-8.4',
    championOdds: 2400,
    finalsOdds: 1011,
    playoffOdds: 270,
    playoffProb: 27.0,
    avgSeed: 8.8,
    isUser: false,
  },
  {
    rosterId: 10,
    teamName: 'Hephaestus Forge',
    record: '2-5',
    projWins: 5.3,
    projLosses: 8.7,
    projRecord: '5.3-8.7',
    championOdds: 3233,
    finalsOdds: 1150,
    playoffOdds: 355,
    playoffProb: 22.0,
    avgSeed: 9.3,
    isUser: false,
  },
  {
    rosterId: 11,
    teamName: 'Demeter Fields',
    record: '1-6',
    projWins: 3.9,
    projLosses: 10.1,
    projRecord: '3.9-10.1',
    championOdds: 4445,
    finalsOdds: 1076,
    playoffOdds: 900,
    playoffProb: 10.0,
    avgSeed: 10.6,
    isUser: false,
  },
  {
    rosterId: 12,
    teamName: 'Kronos Titans',
    record: '1-6',
    projWins: 3.1,
    projLosses: 10.9,
    projRecord: '3.1-10.9',
    championOdds: 5456,
    finalsOdds: 2122,
    playoffOdds: 1567,
    playoffProb: 6.0,
    avgSeed: 11.2,
    isUser: false,
  },
];

export const MOCK_WEEK_MATCHUPS: LeagueWeekMatchup[] = [
  {
    teamA: "Zeus's Bolts",
    teamARecord: '5-2',
    teamAOdds: -260,
    teamB: 'Hermes Express',
    teamBRecord: '4-3',
    teamBOdds: 180,
    isUserGame: true,
  },
  {
    teamA: 'Apollo Archers',
    teamARecord: '7-0',
    teamAOdds: -310,
    teamB: 'Hades Hounds',
    teamBRecord: '4-3',
    teamBOdds: 250,
    isUserGame: false,
  },
  {
    teamA: 'Poseidon Waves',
    teamARecord: '5-2',
    teamAOdds: -145,
    teamB: 'Athena Owls',
    teamBRecord: '4-3',
    teamBOdds: 125,
    isUserGame: false,
  },
  {
    teamA: 'Ares Warriors',
    teamARecord: '2-5',
    teamAOdds: 110,
    teamB: 'Dionysus Vines',
    teamBRecord: '3-4',
    teamBOdds: -130,
    isUserGame: false,
  },
  {
    teamA: 'Artemis Arrows',
    teamARecord: '2-5',
    teamAOdds: -180,
    teamB: 'Demeter Fields',
    teamBRecord: '1-6',
    teamBOdds: 155,
    isUserGame: false,
  },
  {
    teamA: 'Hephaestus Forge',
    teamARecord: '1-6',
    teamAOdds: 160,
    teamB: 'Kronos Titans',
    teamBRecord: '1-6',
    teamBOdds: -190,
    isUserGame: false,
  },
];
