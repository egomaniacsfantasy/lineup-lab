import type { MatchupLine } from '../types';
import { displayedDelta, formatDisplayedDelta } from './displayDelta';

export function getDisplayedWinProbabilityDelta(beforeLine: MatchupLine, afterLine: MatchupLine) {
  return displayedDelta(beforeLine.winProbability, afterLine.winProbability);
}

export function formatDisplayedWinProbabilityDelta(
  beforeLine: MatchupLine,
  afterLine: MatchupLine,
) {
  return formatDisplayedDelta(beforeLine.winProbability, afterLine.winProbability);
}
