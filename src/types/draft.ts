import type { Player } from './player';

export type LeagueStyle = 'casual' | 'competitive' | 'shark-tank';

export interface DraftSlotOdds {
  position: number;
  championshipOdds: number;
  winProbability: number;
  projectedRecord: string;
}

export interface DraftSlotResult {
  leagueStyle: LeagueStyle;
  slots: DraftSlotOdds[];
}

export interface PlayerAvailabilityResult {
  player: Player;
  pickNumber: number;
  leagueStyle: LeagueStyle;
  availabilityOdds: number;
  probability: number;
}

export interface DraftWrappedData {
  teamName: string;
  leagueName: string;
  championshipOdds: number;
  projectedRecord: string;
  recordRange: {
    best: string;
    worst: string;
    median: string;
  };
  leagueRank: number;
  boldestPick: {
    player: Player;
    pickNumber: number;
    adpDelta: number;
  };
  toughestMatchup: {
    week: number;
    opponent: string;
    odds: number;
  };
  easiestMatchup: {
    week: number;
    opponent: string;
    odds: number;
  };
  rosterGrade: string;
}
