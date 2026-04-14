export interface WaiverSuggestion {
  player: {
    name: string;
    position: string;
    team: string;
  };
  context: string;
  projectedDelta: number;
}

export interface LineupLockWindow {
  day: string;
  time: string;
  players: string[];
  game: string;
}

export const MOCK_WAIVER_SUGGESTION: WaiverSuggestion = {
  player: {
    name: 'J. Addison',
    position: 'WR',
    team: 'MIN',
  },
  context: 'Could upgrade your FLEX if McLaurin underperforms.',
  projectedDelta: 1.4,
};

export const MOCK_LINEUP_LOCKS: LineupLockWindow[] = [
  {
    day: 'Thursday',
    time: '8:00 PM ET',
    players: ['P. Mahomes'],
    game: 'KC @ DEN',
  },
  {
    day: 'Sunday',
    time: '1:00 PM ET',
    players: ['All others'],
    game: 'Multiple',
  },
];
