import type { Player } from './player';

export interface RankingPrompt {
  sessionId: string;
  players: Player[];
  isTestQuestion: boolean;
}

export interface RankingSubmission {
  sessionId: string;
  rankedPlayerIds: string[];
  submittedAt: string;
}

export interface ConsensusRanking {
  rank: number;
  player: Player;
  eloRating: number;
  tier: string;
  positionRank: number;
  trend: 'up' | 'down' | 'stable';
  trendDelta: number;
}
