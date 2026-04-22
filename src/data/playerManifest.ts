import type { Player, Position } from '../types';

export interface Season2024Stats {
  gamesPlayed: number;
  pprPointsTotal: number;
  pprPointsPerGame: number;
  passYards?: number;
  passTDs?: number;
  ints?: number;
  rushYards?: number;
  rushTDs?: number;
  receptions?: number;
  recYards?: number;
  recTDs?: number;
  fgMade?: number;
  fgAttempts?: number;
  longest?: number;
  xpMade?: number;
  xpAttempts?: number;
  sacks?: number;
  fumblesRecovered?: number;
  defTDs?: number;
  pointsAllowedAvg?: number;
}

export interface Week2024Stats {
  opponent: string;
  opponentRank: number;
  gameLine: string;
  gameTotal: string;
  kickoff: string;
  pprPoints: number;
  passYards?: number;
  passTDs?: number;
  ints?: number;
  rushYards?: number;
  rushTDs?: number;
  receptions?: number;
  recYards?: number;
  recTDs?: number;
  fgMade?: number;
  fgAttempts?: number;
  longest?: number;
  xpMade?: number;
  xpAttempts?: number;
  sacks?: number;
  fumblesRecovered?: number;
  defTDs?: number;
  pointsAllowed?: number;
}

export interface LastFour2024Game {
  week: number;
  opponent: string;
  pts: number;
}

export interface PlayerManifestEntry {
  slug: string;
  fullName: string;
  displayName: string;
  position: Position;
  team: string;
  byeWeek2024: number;
  jerseyNumber?: string;
  espnId: string | null;
  headshotUrl: string;
  season2024: Season2024Stats;
  week8_2024: Week2024Stats;
  last4_2024: LastFour2024Game[];
}

const HEADSHOT_BASE = 'https://a.espncdn.com/i/headshots/nfl/players/full';
const TEAM_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/nfl/500';

const TEAM_LOGO_SLUGS: Record<string, string> = {
  WAS: 'wsh',
  LAR: 'lar',
};

