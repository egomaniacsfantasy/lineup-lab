import type { MatchupLine, Player, PlayerAlternative, RosterSlot } from '../types';
import { getDisplayedWinProbabilityDelta } from './matchupDelta';

export type StarterEvaluationState = 'OPTIMAL' | 'TIGHT_CALL' | 'SWAP';

export interface StarterEvaluation {
  slotIndex: number;
  currentStarter: Player;
  bestBenchAlternative: PlayerAlternative | null;
  alternativeIndex: number | null;
  currentWinProbContribution: number;
  alternativeWinProbContribution: number | null;
  delta: number;
  state: StarterEvaluationState;
}

const TIGHT_CALL_THRESHOLD = 1.5;

function getEvaluationState(delta: number): StarterEvaluationState {
  if (delta > TIGHT_CALL_THRESHOLD) {
    return 'SWAP';
  }

  if (delta >= -TIGHT_CALL_THRESHOLD) {
    return 'TIGHT_CALL';
  }

  return 'OPTIMAL';
}

export function getPlayerLastName(playerName: string) {
  const trimmedName = playerName.trim();

  if (/\s+D\/ST$/i.test(trimmedName)) {
    return trimmedName.replace(/\s+D\/ST$/i, '');
  }

  return trimmedName.split(/\s+/).at(-1) ?? trimmedName;
}

export function evaluateStarterSlot(
  slot: RosterSlot,
  slotIndex: number,
  baselineLine: MatchupLine,
): StarterEvaluation {
  const best = slot.alternatives.reduce<{
    alternative: PlayerAlternative | null;
    delta: number;
    index: number | null;
  }>(
    (currentBest, alternative, index) => {
      const delta = getDisplayedWinProbabilityDelta(
        baselineLine,
        alternative.resultingLine,
      );

      if (delta > currentBest.delta) {
        return {
          alternative,
          delta,
          index,
        };
      }

      return currentBest;
    },
    {
      alternative: null,
      delta: Number.NEGATIVE_INFINITY,
      index: null,
    },
  );

  const bestBenchAlternative = best.alternative;
  const alternativeIndex = best.index;
  const bestDelta = best.delta;

  const currentWinProbContribution = Number(baselineLine.winProbability.toFixed(1));
  let alternativeWinProbContribution: number | null = null;
  if (bestBenchAlternative) {
    alternativeWinProbContribution = Number(
      bestBenchAlternative.resultingLine.winProbability.toFixed(1),
    );
  }
  const delta = alternativeWinProbContribution === null ? Number.NEGATIVE_INFINITY : bestDelta;

  return {
    slotIndex,
    currentStarter: slot.starter,
    bestBenchAlternative,
    alternativeIndex,
    currentWinProbContribution,
    alternativeWinProbContribution,
    delta,
    state: getEvaluationState(delta),
  };
}

export function evaluateStarterRoster(roster: RosterSlot[], baselineLine: MatchupLine) {
  return roster.map((slot, slotIndex) => evaluateStarterSlot(slot, slotIndex, baselineLine));
}

export function getTopSwapEvaluation(evaluations: StarterEvaluation[]) {
  return evaluations
    .filter((evaluation) => evaluation.state === 'SWAP')
    .sort((evaluationA, evaluationB) => evaluationB.delta - evaluationA.delta)[0] ?? null;
}
