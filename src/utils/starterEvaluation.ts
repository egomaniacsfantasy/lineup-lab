import type { Player, PlayerAlternative, RosterSlot } from '../types';
import { roundTo } from './lineupComparison';

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

interface StarterEvaluationSeed {
  alternativePlayerId: string;
  currentWinProbContribution: number;
  alternativeWinProbContribution: number;
}

const TIGHT_CALL_THRESHOLD = 1.5;

// TEMP: 2024 replay seed for pivot logic. Replace with engine output. Positive delta = bench player outscored the starter in Week 8.
const PROTOTYPE_STARTER_EVALUATION_SEED: Record<string, StarterEvaluationSeed> = {
  'p-mahomes': {
    alternativePlayerId: 'j-burrow',
    currentWinProbContribution: 18.2,
    alternativeWinProbContribution: 12.9,
  },
  'd-henry': {
    alternativePlayerId: 's-barkley',
    currentWinProbContribution: 14.7,
    alternativeWinProbContribution: 12.1,
  },
  'b-robinson': {
    alternativePlayerId: 's-barkley',
    currentWinProbContribution: 23.6,
    alternativeWinProbContribution: 12.1,
  },
  'j-jefferson': {
    alternativePlayerId: 'd-smith',
    currentWinProbContribution: 19.5,
    alternativeWinProbContribution: 20.5,
  },
  'c-lamb': {
    alternativePlayerId: 'd-london',
    currentWinProbContribution: 39.6,
    alternativeWinProbContribution: 7.4,
  },
  't-kelce': {
    alternativePlayerId: 't-mcbride',
    currentWinProbContribution: 25.0,
    alternativeWinProbContribution: 21.4,
  },
  't-mclaurin': {
    alternativePlayerId: 'd-smith',
    currentWinProbContribution: 17.5,
    alternativeWinProbContribution: 20.5,
  },
  'b-aubrey': {
    alternativePlayerId: 'k-fairbairn',
    currentWinProbContribution: 6.0,
    alternativeWinProbContribution: 11.0,
  },
  'sf-def': {
    alternativePlayerId: 'phi-def',
    currentWinProbContribution: 6.0,
    alternativeWinProbContribution: 6.0,
  },
};

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
): StarterEvaluation {
  const seed = PROTOTYPE_STARTER_EVALUATION_SEED[slot.starter.id];
  const seededAlternativeIndex = seed
    ? slot.alternatives.findIndex(
        (alternative) => alternative.player.id === seed.alternativePlayerId,
      )
    : -1;
  const fallbackAlternativeIndex =
    seededAlternativeIndex >= 0 ? seededAlternativeIndex : slot.alternatives.length > 0 ? 0 : -1;
  const bestBenchAlternative =
    fallbackAlternativeIndex >= 0 ? slot.alternatives[fallbackAlternativeIndex] : null;
  const currentWinProbContribution =
    seed?.currentWinProbContribution ?? slot.projection;
  const alternativeWinProbContribution =
    seed?.alternativeWinProbContribution ??
    (bestBenchAlternative
      ? roundTo(currentWinProbContribution + bestBenchAlternative.deltaWinProbability)
      : null);
  const delta =
    alternativeWinProbContribution === null
      ? Number.NEGATIVE_INFINITY
      : roundTo(alternativeWinProbContribution - currentWinProbContribution);

  return {
    slotIndex,
    currentStarter: slot.starter,
    bestBenchAlternative,
    alternativeIndex: bestBenchAlternative ? fallbackAlternativeIndex : null,
    currentWinProbContribution,
    alternativeWinProbContribution,
    delta,
    state: getEvaluationState(delta),
  };
}

export function evaluateStarterRoster(roster: RosterSlot[]) {
  return roster.map((slot, slotIndex) => evaluateStarterSlot(slot, slotIndex));
}

export function getTopSwapEvaluation(evaluations: StarterEvaluation[]) {
  return evaluations
    .filter((evaluation) => evaluation.state === 'SWAP')
    .sort((evaluationA, evaluationB) => evaluationB.delta - evaluationA.delta)[0] ?? null;
}
