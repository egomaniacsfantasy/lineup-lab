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

export function getComparisonVerdict(
  delta: number,
  leftPlayerName: string,
  rightPlayerName: string,
) {
  if (delta <= -7) {
    return `Switching to ${rightPlayerName} carries a major cost in win probability.`;
  }

  if (delta < -3) {
    return `A real step back. The book notices ${rightPlayerName}.`;
  }

  if (delta < -0.5) {
    return `A small step back. The line leans ${leftPlayerName}.`;
  }

  if (delta <= 0.5) {
    return 'A wash. Pick the one you trust.';
  }

  if (delta < 3) {
    return `A modest upgrade. The line nudges toward ${rightPlayerName}.`;
  }

  if (delta < 7) {
    return `A meaningful upgrade. ${rightPlayerName} moves the number your way.`;
  }

  return `The book moves. You priced ${rightPlayerName} right.`;
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
