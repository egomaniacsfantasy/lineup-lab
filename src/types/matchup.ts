import type { Player, SlotLabel } from './player';

export type ScoringFormat = 'standard' | 'ppr' | 'half-ppr';

export type OddsFormat = 'american' | 'implied';

export interface MatchupLine {
  moneyline: number;
  winProbability: number;
  projection: number;
  spread: number;
  total: number;
}

export interface MatchupData {
  week: number;
  scoringFormat: ScoringFormat;
  yourTeam: TeamMatchupData;
  opponentTeam: TeamMatchupData;
  baseline: {
    yours: MatchupLine;
    opponent: MatchupLine;
  };
}

export interface TeamMatchupData {
  teamName: string;
  managerName: string;
  record: string;
  roster: RosterSlot[];
  bench?: BenchPlayer[];
}

export interface BenchPlayer {
  player: Player;
  projection: number;
}

export interface RosterSlot {
  slotLabel: SlotLabel;
  starter: Player;
  projection: number;
  floor: number;
  ceiling: number;
  isDecisionSlot: boolean;
  alternatives: PlayerAlternative[];
}

export interface PlayerAlternative {
  player: Player;
  projection: number;
  floor: number;
  ceiling: number;
  resultingLine: MatchupLine;
  deltaWinProbability: number;
  gameLine: string;
  playerProp?: string;
}
