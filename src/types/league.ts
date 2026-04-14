import type { RosterSlot, ScoringFormat } from './matchup';

export type Platform = 'sleeper' | 'espn';

export interface LeagueConnection {
  platform: Platform;
  leagueId: string;
  leagueName: string;
  teamName: string;
  teamId: string;
  scoringFormat: ScoringFormat;
  rosterPositions: string[];
  totalTeams: number;
  currentWeek: number;
  roster: RosterSlot[];
}

export interface LeagueConnectionStatus {
  isConnected: boolean;
  isLoading: boolean;
  error?: string;
  connection?: LeagueConnection;
}
