import { MOCK_PLAYERS } from './players';

export interface TradeNeed {
  position: string;
  severity: 'critical' | 'moderate';
  summary: string;
  reason: string;
}

export interface TradeTargetPlayer {
  name: string;
  position: string;
  team: string;
  projection: number;
  positionRank: string;
  rostered: 'starter' | 'bench';
  headshotUrl: string;
}

export interface SuggestedPackagePlayer {
  name: string;
  position: string;
  team: string;
  projection: number;
  headshotUrl: string;
}

export interface SuggestedPackage {
  youSend: SuggestedPackagePlayer[];
  youReceive: SuggestedPackagePlayer[];
  weeklyImpact: {
    before: number;
    after: number;
    delta: number;
  };
  weeklyWinProbDelta: number;
  playoffProbBefore: number;
  playoffProbAfter: number;
  playoffProbDelta: number;
  championshipOddsBefore: number;
  championshipOddsAfter: number;
}

export interface TradeTarget {
  id: string;
  teamName: string;
  record: string;
  championshipOdds: number;
  playoffProb: number;
  player: TradeTargetPlayer;
  theirNeed: string;
  tradeLine: string;
  fitScore: number;
  suggestedPackage: SuggestedPackage;
}

export interface TradeTargetGroup {
  userNeed: TradeNeed;
  targets: TradeTarget[];
}

export const MOCK_TRADE_TARGET_GROUPS: TradeTargetGroup[] = [
  {
    userNeed: {
      position: 'RB',
      severity: 'critical',
      summary: 'Zero bench depth behind your starters',
      reason:
        "You're starting Derrick Henry and Bijan Robinson with zero bench RB depth. One injury away from the wire changes your whole week.",
    },
    targets: [
      {
        id: 'jacobs',
        teamName: 'Hermes Express',
        record: '4-3',
        championshipOdds: 340,
        playoffProb: 84.6,
        player: {
          name: 'J. Jacobs',
          position: 'RB',
          team: 'GB',
          projection: 14.8,
          positionRank: 'RB11',
          rostered: 'bench',
          headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png',
        },
        theirNeed: 'WR',
        tradeLine: 'They need WR — you have Smith and Waddle.',
        fitScore: 92,
        suggestedPackage: {
          youSend: [
            {
              name: 'D. Smith',
              position: 'WR',
              team: 'PHI',
              projection: 13.6,
              headshotUrl: MOCK_PLAYERS.smith.headshotUrl,
            },
          ],
          youReceive: [
            {
              name: 'J. Jacobs',
              position: 'RB',
              team: 'GB',
              projection: 14.8,
              headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png',
            },
          ],
          weeklyImpact: { before: -220, after: -240, delta: -20 },
          weeklyWinProbDelta: 1.8,
          playoffProbBefore: 72.4,
          playoffProbAfter: 74.1,
          playoffProbDelta: 1.7,
          championshipOddsBefore: 450,
          championshipOddsAfter: 420,
        },
      },
      {
        id: 'stevenson',
        teamName: 'Hermes Express',
        record: '4-3',
        championshipOdds: 340,
        playoffProb: 84.6,
        player: {
          name: 'R. Stevenson',
          position: 'RB',
          team: 'NE',
          projection: 12.2,
          positionRank: 'RB18',
          rostered: 'bench',
          headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4361411.png',
        },
        theirNeed: 'WR',
        tradeLine: 'They need WR — you have Smith and Waddle.',
        fitScore: 92,
        suggestedPackage: {
          youSend: [
            {
              name: 'J. Waddle',
              position: 'WR',
              team: 'MIA',
              projection: 14.2,
              headshotUrl: MOCK_PLAYERS.waddle.headshotUrl,
            },
          ],
          youReceive: [
            {
              name: 'R. Stevenson',
              position: 'RB',
              team: 'NE',
              projection: 12.2,
              headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4361411.png',
            },
          ],
          weeklyImpact: { before: -220, after: -232, delta: -12 },
          weeklyWinProbDelta: 1.1,
          playoffProbBefore: 72.4,
          playoffProbAfter: 73.5,
          playoffProbDelta: 1.1,
          championshipOddsBefore: 450,
          championshipOddsAfter: 430,
        },
      },
      {
        id: 'ekeler',
        teamName: 'Hades Hounds',
        record: '3-4',
        championshipOdds: 680,
        playoffProb: 52.3,
        player: {
          name: 'A. Ekeler',
          position: 'RB',
          team: 'WAS',
          projection: 13.1,
          positionRank: 'RB15',
          rostered: 'bench',
          headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3068267.png',
        },
        theirNeed: 'TE',
        tradeLine: 'They need TE — Goedert is a clean match.',
        fitScore: 78,
        suggestedPackage: {
          youSend: [
            {
              name: 'D. Goedert',
              position: 'TE',
              team: 'PHI',
              projection: 9.8,
              headshotUrl: MOCK_PLAYERS.goedert.headshotUrl,
            },
          ],
          youReceive: [
            {
              name: 'A. Ekeler',
              position: 'RB',
              team: 'WAS',
              projection: 13.1,
              headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3068267.png',
            },
          ],
          weeklyImpact: { before: -220, after: -230, delta: -10 },
          weeklyWinProbDelta: 0.9,
          playoffProbBefore: 72.4,
          playoffProbAfter: 73.6,
          playoffProbDelta: 1.2,
          championshipOddsBefore: 450,
          championshipOddsAfter: 435,
        },
      },
    ],
  },
  {
    userNeed: {
      position: 'TE',
      severity: 'moderate',
      summary: 'No backup behind Kelce',
      reason:
        "Kelce is your only TE. If he misses time or you need a bye-week patch, you have no second lever to pull.",
    },
    targets: [
      {
        id: 'njoku',
        teamName: 'Poseidon Waves',
        record: '5-2',
        championshipOdds: 520,
        playoffProb: 68.1,
        player: {
          name: 'D. Njoku',
          position: 'TE',
          team: 'CLE',
          projection: 10.4,
          positionRank: 'TE8',
          rostered: 'bench',
          headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3052587.png',
        },
        theirNeed: 'QB',
        tradeLine: 'They need QB — Prescott gives them a real upgrade.',
        fitScore: 85,
        suggestedPackage: {
          youSend: [
            {
              name: 'D. Prescott',
              position: 'QB',
              team: 'DAL',
              projection: 18.2,
              headshotUrl: MOCK_PLAYERS.prescott.headshotUrl,
            },
          ],
          youReceive: [
            {
              name: 'D. Njoku',
              position: 'TE',
              team: 'CLE',
              projection: 10.4,
              headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3052587.png',
            },
          ],
          weeklyImpact: { before: -220, after: -215, delta: 5 },
          weeklyWinProbDelta: -0.4,
          playoffProbBefore: 72.4,
          playoffProbAfter: 73.2,
          playoffProbDelta: 0.8,
          championshipOddsBefore: 450,
          championshipOddsAfter: 440,
        },
      },
    ],
  },
];
