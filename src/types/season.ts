export interface SeasonOutlook {
  projectedRecord: {
    wins: number;
    losses: number;
  };
  recordRange: {
    best: string;
    worst: string;
    median: string;
  };
  playoffProbability: number;
  championshipOdds: number;
}

export interface CascadeImpact {
  scenarioLabel: string;
  weeklyWinProb: number;
  weeklyWinDelta: number;
  playoffProb: number;
  playoffDelta: number;
  championshipOdds: number;
  championshipOddsDelta: number;
}

export interface WeeklyMatchupPreview {
  week: number;
  opponent: string;
  opponentRecord: string;
  yourLine: number;
  isHome: boolean;
}
