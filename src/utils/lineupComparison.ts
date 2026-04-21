import type { Player } from '../types';

const NFL_TEAMS = ['KC', 'BUF', 'PHI', 'SF', 'DAL', 'MIA', 'BAL', 'DET', 'CIN', 'HOU'];

export function hashString(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function roundTo(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function moneylineToWinProbability(moneyline: number) {
  if (moneyline < 0) {
    return roundTo((-moneyline / (-moneyline + 100)) * 100);
  }

  return roundTo((100 / (moneyline + 100)) * 100);
}

export function winProbabilityToMoneyline(winProbability: number) {
  const probability = clamp(winProbability / 100, 0.01, 0.99);

  if (probability >= 0.5) {
    return -Math.round((probability / (1 - probability)) * 100);
  }

  return Math.round(((1 - probability) / probability) * 100);
}

// Voice: short, declarative, sportsbook-confident. Avoid em-dashes, hedging, and "you should..." constructions.
const COMPARISON_VERDICTS = {
  largeNegative: [
    'The book moves against you. Hard.',
    'A clear downgrade. The line knows it.',
    '{player} costs you. Pivot if you can.',
    'Your win prob takes a real hit here.',
    'The book shortens you. Not the move.',
    '{player} gets expensive fast.',
    '{player} loses too much edge.',
    'The board says no on {player}.',
  ],
  smallNegative: [
    'A small step back. Not nothing.',
    'The line nudges the wrong way.',
    '{player} shaves your edge.',
    'Marginally worse. Reasonable people differ.',
    'A quiet downgrade.',
    '{player} adds a little tax.',
    'You can live with {player}. The number dips.',
    'The price slips with {player}.',
  ],
  nearZero: [
    'A wash. Pick the one you trust.',
    'The book shrugs.',
    'Effectively even. Go with the gut.',
    'Same line, different name.',
    'Within the noise.',
    '{player} changes little.',
    'The number barely breathes with {player}.',
    '{player} does not break the market.',
  ],
  smallPositive: [
    'A modest upgrade. The line tilts your way.',
    'Slight edge. The book notices.',
    '{player} earns the start.',
    'A real, if quiet, win.',
    'The line moves your way.',
    '{player} gives you a useful edge.',
    'The price improves with {player}.',
    'The market gives {player} a nod.',
  ],
  largePositive: [
    'The book moves. You priced this one right.',
    'A clear upgrade. Make the swap.',
    '{player} is the play. The line agrees.',
    "Big edge. Don't think twice.",
    'The line opens up. Take it.',
    '{player} creates real leverage.',
    'The market opens for {player}.',
    'Clear signal from the book on {player}.',
  ],
};

function getVerdictBand(delta: number) {
  if (delta <= -7) {
    return COMPARISON_VERDICTS.largeNegative;
  }

  if (delta < -2) {
    return COMPARISON_VERDICTS.smallNegative;
  }

  if (delta <= 2) {
    return COMPARISON_VERDICTS.nearZero;
  }

  if (delta < 7) {
    return COMPARISON_VERDICTS.smallPositive;
  }

  return COMPARISON_VERDICTS.largePositive;
}

function getLastName(playerName: string) {
  return playerName.trim().split(/\s+/).at(-1) ?? playerName;
}

export function getComparisonVerdict(
  delta: number,
  leftPlayerName: string,
  rightPlayerName: string,
  seed = `${leftPlayerName}:${rightPlayerName}:${delta}`,
) {
  const verdicts = getVerdictBand(delta);
  const selectedVerdict = verdicts[hashString(seed) % verdicts.length];

  return selectedVerdict.replace('{player}', getLastName(rightPlayerName));
}

export function getSyntheticGameContext(player: Player) {
  const hash = hashString(player.id);
  const opponent = NFL_TEAMS[hash % NFL_TEAMS.length];
  const spreadHalfPoints = (hash % 29) - 14;
  const totalHalfPoints = 77 + ((hash >> 4) % 29);
  const spread = spreadHalfPoints / 2;
  const total = totalHalfPoints / 2;
  const signedSpread = spread > 0 ? `+${spread.toFixed(1)}` : spread.toFixed(1);

  return {
    gameLine: `${player.team} ${signedSpread} · O/U ${total.toFixed(1)} vs ${opponent}`,
  };
}