// 2024 NFL Season Replay. Mount Olympus League demo data.
// Player stats and game logs come from public 2024 weekly NFL stat feeds; ESPN IDs and game contexts were verified against espn.com on Apr 22, 2026.
// Pro Football Reference was unavailable from this environment due a 403 challenge, so values were cross-checked against ESPN archive data where available.
// This file is the single source of truth. Components consume by slug.
// When the live engine + current-season data wires in, replace this file. The UI does not change.
export const PLAYER_MANIFEST = {
  'p-mahomes': {
    slug: 'p-mahomes',
    fullName: 'Patrick Mahomes',
    displayName: 'P. Mahomes',
    position: 'QB',
    team: 'KC',
    byeWeek2024: 6,
    jerseyNumber: '15',
    espnId: '3139477',
    headshotUrl: `${HEADSHOT_BASE}/3139477.png`,
    season2024: {
      gamesPlayed: 16,
      passYards: 3928,
      passTDs: 26,
      ints: 11,
      rushYards: 307,
      rushTDs: 2,
      pprPointsTotal: 283.0,
      pprPointsPerGame: 17.7,
    },
    week8_2024: {
      opponent: 'LV',
      opponentRank: 28,
      gameLine: 'KC -8.5 · O/U 42.5 @ LV',
      gameTotal: '42.5',
      kickoff: 'Sun 4:25pm',
      passYards: 262,
      passTDs: 2,
      ints: 1,
      rushYards: 17,
      rushTDs: 0,
      pprPoints: 18.2,
    },
    last4_2024: [
      { week: 4, opponent: 'LAC', pts: 13.0 },
      { week: 5, opponent: 'NO', pts: 13.4 },
      { week: 6, opponent: 'BYE', pts: 0 },
      { week: 7, opponent: 'SF', pts: 12.1 },
    ],
  },
  'l-jackson': {
    slug: 'l-jackson',
    fullName: 'Lamar Jackson',
    displayName: 'L. Jackson',
    position: 'QB',
    team: 'BAL',
    byeWeek2024: 14,
    jerseyNumber: '8',
    espnId: '3916387',
    headshotUrl: `${HEADSHOT_BASE}/3916387.png`,
    season2024: {
      gamesPlayed: 17,
      passYards: 4172,
      passTDs: 41,
      ints: 4,
      rushYards: 915,
      rushTDs: 4,
      pprPointsTotal: 430.4,
      pprPointsPerGame: 25.3,
    },
    week8_2024: {
      opponent: 'CLE',
      opponentRank: 20,
      gameLine: 'BAL -7.5 · O/U 44.5 @ CLE',
      gameTotal: '44.5',
      kickoff: 'Sun 1pm',
      passYards: 289,
      passTDs: 2,
      ints: 0,
      rushYards: 46,
      rushTDs: 0,
      pprPoints: 24.2,
    },
    last4_2024: [
      { week: 4, opponent: 'BUF', pts: 23.6 },
      { week: 5, opponent: 'CIN', pts: 33.4 },
      { week: 6, opponent: 'WAS', pts: 18.9 },
      { week: 7, opponent: 'TB', pts: 34.4 },
    ],
  },
  'j-allen': {
    slug: 'j-allen',
    fullName: 'Josh Allen',
    displayName: 'J. Allen',
    position: 'QB',
    team: 'BUF',
    byeWeek2024: 12,
    jerseyNumber: '17',
    espnId: '3918298',
    headshotUrl: `${HEADSHOT_BASE}/3918298.png`,
    season2024: {
      gamesPlayed: 16,
      passYards: 3731,
      passTDs: 28,
      ints: 6,
      rushYards: 531,
      rushTDs: 12,
      pprPointsTotal: 372.3,
      pprPointsPerGame: 23.3,
    },
    week8_2024: {
      opponent: 'SEA',
      opponentRank: 17,
      gameLine: 'BUF -3.5 · O/U 45.5 @ SEA',
      gameTotal: '45.5',
      kickoff: 'Sun 4:05pm',
      passYards: 283,
      passTDs: 2,
      ints: 1,
      rushYards: 25,
      rushTDs: 0,
      pprPoints: 19.8,
    },
    last4_2024: [
      { week: 4, opponent: 'BAL', pts: 7.3 },
      { week: 5, opponent: 'HOU', pts: 14.6 },
      { week: 6, opponent: 'NYJ', pts: 24.4 },
      { week: 7, opponent: 'TEN', pts: 21.0 },
    ],
  },
  'j-burrow': {
    slug: 'j-burrow',
    fullName: 'Joe Burrow',
    displayName: 'J. Burrow',
    position: 'QB',
    team: 'CIN',
    byeWeek2024: 12,
    jerseyNumber: '9',
    espnId: '3915511',
    headshotUrl: `${HEADSHOT_BASE}/3915511.png`,
    season2024: {
      gamesPlayed: 17,
      passYards: 4918,
      passTDs: 43,
      ints: 9,
      rushYards: 201,
      rushTDs: 2,
      pprPointsTotal: 372.8,
      pprPointsPerGame: 21.9,
    },
    week8_2024: {
      opponent: 'PHI',
      opponentRank: 3,
      gameLine: 'CIN -2.5 · O/U 47.5 vs PHI',
      gameTotal: '47.5',
      kickoff: 'Sun 1pm',
      passYards: 234,
      passTDs: 1,
      ints: 1,
      rushYards: 15,
      rushTDs: 0,
      pprPoints: 12.9,
    },
    last4_2024: [
      { week: 4, opponent: 'CAR', pts: 16.3 },
      { week: 5, opponent: 'BAL', pts: 33.8 },
      { week: 6, opponent: 'NYG', pts: 19.8 },
      { week: 7, opponent: 'CLE', pts: 14.9 },
    ],
  },
  's-barkley': {
    slug: 's-barkley',
    fullName: 'Saquon Barkley',
    displayName: 'S. Barkley',
    position: 'RB',
    team: 'PHI',
    byeWeek2024: 5,
    jerseyNumber: '26',
    espnId: '3929630',
    headshotUrl: `${HEADSHOT_BASE}/3929630.png`,
    season2024: {
      gamesPlayed: 16,
      rushYards: 2005,
      rushTDs: 13,
      receptions: 33,
      recYards: 278,
      recTDs: 2,
      pprPointsTotal: 355.3,
      pprPointsPerGame: 22.2,
    },
    week8_2024: {
      opponent: 'CIN',
      opponentRank: 23,
      gameLine: 'PHI +2.5 · O/U 47.5 @ CIN',
      gameTotal: '47.5',
      kickoff: 'Sun 1pm',
      rushYards: 108,
      rushTDs: 0,
      receptions: 1,
      recYards: 3,
      recTDs: 0,
      pprPoints: 12.1,
    },
    last4_2024: [
      { week: 4, opponent: 'TB', pts: 13.6 },
      { week: 5, opponent: 'BYE', pts: 0 },
      { week: 6, opponent: 'CLE', pts: 7.4 },
      { week: 7, opponent: 'NYG', pts: 26.7 },
    ],
  },
  'd-henry': {
    slug: 'd-henry',
    fullName: 'Derrick Henry',
    displayName: 'D. Henry',
    position: 'RB',
    team: 'BAL',
    byeWeek2024: 14,
    jerseyNumber: '22',
    espnId: '3043078',
    headshotUrl: `${HEADSHOT_BASE}/3043078.png`,
    season2024: {
      gamesPlayed: 17,
      rushYards: 1921,
      rushTDs: 16,
      receptions: 19,
      recYards: 193,
      recTDs: 2,
      pprPointsTotal: 336.4,
      pprPointsPerGame: 19.8,
    },
    week8_2024: {
      opponent: 'CLE',
      opponentRank: 16,
      gameLine: 'BAL -7.5 · O/U 44.5 @ CLE',
      gameTotal: '44.5',
      kickoff: 'Sun 1pm',
      rushYards: 73,
      rushTDs: 1,
      receptions: 1,
      recYards: 4,
      recTDs: 0,
      pprPoints: 14.7,
    },
    last4_2024: [
      { week: 4, opponent: 'BUF', pts: 35.9 },
      { week: 5, opponent: 'CIN', pts: 16.6 },
      { week: 6, opponent: 'WAS', pts: 25.2 },
      { week: 7, opponent: 'TB', pts: 25.2 },
    ],
  },
  'b-robinson': {
    slug: 'b-robinson',
    fullName: 'Bijan Robinson',
    displayName: 'B. Robinson',
    position: 'RB',
    team: 'ATL',
    byeWeek2024: 12,
    jerseyNumber: '7',
    espnId: '4430807',
    headshotUrl: `${HEADSHOT_BASE}/4430807.png`,
    season2024: {
      gamesPlayed: 17,
      rushYards: 1456,
      rushTDs: 14,
      receptions: 61,
      recYards: 431,
      recTDs: 1,
      pprPointsTotal: 341.7,
      pprPointsPerGame: 20.1,
    },
    week8_2024: {
      opponent: 'TB',
      opponentRank: 21,
      gameLine: 'ATL -0.5 · O/U 47.5 @ TB',
      gameTotal: '47.5',
      kickoff: 'Sun 1pm',
      rushYards: 63,
      rushTDs: 0,
      receptions: 7,
      recYards: 43,
      recTDs: 1,
      pprPoints: 23.6,
    },
    last4_2024: [
      { week: 4, opponent: 'NO', pts: 11.4 },
      { week: 5, opponent: 'TB', pts: 10.7 },
      { week: 6, opponent: 'CAR', pts: 25.5 },
      { week: 7, opponent: 'SEA', pts: 23.3 },
    ],
  },
  'j-gibbs': {
    slug: 'j-gibbs',
    fullName: 'Jahmyr Gibbs',
    displayName: 'J. Gibbs',
    position: 'RB',
    team: 'DET',
    byeWeek2024: 5,
    jerseyNumber: '26',
    espnId: '4429795',
    headshotUrl: `${HEADSHOT_BASE}/4429795.png`,
    season2024: {
      gamesPlayed: 17,
      rushYards: 1412,
      rushTDs: 16,
      receptions: 52,
      recYards: 497,
      recTDs: 3,
      pprPointsTotal: 354.9,
      pprPointsPerGame: 20.9,
    },
    week8_2024: {
      opponent: 'TEN',
      opponentRank: 25,
      gameLine: 'DET -12.5 · O/U 46.5 vs TEN',
      gameTotal: '46.5',
      kickoff: 'Sun 1pm',
      rushYards: 127,
      rushTDs: 1,
      receptions: 1,
      recYards: 6,
      recTDs: 0,
      pprPoints: 20.3,
    },
    last4_2024: [
      { week: 4, opponent: 'SEA', pts: 19.8 },
      { week: 5, opponent: 'BYE', pts: 0 },
      { week: 6, opponent: 'DAL', pts: 12.1 },
      { week: 7, opponent: 'MIN', pts: 32.0 },
    ],
  },
  'j-jacobs': {
    slug: 'j-jacobs',
    fullName: 'Josh Jacobs',
    displayName: 'J. Jacobs',
    position: 'RB',
    team: 'GB',
    byeWeek2024: 10,
    jerseyNumber: '8',
    espnId: '4047365',
    headshotUrl: `${HEADSHOT_BASE}/4047365.png`,
    season2024: {
      gamesPlayed: 17,
      rushYards: 1329,
      rushTDs: 15,
      receptions: 36,
      recYards: 342,
      recTDs: 1,
      pprPointsTotal: 293.1,
      pprPointsPerGame: 17.2,
    },
    week8_2024: {
      opponent: 'JAX',
      opponentRank: 29,
      gameLine: 'GB -3.5 · O/U 49.5 @ JAX',
      gameTotal: '49.5',
      kickoff: 'Sun 1pm',
      rushYards: 127,
      rushTDs: 2,
      receptions: 1,
      recYards: -2,
      recTDs: 0,
      pprPoints: 25.5,
    },
    last4_2024: [
      { week: 4, opponent: 'MIN', pts: 11.8 },
      { week: 5, opponent: 'LA', pts: 16.4 },
      { week: 6, opponent: 'ARI', pts: 12.0 },
      { week: 7, opponent: 'HOU', pts: 20.2 },
    ],
  },
  'j-jefferson': {
    slug: 'j-jefferson',
    fullName: 'Justin Jefferson',
    displayName: 'J. Jefferson',
    position: 'WR',
    team: 'MIN',
    byeWeek2024: 6,
    jerseyNumber: '18',
    espnId: '4262921',
    headshotUrl: `${HEADSHOT_BASE}/4262921.png`,
    season2024: {
      gamesPlayed: 17,
      receptions: 103,
      recYards: 1533,
      recTDs: 10,
      rushYards: 3,
      pprPointsTotal: 317.5,
      pprPointsPerGame: 18.7,
    },
    week8_2024: {
      opponent: 'LA',
      opponentRank: 22,
      gameLine: 'MIN -2.5 · O/U 46.5 @ LAR',
      gameTotal: '46.5',
      kickoff: 'Thu 8:15pm',
      receptions: 8,
      recYards: 115,
      recTDs: 0,
      pprPoints: 19.5,
    },
    last4_2024: [
      { week: 4, opponent: 'GB', pts: 20.5 },
      { week: 5, opponent: 'NYJ', pts: 15.2 },
      { week: 6, opponent: 'BYE', pts: 0 },
      { week: 7, opponent: 'DET', pts: 21.4 },
    ],
  },
  'j-chase': {
    slug: 'j-chase',
    fullName: "Ja'Marr Chase",
    displayName: 'J. Chase',
    position: 'WR',
    team: 'CIN',
    byeWeek2024: 12,
    jerseyNumber: '1',
    espnId: '4362628',
    headshotUrl: `${HEADSHOT_BASE}/4362628.png`,
    season2024: {
      gamesPlayed: 17,
      receptions: 127,
      recYards: 1708,
      recTDs: 17,
      rushYards: 32,
      pprPointsTotal: 403.0,
      pprPointsPerGame: 23.7,
    },
    week8_2024: {
      opponent: 'PHI',
      opponentRank: 3,
      gameLine: 'CIN -2.5 · O/U 47.5 vs PHI',
      gameTotal: '47.5',
      kickoff: 'Sun 1pm',
      receptions: 9,
      recYards: 54,
      recTDs: 1,
      pprPoints: 20.4,
    },
    last4_2024: [
      { week: 4, opponent: 'CAR', pts: 17.5 },
      { week: 5, opponent: 'BAL', pts: 41.3 },
      { week: 6, opponent: 'NYG', pts: 12.2 },
      { week: 7, opponent: 'CLE', pts: 17.6 },
    ],
  },
  'c-lamb': {
    slug: 'c-lamb',
    fullName: 'CeeDee Lamb',
    displayName: 'C. Lamb',
    position: 'WR',
    team: 'DAL',
    byeWeek2024: 7,
    jerseyNumber: '88',
    espnId: '4241389',
    headshotUrl: `${HEADSHOT_BASE}/4241389.png`,
    season2024: {
      gamesPlayed: 15,
      receptions: 101,
      recYards: 1194,
      recTDs: 6,
      rushYards: 70,
      pprPointsTotal: 263.4,
      pprPointsPerGame: 17.6,
    },
    week8_2024: {
      opponent: 'SF',
      opponentRank: 8,
      gameLine: 'DAL @ SF · Final 24-30',
      gameTotal: '54',
      kickoff: 'Sun 8:20pm',
      receptions: 13,
      recYards: 146,
      recTDs: 2,
      pprPoints: 39.6,
    },
    last4_2024: [
      { week: 4, opponent: 'NYG', pts: 23.6 },
      { week: 5, opponent: 'PIT', pts: 11.4 },
      { week: 6, opponent: 'DET', pts: 16.1 },
      { week: 7, opponent: 'BYE', pts: 0 },
    ],
  },
  'a-stbrown': {
    slug: 'a-stbrown',
    fullName: 'Amon-Ra St. Brown',
    displayName: 'A. St. Brown',
    position: 'WR',
    team: 'DET',
    byeWeek2024: 5,
    jerseyNumber: '14',
    espnId: '4374302',
    headshotUrl: `${HEADSHOT_BASE}/4374302.png`,
    season2024: {
      gamesPlayed: 17,
      receptions: 115,
      recYards: 1263,
      recTDs: 12,
      rushYards: 6,
      passYards: 7,
      passTDs: 1,
      pprPointsTotal: 316.2,
      pprPointsPerGame: 18.6,
    },
    week8_2024: {
      opponent: 'TEN',
      opponentRank: 26,
      gameLine: 'DET -12.5 · O/U 46.5 vs TEN',
      gameTotal: '46.5',
      kickoff: 'Sun 1pm',
      receptions: 2,
      recYards: 7,
      recTDs: 1,
      pprPoints: 8.7,
    },
    last4_2024: [
      { week: 4, opponent: 'SEA', pts: 20.8 },
      { week: 5, opponent: 'BYE', pts: 0 },
      { week: 6, opponent: 'DAL', pts: 13.7 },
      { week: 7, opponent: 'MIN', pts: 25.2 },
    ],
  },
  'p-nacua': {
    slug: 'p-nacua',
    fullName: 'Puka Nacua',
    displayName: 'P. Nacua',
    position: 'WR',
    team: 'LAR',
    byeWeek2024: 6,
    jerseyNumber: '17',
    espnId: '4426515',
    headshotUrl: `${HEADSHOT_BASE}/4426515.png`,
    season2024: {
      gamesPlayed: 11,
      receptions: 79,
      recYards: 990,
      recTDs: 3,
      rushYards: 46,
      rushTDs: 1,
      pprPointsTotal: 206.6,
      pprPointsPerGame: 18.8,
    },
    week8_2024: {
      opponent: 'MIN',
      opponentRank: 12,
      gameLine: 'LAR +2.5 · O/U 46.5 vs MIN',
      gameTotal: '46.5',
      kickoff: 'Thu 8:15pm',
      rushYards: 5,
      receptions: 7,
      recYards: 106,
      recTDs: 0,
      pprPoints: 18.1,
    },
    last4_2024: [
      { week: 4, opponent: 'BYE', pts: 0 },
      { week: 5, opponent: 'BYE', pts: 0 },
      { week: 6, opponent: 'BYE', pts: 0 },
      { week: 7, opponent: 'BYE', pts: 0 },
    ],
  },
  'd-london': {
    slug: 'd-london',
    fullName: 'Drake London',
    displayName: 'D. London',
    position: 'WR',
    team: 'ATL',
    byeWeek2024: 12,
    jerseyNumber: '5',
    espnId: '4426502',
    headshotUrl: `${HEADSHOT_BASE}/4426502.png`,
    season2024: {
      gamesPlayed: 17,
      receptions: 100,
      recYards: 1271,
      recTDs: 9,
      rushYards: -3,
      pprPointsTotal: 280.8,
      pprPointsPerGame: 16.5,
    },
    week8_2024: {
      opponent: 'TB',
      opponentRank: 21,
      gameLine: 'ATL -0.5 · O/U 47.5 @ TB',
      gameTotal: '47.5',
      kickoff: 'Sun 1pm',
      receptions: 4,
      recYards: 34,
      recTDs: 0,
      pprPoints: 7.4,
    },
    last4_2024: [
      { week: 4, opponent: 'NO', pts: 12.4 },
      { week: 5, opponent: 'TB', pts: 33.4 },
      { week: 6, opponent: 'CAR', pts: 19.4 },
      { week: 7, opponent: 'SEA', pts: 18.3 },
    ],
  },
  't-mclaurin': {
    slug: 't-mclaurin',
    fullName: 'Terry McLaurin',
    displayName: 'T. McLaurin',
    position: 'WR',
    team: 'WAS',
    byeWeek2024: 14,
    jerseyNumber: '17',
    espnId: '3121422',
    headshotUrl: `${HEADSHOT_BASE}/3121422.png`,
    season2024: {
      gamesPlayed: 17,
      receptions: 82,
      recYards: 1096,
      recTDs: 13,
      rushYards: 2,
      pprPointsTotal: 267.8,
      pprPointsPerGame: 15.8,
    },
    week8_2024: {
      opponent: 'CHI',
      opponentRank: 6,
      gameLine: 'WSH -1.5 · O/U 46.5 vs CHI',
      gameTotal: '46.5',
      kickoff: 'Sun 4:25pm',
      receptions: 5,
      recYards: 125,
      recTDs: 0,
      pprPoints: 17.5,
    },
    last4_2024: [
      { week: 4, opponent: 'ARI', pts: 18.2 },
      { week: 5, opponent: 'CLE', pts: 13.4 },
      { week: 6, opponent: 'BAL', pts: 23.3 },
      { week: 7, opponent: 'CAR', pts: 15.8 },
    ],
  },
  'd-smith': {
    slug: 'd-smith',
    fullName: 'DeVonta Smith',
    displayName: 'D. Smith',
    position: 'WR',
    team: 'PHI',
    byeWeek2024: 5,
    jerseyNumber: '6',
    espnId: '4241478',
    headshotUrl: `${HEADSHOT_BASE}/4241478.png`,
    season2024: {
      gamesPlayed: 13,
      receptions: 68,
      recYards: 833,
      recTDs: 8,
      rushYards: 1,
      pprPointsTotal: 199.4,
      pprPointsPerGame: 15.3,
    },
    week8_2024: {
      opponent: 'CIN',
      opponentRank: 20,
      gameLine: 'PHI +2.5 · O/U 47.5 @ CIN',
      gameTotal: '47.5',
      kickoff: 'Sun 1pm',
      receptions: 6,
      recYards: 85,
      recTDs: 1,
      pprPoints: 20.5,
    },
    last4_2024: [
      { week: 4, opponent: 'BYE', pts: 0 },
      { week: 5, opponent: 'BYE', pts: 0 },
      { week: 6, opponent: 'CLE', pts: 15.4 },
      { week: 7, opponent: 'NYG', pts: 0.8 },
    ],
  },
  't-kelce': {
    slug: 't-kelce',
    fullName: 'Travis Kelce',
    displayName: 'T. Kelce',
    position: 'TE',
    team: 'KC',
    byeWeek2024: 6,
    jerseyNumber: '87',
    espnId: '15847',
    headshotUrl: `${HEADSHOT_BASE}/15847.png`,
    season2024: {
      gamesPlayed: 16,
      receptions: 97,
      recYards: 823,
      recTDs: 3,
      rushYards: 1,
      pprPointsTotal: 195.4,
      pprPointsPerGame: 12.2,
    },
    week8_2024: {
      opponent: 'LV',
      opponentRank: 19,
      gameLine: 'KC -8.5 · O/U 42.5 @ LV',
      gameTotal: '42.5',
      kickoff: 'Sun 4:25pm',
      receptions: 10,
      recYards: 90,
      recTDs: 1,
      pprPoints: 25.0,
    },
    last4_2024: [
      { week: 4, opponent: 'LAC', pts: 15.9 },
      { week: 5, opponent: 'NO', pts: 16.0 },
      { week: 6, opponent: 'BYE', pts: 0 },
      { week: 7, opponent: 'SF', pts: 5.7 },
    ],
  },
  'b-bowers': {
    slug: 'b-bowers',
    fullName: 'Brock Bowers',
    displayName: 'B. Bowers',
    position: 'TE',
    team: 'LV',
    byeWeek2024: 10,
    jerseyNumber: '89',
    espnId: '4432665',
    headshotUrl: `${HEADSHOT_BASE}/4432665.png`,
    season2024: {
      gamesPlayed: 17,
      receptions: 112,
      recYards: 1194,
      recTDs: 5,
      rushYards: 13,
      pprPointsTotal: 262.7,
      pprPointsPerGame: 15.5,
    },
    week8_2024: {
      opponent: 'KC',
      opponentRank: 10,
      gameLine: 'LV +8.5 · O/U 42.5 vs KC',
      gameTotal: '42.5',
      kickoff: 'Sun 4:25pm',
      receptions: 5,
      recYards: 58,
      recTDs: 0,
      pprPoints: 10.8,
    },
    last4_2024: [
      { week: 4, opponent: 'CLE', pts: 5.1 },
      { week: 5, opponent: 'DEN', pts: 23.7 },
      { week: 6, opponent: 'PIT', pts: 16.1 },
      { week: 7, opponent: 'LA', pts: 19.3 },
    ],
  },
  't-mcbride': {
    slug: 't-mcbride',
    fullName: 'Trey McBride',
    displayName: 'T. McBride',
    position: 'TE',
    team: 'ARI',
    byeWeek2024: 11,
    jerseyNumber: '85',
    espnId: '4361307',
    headshotUrl: `${HEADSHOT_BASE}/4361307.png`,
    season2024: {
      gamesPlayed: 16,
      receptions: 111,
      recYards: 1146,
      recTDs: 2,
      rushYards: 2,
      rushTDs: 1,
      pprPointsTotal: 243.8,
      pprPointsPerGame: 15.2,
    },
    week8_2024: {
      opponent: 'MIA',
      opponentRank: 18,
      gameLine: 'ARI +4.5 · O/U 46.5 @ MIA',
      gameTotal: '46.5',
      kickoff: 'Sun 1pm',
      receptions: 9,
      recYards: 124,
      recTDs: 0,
      pprPoints: 21.4,
    },
    last4_2024: [
      { week: 4, opponent: 'BYE', pts: 0 },
      { week: 5, opponent: 'SF', pts: 11.3 },
      { week: 6, opponent: 'GB', pts: 17.6 },
      { week: 7, opponent: 'LAC', pts: 10.1 },
    ],
  },
  'b-aubrey': {
    slug: 'b-aubrey',
    fullName: 'Brandon Aubrey',
    displayName: 'B. Aubrey',
    position: 'K',
    team: 'DAL',
    byeWeek2024: 7,
    jerseyNumber: '17',
    espnId: '3953687',
    headshotUrl: `${HEADSHOT_BASE}/3953687.png`,
    season2024: {
      gamesPlayed: 17,
      fgMade: 40,
      fgAttempts: 47,
      longest: 65,
      xpMade: 30,
      xpAttempts: 30,
      pprPointsTotal: 150,
      pprPointsPerGame: 8.8,
    },
    week8_2024: {
      opponent: 'SF',
      opponentRank: 8,
      gameLine: 'DAL @ SF · Final 24-30',
      gameTotal: '54',
      kickoff: 'Sun 8:20pm',
      fgMade: 1,
      fgAttempts: 1,
      longest: 29,
      xpMade: 3,
      xpAttempts: 3,
      pprPoints: 6.0,
    },
    last4_2024: [
      { week: 4, opponent: 'NYG', pts: 8 },
      { week: 5, opponent: 'PIT', pts: 8 },
      { week: 6, opponent: 'DET', pts: 9 },
      { week: 7, opponent: 'BYE', pts: 0 },
    ],
  },
  'k-fairbairn': {
    slug: 'k-fairbairn',
    fullName: "Ka'imi Fairbairn",
    displayName: 'K. Fairbairn',
    position: 'K',
    team: 'HOU',
    byeWeek2024: 14,
    jerseyNumber: '15',
    espnId: '2971573',
    headshotUrl: `${HEADSHOT_BASE}/2971573.png`,
    season2024: {
      gamesPlayed: 17,
      fgMade: 36,
      fgAttempts: 42,
      longest: 59,
      xpMade: 34,
      xpAttempts: 36,
      pprPointsTotal: 142,
      pprPointsPerGame: 8.4,
    },
    week8_2024: {
      opponent: 'IND',
      opponentRank: 24,
      gameLine: 'HOU -4.5 · O/U 45.5 vs IND',
      gameTotal: '45.5',
      kickoff: 'Sun 1pm',
      fgMade: 3,
      fgAttempts: 3,
      longest: 35,
      xpMade: 2,
      xpAttempts: 2,
      pprPoints: 11.0,
    },
    last4_2024: [
      { week: 4, opponent: 'JAX', pts: 6 },
      { week: 5, opponent: 'BUF', pts: 11 },
      { week: 6, opponent: 'NE', pts: 11 },
      { week: 7, opponent: 'GB', pts: 10 },
    ],
  },
  'phi-def': {
    slug: 'phi-def',
    fullName: 'Philadelphia Eagles',
    displayName: 'Eagles D/ST',
    position: 'DEF',
    team: 'PHI',
    byeWeek2024: 5,
    espnId: null,
    headshotUrl: `${TEAM_LOGO_BASE}/phi.png`,
    season2024: {
      gamesPlayed: 17,
      sacks: 41,
      ints: 13,
      fumblesRecovered: 8,
      defTDs: 0,
      pointsAllowedAvg: 17.8,
      pprPointsTotal: 126,
      pprPointsPerGame: 7.4,
    },
    week8_2024: {
      opponent: 'CIN',
      opponentRank: 7,
      gameLine: 'PHI +2.5 · O/U 47.5 @ CIN',
      gameTotal: '47.5',
      kickoff: 'Sun 1pm',
      sacks: 1,
      ints: 1,
      fumblesRecovered: 1,
      defTDs: 0,
      pointsAllowed: 17,
      pprPoints: 6.0,
    },
    last4_2024: [
      { week: 4, opponent: 'TB', pts: 0 },
      { week: 5, opponent: 'BYE', pts: 0 },
      { week: 6, opponent: 'CLE', pts: 10 },
      { week: 7, opponent: 'NYG', pts: 14 },
    ],
  },
  'sf-def': {
    slug: 'sf-def',
    fullName: 'San Francisco 49ers',
    displayName: '49ers D/ST',
    position: 'DEF',
    team: 'SF',
    byeWeek2024: 9,
    espnId: null,
    headshotUrl: `${TEAM_LOGO_BASE}/sf.png`,
    season2024: {
      gamesPlayed: 17,
      sacks: 37,
      ints: 11,
      fumblesRecovered: 10,
      defTDs: 0,
      pointsAllowedAvg: 25.6,
      pprPointsTotal: 93,
      pprPointsPerGame: 5.5,
    },
    week8_2024: {
      opponent: 'DAL',
      opponentRank: 13,
      gameLine: 'SF vs DAL · Final 30-24',
      gameTotal: '54',
      kickoff: 'Sun 8:20pm',
      sacks: 2,
      ints: 2,
      fumblesRecovered: 0,
      defTDs: 0,
      pointsAllowed: 24,
      pprPoints: 6.0,
    },
    last4_2024: [
      { week: 4, opponent: 'NE', pts: 17 },
      { week: 5, opponent: 'ARI', pts: 3 },
      { week: 6, opponent: 'SEA', pts: 9 },
      { week: 7, opponent: 'KC', pts: 3 },
    ],
  },
  'min-def': {
    slug: 'min-def',
    fullName: 'Minnesota Vikings',
    displayName: 'Vikings D/ST',
    position: 'DEF',
    team: 'MIN',
    byeWeek2024: 6,
    espnId: null,
    headshotUrl: `${TEAM_LOGO_BASE}/min.png`,
    season2024: {
      gamesPlayed: 17,
      sacks: 49,
      ints: 24,
      fumblesRecovered: 9,
      defTDs: 3,
      pointsAllowedAvg: 19.5,
      pprPointsTotal: 160,
      pprPointsPerGame: 9.4,
    },
    week8_2024: {
      opponent: 'LA',
      opponentRank: 11,
      gameLine: 'MIN -2.5 · O/U 46.5 @ LAR',
      gameTotal: '46.5',
      kickoff: 'Thu 8:15pm',
      sacks: 0,
      ints: 1,
      fumblesRecovered: 0,
      defTDs: 0,
      pointsAllowed: 30,
      pprPoints: 1.0,
    },
    last4_2024: [
      { week: 4, opponent: 'GB', pts: 5 },
      { week: 5, opponent: 'NYJ', pts: 14 },
      { week: 6, opponent: 'BYE', pts: 0 },
      { week: 7, opponent: 'DET', pts: 3 },
    ],
  },
} satisfies Record<string, PlayerManifestEntry>;

