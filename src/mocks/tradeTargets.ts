import type { PlayerSlug } from '../data/playerManifest';
import { PLAYER_MANIFEST } from '../data/playerManifest';

export interface TradeNeed {
  position: string;
  severity: 'critical' | 'moderate';
  summary: string;
  reason: string;
}

export interface TradeTargetPlayer {
  slug: PlayerSlug;
  name: string;
  position: string;
  team: string;
  projection: number;
  positionRank: string;
  rostered: 'starter' | 'bench';
}

export interface SuggestedPackagePlayer {
  slug: PlayerSlug;
  name: string;
  position: string;
  team: string;
  projection: number;
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

function tradePlayer(
  slug: PlayerSlug,
  projection: number,
  positionRank: string,
  rostered: TradeTargetPlayer['rostered'],
): TradeTargetPlayer {
  const player = PLAYER_MANIFEST[slug];

  return {
    slug,
    name: player.displayName,
    position: player.position,
    team: player.team,
    projection,
    positionRank,
    rostered,
  };
}

function packagePlayer(slug: PlayerSlug, projection: number): SuggestedPackagePlayer {
  const player = PLAYER_MANIFEST[slug];

  return {
    slug,
    name: player.displayName,
    position: player.position,
    team: player.team,
    projection,
  };
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
        player: tradePlayer('jacobs-01', 14.8, 'RB11', 'bench'),
        theirNeed: 'WR',
        tradeLine: 'They need WR — you have Smith and Waddle.',
        fitScore: 92,
        suggestedPackage: {
          youSend: [
            packagePlayer('smith-01', 13.6),
          ],
          youReceive: [
            packagePlayer('jacobs-01', 14.8),
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
        player: tradePlayer('stevenson-01', 12.2, 'RB18', 'bench'),
        theirNeed: 'WR',
        tradeLine: 'They need WR — you have Smith and Waddle.',
        fitScore: 92,
        suggestedPackage: {
          youSend: [
            packagePlayer('waddle-01', 14.2),
          ],
          youReceive: [
            packagePlayer('stevenson-01', 12.2),
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
        player: tradePlayer('ekeler-01', 13.1, 'RB15', 'bench'),
        theirNeed: 'TE',
        tradeLine: 'They need TE — Goedert is a clean match.',
        fitScore: 78,
        suggestedPackage: {
          youSend: [
            packagePlayer('goedert-01', 9.8),
          ],
          youReceive: [
            packagePlayer('ekeler-01', 13.1),
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
        player: tradePlayer('njoku-01', 10.4, 'TE8', 'bench'),
        theirNeed: 'QB',
        tradeLine: 'They need QB — Prescott gives them a real upgrade.',
        fitScore: 85,
        suggestedPackage: {
          youSend: [
            packagePlayer('prescott-01', 18.2),
          ],
          youReceive: [
            packagePlayer('njoku-01', 10.4),
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
