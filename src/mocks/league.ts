import type { LeagueConnection } from '../types';
import { MOCK_MATCHUP } from './matchup';

export interface LeagueFutureRow {
  teamName: string;
  record: string;
  championOdds: number;
  finalsOdds: number;
  playoffOdds: number;
  playoffProb: number;
  isUser: boolean;
}

export interface LeagueWeekMatchup {
  teamA: string;
  teamARecord: string;
  teamAOdds: number;
  teamB: string;
  teamBRecord: string;
  teamBOdds: number;
  isUserGame: boolean;
}

export const MOCK_LEAGUE: LeagueConnection = {
  platform: 'sleeper',
  leagueId: 'mount-olympus-2024-replay',
  leagueName: 'Mount Olympus League · 2024 Replay',
  teamName: "Zeus's Bolts",
  teamId: 'zeus-01',
  scoringFormat: 'ppr',
  rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'],
  totalTeams: 12,
  currentWeek: 8,
  roster: MOCK_MATCHUP.yourTeam.roster,
};

export const MOCK_LEAGUE_FUTURES: LeagueFutureRow[] = [
  {
    teamName: 'Apollo Archers',
    record: '7-0',
    championOdds: 240,
    finalsOdds: 150,
    playoffOdds: -450,
    playoffProb: 91.2,
    isUser: false,
  },
  {
    teamName: 'Hermes Express',
    record: '4-3',
    championOdds: 420,
    finalsOdds: 180,
    playoffOdds: -320,
    playoffProb: 84.6,
    isUser: false,
  },
  {
    teamName: "Zeus's Bolts",
    record: '5-2',
    championOdds: 450,
    finalsOdds: 230,
    playoffOdds: -200,
    playoffProb: 72.4,
    isUser: true,
  },
  {
    teamName: 'Poseidon Waves',
    record: '5-2',
    championOdds: 520,
    finalsOdds: 205,
    playoffOdds: -210,
    playoffProb: 68.1,
    isUser: false,
  },
  {
    teamName: 'Hades Hounds',
    record: '4-3',
    championOdds: 680,
    finalsOdds: 390,
    playoffOdds: 145,
    playoffProb: 52.3,
    isUser: false,
  },
  {
    teamName: 'Athena Owls',
    record: '4-3',
    championOdds: 750,
    finalsOdds: 330,
    playoffOdds: 105,
    playoffProb: 48.7,
    isUser: false,
  },
  {
    teamName: 'Ares Warriors',
    record: '2-5',
    championOdds: 820,
    finalsOdds: 420,
    playoffOdds: 170,
    playoffProb: 41.2,
    isUser: false,
  },
  {
    teamName: 'Dionysus Vines',
    record: '3-4',
    championOdds: 1200,
    finalsOdds: 650,
    playoffOdds: 360,
    playoffProb: 22.8,
    isUser: false,
  },
  {
    teamName: 'Artemis Arrows',
    record: '2-5',
    championOdds: 1400,
    finalsOdds: 750,
    playoffOdds: 300,
    playoffProb: 18.4,
    isUser: false,
  },
  {
    teamName: 'Hephaestus Forge',
    record: '1-6',
    championOdds: 1800,
    finalsOdds: 950,
    playoffOdds: 580,
    playoffProb: 14.1,
    isUser: false,
  },
  {
    teamName: 'Demeter Fields',
    record: '1-6',
    championOdds: 2500,
    finalsOdds: 1400,
    playoffOdds: 1200,
    playoffProb: 6.2,
    isUser: false,
  },
  {
    teamName: 'Kronos Titans',
    record: '1-6',
    championOdds: 4000,
    finalsOdds: 2200,
    playoffOdds: 2800,
    playoffProb: 3.1,
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
