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
    name: 'A. St. Brown',
    position: 'WR',
    team: 'DET',
  },
  context: 'Week 8 was quiet, but his 2024 volume profile keeps him on the watch list.',
  projectedDelta: 1.2,
};

export const MOCK_LINEUP_LOCKS: LineupLockWindow[] = [
  {
    day: 'Thursday',
    time: '8:15 PM ET',
    players: ['J. Jefferson'],
    game: 'MIN @ LAR',
  },
  {
    day: 'Sunday',
    time: '1:00 PM ET',
    players: ['All others'],
    game: 'Multiple',
  },
];
