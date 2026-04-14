import type { ConsensusRanking, RankingPrompt } from '../types';
import { MOCK_PLAYERS } from './players';

const p = MOCK_PLAYERS;

export const MOCK_RANKING_PROMPT: RankingPrompt = {
  sessionId: 'mock-session-001',
  players: [p.adams, p.robinson, p.kelce, p.mclaurin, p.chase],
  isTestQuestion: false,
};

export const MOCK_CONSENSUS_RANKINGS: ConsensusRanking[] = [
  {
    rank: 1,
    player: p.chase,
    eloRating: 2840,
    tier: 'Elite',
    positionRank: 1,
    trend: 'stable',
    trendDelta: 0,
  },
  {
    rank: 2,
    player: p.jefferson,
    eloRating: 2810,
    tier: 'Elite',
    positionRank: 2,
    trend: 'up',
    trendDelta: 2,
  },
  {
    rank: 3,
    player: p.robinson,
    eloRating: 2780,
    tier: 'Elite',
    positionRank: 1,
    trend: 'stable',
    trendDelta: 0,
  },
  {
    rank: 4,
    player: p.henry,
    eloRating: 2690,
    tier: 'Elite',
    positionRank: 2,
    trend: 'down',
    trendDelta: -1,
  },
  {
    rank: 5,
    player: p.kelce,
    eloRating: 2650,
    tier: 'Elite',
    positionRank: 1,
    trend: 'down',
    trendDelta: -2,
  },
  {
    rank: 6,
    player: p.adams,
    eloRating: 2580,
    tier: 'Starter',
    positionRank: 3,
    trend: 'up',
    trendDelta: 3,
  },
  {
    rank: 7,
    player: p.mahomes,
    eloRating: 2520,
    tier: 'Starter',
    positionRank: 1,
    trend: 'stable',
    trendDelta: 0,
  },
  {
    rank: 8,
    player: p.mclaurin,
    eloRating: 2460,
    tier: 'Starter',
    positionRank: 4,
    trend: 'up',
    trendDelta: 5,
  },
  {
    rank: 9,
    player: p.waddle,
    eloRating: 2380,
    tier: 'Starter',
    positionRank: 5,
    trend: 'down',
    trendDelta: -3,
  },
  {
    rank: 10,
    player: p.kirk,
    eloRating: 2240,
    tier: 'Depth',
    positionRank: 6,
    trend: 'stable',
    trendDelta: 0,
  },
];
