import type { MatchupData, MatchupLine, Player, PlayerAlternative, RosterSlot } from '../types';
import {
  getPlayerManifestEntry,
  getWeek8ReplayCeiling,
  getWeek8ReplayFloor,
  getWeek8ReplayGameLine,
  getWeek8ReplayProjection,
} from '../data/playerManifest';
import { roundTo, winProbabilityToMoneyline } from '../utils/lineupComparison';
import { MOCK_PLAYERS } from './players';

const p = MOCK_PLAYERS;

const BASE_PROJECTION = 170.1;
const BASE_WIN_PROBABILITY = 72.2;
const BASE_SPREAD = 26.7;
const BASE_TOTAL = 313.5;

function projection(player: Player) {
  return getWeek8ReplayProjection(player.slug ?? player.id);
}

function floor(player: Player) {
  return getWeek8ReplayFloor(player.slug ?? player.id);
}

function ceiling(player: Player) {
  return getWeek8ReplayCeiling(player.slug ?? player.id);
}

function buildLine(delta: number): MatchupLine {
  const winProbability = roundTo(Math.max(5, Math.min(95, BASE_WIN_PROBABILITY + delta)));

  return {
    moneyline: winProbabilityToMoneyline(winProbability),
    winProbability,
    projection: roundTo(BASE_PROJECTION + delta),
    spread: roundTo(BASE_SPREAD + delta),
    total: roundTo(BASE_TOTAL + delta * 0.25),
  };
}

function actualContext(player: Player) {
  const entry = getPlayerManifestEntry(player.slug ?? player.id);
  const week8 = entry?.week8_2024;

  if (!week8) {
    return `${player.shortName} Week 8 result unavailable`;
  }

  if (player.position === 'QB') {
    return `${player.shortName} Week 8: ${week8.passYards ?? 0} pass yds, ${week8.passTDs ?? 0} TD`;
  }

  if (player.position === 'K') {
    return `${player.shortName} Week 8: ${week8.fgMade ?? 0}-${week8.fgAttempts ?? 0} FG, ${week8.xpMade ?? 0}-${week8.xpAttempts ?? 0} XP`;
  }

  if (player.position === 'DEF') {
    return `${player.shortName} Week 8: ${week8.sacks ?? 0} sacks, ${week8.ints ?? 0} INT, ${week8.pointsAllowed ?? 0} PA`;
  }

  return `${player.shortName} Week 8: ${week8.receptions ?? 0} rec, ${week8.recYards ?? 0} yds, ${week8.recTDs ?? 0} TD`;
}

function alternative(currentPlayer: Player, alternativePlayer: Player): PlayerAlternative {
  const delta = roundTo(projection(alternativePlayer) - projection(currentPlayer));

  return {
    player: alternativePlayer,
    projection: projection(alternativePlayer),
    floor: floor(alternativePlayer),
    ceiling: ceiling(alternativePlayer),
    resultingLine: buildLine(delta),
    deltaWinProbability: delta,
    gameLine: getWeek8ReplayGameLine(alternativePlayer.slug ?? alternativePlayer.id),
    playerProp: actualContext(alternativePlayer),
  };
}

function slot(
  slotLabel: RosterSlot['slotLabel'],
  starter: Player,
  alternatives: Player[] = [],
): RosterSlot {
  return {
    slotLabel,
    starter,
    projection: projection(starter),
    floor: floor(starter),
    ceiling: ceiling(starter),
    isDecisionSlot: alternatives.length > 0,
    alternatives: alternatives.map((candidate) => alternative(starter, candidate)),
  };
}

export const MOCK_YOUR_LINE: MatchupLine = {
  moneyline: -260,
  winProbability: BASE_WIN_PROBABILITY,
  projection: BASE_PROJECTION,
  spread: BASE_SPREAD,
  total: BASE_TOTAL,
};

export const MOCK_OPPONENT_LINE: MatchupLine = {
  moneyline: 210,
  winProbability: roundTo(100 - BASE_WIN_PROBABILITY),
  projection: roundTo(BASE_TOTAL - BASE_PROJECTION),
  spread: roundTo(BASE_SPREAD * -1),
  total: BASE_TOTAL,
};

export const MOCK_MATCHUP: MatchupData = {
  week: 8,
  scoringFormat: 'ppr',
  yourTeam: {
    teamName: "Zeus's Bolts",
    managerName: 'Andre',
    record: '5-2',
    roster: [
      slot('QB', p.mahomes, [p.burrow]),
      slot('RB', p.henry, [p.barkley]),
      slot('RB', p.robinson, [p.barkley]),
      slot('WR', p.jefferson, [p.smith]),
      slot('WR', p.lamb, [p.london]),
      slot('TE', p.kelce, [p.mcbride]),
      slot('FLEX', p.mclaurin, [p.smith, p.london]),
      slot('K', p.aubrey, [p.fairbairn]),
      slot('DEF', p.sf_def, [p.phi_def]),
    ],
    bench: [
      { player: p.burrow, projection: projection(p.burrow) },
      { player: p.barkley, projection: projection(p.barkley) },
      { player: p.smith, projection: projection(p.smith) },
      { player: p.london, projection: projection(p.london) },
      { player: p.stbrown, projection: projection(p.stbrown) },
      { player: p.mcbride, projection: projection(p.mcbride) },
      { player: p.fairbairn, projection: projection(p.fairbairn) },
      { player: p.phi_def, projection: projection(p.phi_def) },
    ],
  },
  opponentTeam: {
    teamName: 'Hermes Express',
    managerName: 'Marcus',
    record: '4-3',
    roster: [
      slot('QB', p.lamar),
      slot('RB', p.gibbs),
      slot('RB', p.jacobs),
      slot('WR', p.chase),
      slot('WR', p.nacua),
      slot('TE', p.bowers),
      slot('FLEX', p.barkley),
      slot('K', p.fairbairn),
      slot('DEF', p.min_def),
    ],
  },
  baseline: {
    yours: MOCK_YOUR_LINE,
    opponent: MOCK_OPPONENT_LINE,
  },
};
