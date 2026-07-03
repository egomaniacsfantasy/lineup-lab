import type { MatchupLine } from '../types';

function displayedWinProbability(value: number) {
  return Number(value.toFixed(1));
}

export function getDisplayedWinProbabilityDelta(beforeLine: MatchupLine, afterLine: MatchupLine) {
  const before = displayedWinProbability(beforeLine.winProbability);
  const after = displayedWinProbability(afterLine.winProbability);
  return Number((after - before).toFixed(1));
}

export function formatDisplayedWinProbabilityDelta(
  beforeLine: MatchupLine,
  afterLine: MatchupLine,
) {
  const delta = getDisplayedWinProbabilityDelta(beforeLine, afterLine);
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
}
