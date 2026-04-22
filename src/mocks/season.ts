import type {
  CascadeImpact,
  SeasonOutlook,
  WeeklyMatchupPreview,
} from '../types';

export interface SeasonScheduleRow extends WeeklyMatchupPreview {
  status: 'projected' | 'live' | 'bye' | 'win' | 'loss';
  score?: string;
}

export interface WeeklyTrajectoryPoint {
  week: number;
  championshipOdds: number;
  playoffProb: number;
}

export const MOCK_SEASON_OUTLOOK: SeasonOutlook = {
  projectedRecord: { wins: 9, losses: 5 },
  recordRange: { best: '12-2', worst: '6-8', median: '9-5' },
  playoffProbability: 72.4,
  championshipOdds: 450,
};

export const MOCK_CASCADE_SCENARIOS: CascadeImpact[] = [
  {
    scenarioLabel: 'Start McLaurin',
    weeklyWinProb: 72.2,
    weeklyWinDelta: 0,
    playoffProb: 72.4,
    playoffDelta: 0,
    championshipOdds: 450,
    championshipOddsDelta: 0,
  },
  {
    scenarioLabel: 'Start Smith',
    weeklyWinProb: 75.2,
    weeklyWinDelta: 3.0,
    playoffProb: 73.6,
    playoffDelta: 1.2,
    championshipOdds: 420,
    championshipOddsDelta: -30,
  },
];

export const MOCK_SCHEDULE_PREVIEW: WeeklyMatchupPreview[] = [
  {
    week: 8,
    opponent: 'Hermes Express',
    opponentRecord: '4-3',
    yourLine: -260,
    isHome: true,
  },
  {
    week: 9,
    opponent: 'Apollo Archers',
    opponentRecord: '7-0',
    yourLine: 150,
    isHome: false,
  },
  {
    week: 10,
    opponent: 'BYE',
    opponentRecord: '',
    yourLine: 0,
    isHome: false,
  },
  {
    week: 11,
    opponent: 'Hades Hounds',
    opponentRecord: '4-3',
    yourLine: -310,
    isHome: true,
  },
  {
    week: 12,
    opponent: 'Poseidon Waves',
    opponentRecord: '5-2',
    yourLine: -120,
    isHome: false,
  },
];

export const MOCK_INSEASON_SCHEDULE: SeasonScheduleRow[] = [
  {
    week: 5,
    opponent: 'Athena Owls',
    opponentRecord: '4-3',
    yourLine: 0,
    isHome: true,
    status: 'win',
    score: '141.8 - 126.9',
  },
  {
    week: 6,
    opponent: 'Dionysus Vines',
    opponentRecord: '3-4',
    yourLine: 0,
    isHome: false,
    status: 'loss',
    score: '118.6 - 127.3',
  },
  {
    week: 7,
    opponent: 'Apollo Archers',
    opponentRecord: '7-0',
    yourLine: 0,
    isHome: true,
    status: 'win',
    score: '136.4 - 132.1',
  },
  {
    week: 8,
    opponent: 'Hermes Express',
    opponentRecord: '4-3',
    yourLine: -260,
    isHome: true,
    status: 'live',
  },
  {
    week: 9,
    opponent: 'Apollo Archers',
    opponentRecord: '7-0',
    yourLine: 150,
    isHome: false,
    status: 'projected',
  },
  {
    week: 10,
    opponent: 'BYE',
    opponentRecord: '',
    yourLine: 0,
    isHome: false,
    status: 'bye',
  },
  {
    week: 11,
    opponent: 'Hades Hounds',
    opponentRecord: '4-3',
    yourLine: -310,
    isHome: true,
    status: 'projected',
  },
  {
    week: 12,
    opponent: 'Poseidon Waves',
    opponentRecord: '5-2',
    yourLine: -120,
    isHome: false,
    status: 'projected',
  },
];

export const MOCK_WEEKLY_TRAJECTORY: WeeklyTrajectoryPoint[] = [
  { week: 1, championshipOdds: 600, playoffProb: 58.2 },
  { week: 2, championshipOdds: 550, playoffProb: 61.4 },
  { week: 3, championshipOdds: 480, playoffProb: 65.1 },
  { week: 4, championshipOdds: 520, playoffProb: 63.8 },
  { week: 5, championshipOdds: 470, playoffProb: 67.2 },
  { week: 6, championshipOdds: 500, playoffProb: 64.5 },
  { week: 7, championshipOdds: 460, playoffProb: 71.1 },
  { week: 8, championshipOdds: 450, playoffProb: 72.4 },
];
