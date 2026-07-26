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

export interface HistogramBin {
  /** Bin center. */
  x: number;
  /** Probability density (bar areas sum to 1). */
  density: number;
}

export interface DensityHistogram {
  min: number;
  max: number;
  mean: number;
  binWidth: number;
  bins: HistogramBin[];
}

/** The three matchup distributions from the user's perspective, from the same
 *  seeded sim that produces the displayed win%. */
export interface MatchupHistograms {
  sims: number;
  /** Exact win probability from the (recentered) samples — matches the line. */
  winProb: number;
  you: DensityHistogram;
  opponent: DensityHistogram;
  margin: DensityHistogram;
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
  histograms?: MatchupHistograms | null;
}

export interface TeamMatchupData {
  managerKey?: string | null;
  teamName: string;
  managerName: string;
  record: string;
  /** Sleeper team avatar (the league's "team logo"), proxied. */
  avatarUrl?: string | null;
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