export type PlayerSlug = keyof typeof PLAYER_MANIFEST;

const PLAYER_MANIFEST_LOOKUP = PLAYER_MANIFEST as Record<string, PlayerManifestEntry>;

export function getPlayerManifestEntry(slug: string) {
  return PLAYER_MANIFEST_LOOKUP[slug] ?? null;
}

export function getManifestHeadshotUrl(slug: string) {
  return getPlayerManifestEntry(slug)?.headshotUrl ?? '';
}

export function getManifestInitials(slug: string, fallbackName = '') {
  const entry = getPlayerManifestEntry(slug);
  const source = entry?.displayName ?? fallbackName;

  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('');
}

export function getWeek8ReplayProjection(slug: string) {
  return getPlayerManifestEntry(slug)?.week8_2024.pprPoints ?? 0;
}

export function getWeek8ReplayGameLine(slug: string) {
  return getPlayerManifestEntry(slug)?.week8_2024.gameLine ?? '2024 line unavailable';
}

export function getWeek8ReplayFloor(slug: string) {
  const entry = getPlayerManifestEntry(slug);
  const scores = [
    ...(entry?.last4_2024.map((game) => game.pts).filter((points) => points > 0) ?? []),
    entry?.week8_2024.pprPoints ?? 0,
  ].filter((points) => points > 0);

  return scores.length > 0 ? Math.min(...scores) : 0;
}

export function getWeek8ReplayCeiling(slug: string) {
  const entry = getPlayerManifestEntry(slug);
  const scores = [
    ...(entry?.last4_2024.map((game) => game.pts).filter((points) => points > 0) ?? []),
    entry?.week8_2024.pprPoints ?? 0,
  ].filter((points) => points > 0);

  return scores.length > 0 ? Math.max(...scores) : 0;
}

export function playerFromManifest(slug: PlayerSlug): Player {
  const entry: PlayerManifestEntry = PLAYER_MANIFEST[slug];

  return {
    id: entry.slug,
    slug: entry.slug,
    name: entry.fullName,
    shortName: entry.displayName,
    position: entry.position,
    team: entry.team,
    headshotUrl: entry.headshotUrl,
    teamLogoUrl: `${TEAM_LOGO_BASE}/${TEAM_LOGO_SLUGS[entry.team] ?? entry.team.toLowerCase()}.png`,
    bye: entry.byeWeek2024,
    isActive: true,
    jerseyNumber: entry.jerseyNumber,
  };
}
