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

// TEMP: prototype seed for pivot logic. Replace with engine output. Positive delta = swap in bench player improves win prob.
const PROTOTYPE_STARTER_EVALUATION_SEED: Record<string, StarterEvaluationSeed> = {
  'mahomes-01': {
    alternativePlayerId: 'prescott-01',
    currentWinProbContribution: 22.4,
    alternativeWinProbContribution: 18.2,
  },
  'henry-01': {
    alternativePlayerId: 'pollard-01',
    currentWinProbContribution: 16.8,
    alternativeWinProbContribution: 14.7,
  },
  'robinson-01': {
    alternativePlayerId: 'pollard-01',
    currentWinProbContribution: 18.2,
    alternativeWinProbContribution: 14.4,
  },
  'adams-01': {
    alternativePlayerId: 'waddle-01',
    currentWinProbContribution: 17.6,
    alternativeWinProbContribution: 8.0,
  },
  'jefferson-01': {
    alternativePlayerId: 'smith-01',
    currentWinProbContribution: 19.4,
    alternativeWinProbContribution: 17.7,
  },
  'kelce-01': {
    alternativePlayerId: 'goedert-01',
    currentWinProbContribution: 12.8,
    alternativeWinProbContribution: 10.0,
  },
  'mclaurin-01': {
    alternativePlayerId: 'smith-01',
    currentWinProbContribution: 15.2,
    alternativeWinProbContribution: 19.9,
  },
  'tucker-01': {
    alternativePlayerId: 'bass-01',
    currentWinProbContribution: 8.6,
    alternativeWinProbContribution: 6.8,
  },
  'sf-def-01': {
    alternativePlayerId: 'dal-def-01',
    currentWinProbContribution: 7.2,
    alternativeWinProbContribution: 8.1,
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
