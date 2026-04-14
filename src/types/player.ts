export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';

export type SlotLabel =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'FLEX'
  | 'K'
  | 'DEF'
  | 'BENCH';

export interface Player {
  id: string;
  name: string;
  shortName: string;
  position: Position;
  team: string;
  headshotUrl: string;
  teamLogoUrl: string;
  bye: number;
  isActive: boolean;
  injuryStatus?: string;
}
