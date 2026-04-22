import type { ConsensusRanking, RankingPrompt } from '../types';
import { MOCK_PLAYERS } from './players';

const p = MOCK_PLAYERS;

export const MOCK_RANKING_PROMPT: RankingPrompt = {
  sessionId: 'mock-2024-replay-session-001',
  players: [p.chase, p.barkley, p.gibbs, p.jefferson, p.lamb],
  isTestQuestion: false,
};

export const MOCK_CONSENSUS_RANKINGS: ConsensusRanking[] = [
  {
    rank: 1,
    player: p.chase,
    eloRating: 2910,
    tier: 'Elite',
    positionRank: 1,
    trend: 'stable',
    trendDelta: 0,
  },
  {
    rank: 2,
    player: p.barkley,
    eloRating: 2860,
    tier: 'Elite',
    positionRank: 1,
    trend: 'up',
    trendDelta: 2,
  },
  {
    rank: 3,
    player: p.gibbs,
    eloRating: 2815,
    tier: 'Elite',
    positionRank: 2,
    trend: 'up',
    trendDelta: 1,
  },
  {
    rank: 4,
    player: p.robinson,
    eloRating: 2790,
    tier: 'Elite',
    positionRank: 3,
    trend: 'stable',
    trendDelta: 0,
  },
  {
    rank: 5,
    player: p.henry,
    eloRating: 2765,
    tier: 'Elite',
    positionRank: 4,
    trend: 'stable',
    trendDelta: 0,
  },
  {
    rank: 6,
    player: p.nacua,
    eloRating: 2730,
    tier: 'Elite',
    positionRank: 2,
    trend: 'up',
    trendDelta: 4,
  },
  {
    rank: 7,
    player: p.jefferson,
    eloRating: 2720,
    tier: 'Elite',
    positionRank: 3,
    trend: 'stable',
    trendDelta: 0,
  },
  {
    rank: 8,
    player: p.lamar,
    eloRating: 2690,
    tier: 'Elite',
    positionRank: 1,
    trend: 'up',
    trendDelta: 3,
  },
  {
    rank: 9,
    player: p.bowers,
    eloRating: 2610,
    tier: 'Starter',
    positionRank: 2,
    trend: 'up',
    trendDelta: 5,
  },
  {
    rank: 10,
    player: p.lamb,
    eloRating: 2580,
    tier: 'Starter',
    positionRank: 7,
    trend: 'down',
    trendDelta: -2,
  },
];
