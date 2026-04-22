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

function replayProjection(slug: PlayerSlug) {
  return PLAYER_MANIFEST[slug].season2024.pprPointsPerGame;
}

function tradePlayer(
  slug: PlayerSlug,
  positionRank: string,
  rostered: TradeTargetPlayer['rostered'],
): TradeTargetPlayer {
  const player = PLAYER_MANIFEST[slug];

  return {
    slug,
    name: player.displayName,
    position: player.position,
    team: player.team,
    projection: replayProjection(slug),
    positionRank,
    rostered,
  };
}

function packagePlayer(slug: PlayerSlug): SuggestedPackagePlayer {
  const player = PLAYER_MANIFEST[slug];

  return {
    slug,
    name: player.displayName,
    position: player.position,
    team: player.team,
    projection: replayProjection(slug),
  };
}

export const MOCK_TRADE_TARGET_GROUPS: TradeTargetGroup[] = [
  {
    userNeed: {
      position: 'QB',
      severity: 'critical',
      summary: 'Mahomes was QB11 by 2024 PPG',
      reason:
        'The 2024 replay has Mahomes as a steady starter, but Lamar and Allen created a real weekly edge.',
    },
    targets: [
      {
        id: 'lamar-jackson',
        teamName: 'Apollo Archers',
        record: '7-0',
        championshipOdds: 240,
        playoffProb: 96.2,
        player: tradePlayer('l-jackson', 'QB1', 'starter'),
        theirNeed: 'WR',
        tradeLine: 'They need WR — Lamb gives them a weekly ceiling piece.',
        fitScore: 94,
        suggestedPackage: {
          youSend: [
            packagePlayer('c-lamb'),
          ],
          youReceive: [
            packagePlayer('l-jackson'),
          ],
          weeklyImpact: { before: -260, after: -295, delta: -35 },
          weeklyWinProbDelta: 2.8,
          playoffProbBefore: 72.4,
          playoffProbAfter: 75.0,
          playoffProbDelta: 2.6,
          championshipOddsBefore: 450,
          championshipOddsAfter: 390,
        },
      },
      {
        id: 'josh-allen',
        teamName: 'Hermes Express',
        record: '4-3',
        championshipOdds: 420,
        playoffProb: 76.8,
        player: tradePlayer('j-allen', 'QB2', 'starter'),
        theirNeed: 'RB',
        tradeLine: 'They need RB — Barkley is the cleanest match.',
        fitScore: 88,
        suggestedPackage: {
          youSend: [
            packagePlayer('s-barkley'),
          ],
          youReceive: [
            packagePlayer('j-allen'),
          ],
          weeklyImpact: { before: -260, after: -275, delta: -15 },
          weeklyWinProbDelta: 1.3,
          playoffProbBefore: 72.4,
          playoffProbAfter: 73.7,
          playoffProbDelta: 1.3,
          championshipOddsBefore: 450,
          championshipOddsAfter: 425,
        },
      },
    ],
  },
  {
    userNeed: {
      position: 'RB',
      severity: 'moderate',
      summary: 'Week 8 bench RB production is thin',
      reason:
        'Barkley was elite for the season, but his Week 8 replay score left the bench without a second RB lever.',
    },
    targets: [
      {
        id: 'josh-jacobs',
        teamName: 'Hermes Express',
        record: '4-3',
        championshipOdds: 420,
        playoffProb: 76.8,
        player: tradePlayer('j-jacobs', 'RB8', 'bench'),
        theirNeed: 'WR',
        tradeLine: 'They need WR — Smith gives them a Week 8 spike option.',
        fitScore: 86,
        suggestedPackage: {
          youSend: [
            packagePlayer('d-smith'),
          ],
          youReceive: [
            packagePlayer('j-jacobs'),
          ],
          weeklyImpact: { before: -260, after: -286, delta: -26 },
          weeklyWinProbDelta: 2.2,
          playoffProbBefore: 72.4,
          playoffProbAfter: 74.6,
          playoffProbDelta: 2.2,
          championshipOddsBefore: 450,
          championshipOddsAfter: 405,
        },
      },
      {
        id: 'jahmyr-gibbs',
        teamName: 'Poseidon Waves',
        record: '5-2',
        championshipOdds: 520,
        playoffProb: 68.1,
        player: tradePlayer('j-gibbs', 'RB2', 'starter'),
        theirNeed: 'TE',
        tradeLine: 'They need TE — McBride is a real positional fit.',
        fitScore: 79,
        suggestedPackage: {
          youSend: [
            packagePlayer('t-mcbride'),
          ],
          youReceive: [
            packagePlayer('j-gibbs'),
          ],
          weeklyImpact: { before: -260, after: -268, delta: -8 },
          weeklyWinProbDelta: 0.7,
          playoffProbBefore: 72.4,
          playoffProbAfter: 73.1,
          playoffProbDelta: 0.7,
          championshipOddsBefore: 450,
          championshipOddsAfter: 438,
        },
      },
    ],
  },
];
