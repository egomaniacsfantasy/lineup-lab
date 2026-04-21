import { useCallback, useMemo, useState } from 'react';
import type { BenchPlayer, MatchupData, MatchupLine, Player, RosterSlot } from '../types';
import {
  clamp,
  hashString,
  moneylineToWinProbability,
  roundTo,
  winProbabilityToMoneyline,
} from '../utils/lineupComparison';

export interface MatchupPlayerComparison {
  slotIndex: number;
  leftSelectionIndex: number | null;
  rightSelectionIndex: number | null;
  leftLine: MatchupLine;
  rightLine: MatchupLine;
  leftProjection: number;
  rightProjection: number;
  deltaWinProbability: number;
}

interface MatchupEngineState {
  activeLine: { yours: MatchupLine; opponent: MatchupLine };
  baselineLine: { yours: MatchupLine; opponent: MatchupLine };
  baselineRoster: RosterSlot[];
  bench: BenchPlayer[];
  roster: RosterSlot[];
  activeDecisionSlot: number | null;
  selectedAlternatives: Record<number, number | null>;
  selectPlayer: (slotIndex: number, alternativeIndex: number | null) => void;
  openDecision: (slotIndex: number) => void;
  closeDecision: () => void;
  winProbDelta: number;
  lastChangeDelta: number;
  getOptionLine: (slotIndex: number, alternativeIndex: number | null) => MatchupLine;
  compareAnyTwoPlayers: (
    playerA: Player | null,
    playerB: Player | null,
  ) => MatchupPlayerComparison | null;
}

type SelectionMap = Record<number, number | null>;

type LineDelta = {
  moneyline: number;
  winProbability: number;
  projection: number;
  spread: number;
  total: number;
};

const EMPTY_DELTA: LineDelta = {
  moneyline: 0,
  winProbability: 0,
  projection: 0,
  spread: 0,
  total: 0,
};

const MIN_SYNTHETIC_MONEYLINE = -280;
const MAX_SYNTHETIC_MONEYLINE = 180;
const MIN_SYNTHETIC_WIN_PROB = moneylineToWinProbability(MAX_SYNTHETIC_MONEYLINE);
const MAX_SYNTHETIC_WIN_PROB = moneylineToWinProbability(MIN_SYNTHETIC_MONEYLINE);

function getPlayerProjection(
  player: Player,
  roster: RosterSlot[],
  bench: BenchPlayer[],
) {
  for (const slot of roster) {
    if (slot.starter.id === player.id) {
      return slot.projection;
    }

    const alternative = slot.alternatives.find(
      (candidate) => candidate.player.id === player.id,
    );

    if (alternative) {
      return alternative.projection;
    }
  }

  const benchPlayer = bench.find((candidate) => candidate.player.id === player.id);

  if (benchPlayer) {
    return benchPlayer.projection;
  }

  switch (player.position) {
    case 'QB':
      return 18;
    case 'RB':
    case 'WR':
      return 12;
    case 'TE':
      return 9;
    case 'K':
    case 'DEF':
      return 7;
    default:
      return 10;
  }
}

function getSyntheticDelta(playerA: Player, playerB: Player) {
  const hash = hashString(`${playerA.id}:${playerB.id}`);
  return roundTo((hash % 301) / 10 - 18);
}

function getSyntheticWinProbabilities(playerA: Player, playerB: Player, delta: number) {
  const low = MIN_SYNTHETIC_WIN_PROB + Math.max(0, -delta);
  const high = MAX_SYNTHETIC_WIN_PROB - Math.max(0, delta);
  const ratio = (hashString(`${playerA.id}:line:${playerB.id}`) % 1000) / 1000;
  const leftWinProbability = roundTo(low + (high - low) * ratio);

  return {
    leftWinProbability,
    rightWinProbability: roundTo(leftWinProbability + delta),
  };
}

function buildSyntheticLine(
  winProbability: number,
  projection: number,
  baselineLine: MatchupLine,
): MatchupLine {
  const rawMoneyline = winProbabilityToMoneyline(winProbability);
  const moneyline = clamp(
    Math.round(rawMoneyline / 5) * 5,
    MIN_SYNTHETIC_MONEYLINE,
    MAX_SYNTHETIC_MONEYLINE,
  );
  const impliedWinProbability = moneylineToWinProbability(moneyline);
  const projectionDelta = projection - 14;

  return {
    moneyline,
    winProbability: impliedWinProbability,
    projection: roundTo(baselineLine.projection + projectionDelta),
    spread: roundTo((impliedWinProbability - 50) * 0.75),
    total: roundTo(baselineLine.total + projectionDelta * 0.6),
  };
}

// TEMP: synthetic deltas for prototype review. Replace with simulation engine output when Franco ships the API.
function buildSyntheticComparison(
  playerA: Player,
  playerB: Player,
  baselineLine: MatchupLine,
  roster: RosterSlot[],
  bench: BenchPlayer[],
): MatchupPlayerComparison {
  const requestedDelta = getSyntheticDelta(playerA, playerB);
  const { leftWinProbability, rightWinProbability } = getSyntheticWinProbabilities(
    playerA,
    playerB,
    requestedDelta,
  );
  const leftProjection = getPlayerProjection(playerA, roster, bench);
  const rightProjection = getPlayerProjection(playerB, roster, bench);
  const leftLine = buildSyntheticLine(
    leftWinProbability,
    leftProjection,
    baselineLine,
  );
  const rightLine = buildSyntheticLine(
    rightWinProbability,
    rightProjection,
    baselineLine,
  );

  return {
    slotIndex: -1,
    leftSelectionIndex: null,
    rightSelectionIndex: null,
    leftLine,
    rightLine,
    leftProjection,
    rightProjection,
    deltaWinProbability: roundTo(
      clamp(rightLine.winProbability - leftLine.winProbability, -18, 12),
    ),
  };
}

function isSwappableSlot(slot: RosterSlot | undefined) {
  return Boolean(slot && slot.alternatives.length > 0);
}

export function useMatchupEngine(matchup: MatchupData): MatchupEngineState {
  const baselineLine = useMemo(() => matchup.baseline, [matchup]);
  const baselineRoster = useMemo(() => matchup.yourTeam.roster, [matchup]);
  const baselineBench = useMemo(() => matchup.yourTeam.bench ?? [], [matchup]);

  const initialSelections = useMemo(
    () =>
      baselineRoster.reduce<SelectionMap>((accumulator, slot, index) => {
        if (isSwappableSlot(slot)) {
          accumulator[index] = null;
        }

        return accumulator;
      }, {}),
    [baselineRoster],
  );

  const [selectedAlternatives, setSelectedAlternatives] =
    useState<SelectionMap>(initialSelections);
  const [activeDecisionSlot, setActiveDecisionSlot] = useState<number | null>(null);
  const [lastChangeDelta, setLastChangeDelta] = useState(0);

  const getDeltaForAlternative = useCallback(
    (slotIndex: number, alternativeIndex: number | null): LineDelta => {
      if (alternativeIndex === null) {
        return EMPTY_DELTA;
      }

      const alternative = baselineRoster[slotIndex]?.alternatives[alternativeIndex];

      if (!alternative) {
        return EMPTY_DELTA;
      }

      return {
        moneyline: alternative.resultingLine.moneyline - baselineLine.yours.moneyline,
        winProbability:
          alternative.resultingLine.winProbability - baselineLine.yours.winProbability,
        projection: alternative.resultingLine.projection - baselineLine.yours.projection,
        spread: alternative.resultingLine.spread - baselineLine.yours.spread,
        total: alternative.resultingLine.total - baselineLine.yours.total,
      };
    },
    [baselineLine.yours, baselineRoster],
  );

  const buildLineFromSelections = useCallback(
    (selections: SelectionMap) => {
      const aggregate = baselineRoster.reduce<LineDelta>((accumulator, slot, index) => {
        if (!isSwappableSlot(slot)) {
          return accumulator;
        }

        const nextDelta = getDeltaForAlternative(index, selections[index] ?? null);

        return {
          moneyline: accumulator.moneyline + nextDelta.moneyline,
          winProbability: accumulator.winProbability + nextDelta.winProbability,
          projection: accumulator.projection + nextDelta.projection,
          spread: accumulator.spread + nextDelta.spread,
          total: accumulator.total + nextDelta.total,
        };
      }, EMPTY_DELTA);

      const yourLine: MatchupLine = {
        moneyline: Math.round(baselineLine.yours.moneyline + aggregate.moneyline),
        winProbability: clamp(
          roundTo(baselineLine.yours.winProbability + aggregate.winProbability),
          0,
          100,
        ),
        projection: roundTo(baselineLine.yours.projection + aggregate.projection),
        spread: roundTo(baselineLine.yours.spread + aggregate.spread),
        total: roundTo(baselineLine.yours.total + aggregate.total),
      };

      return yourLine;
    },
    [baselineLine.yours, baselineRoster, getDeltaForAlternative],
  );

  const getOptionLine = useCallback(
    (slotIndex: number, alternativeIndex: number | null) => {
      const nextSelections: SelectionMap = {
        ...selectedAlternatives,
        [slotIndex]: alternativeIndex,
      };

      return buildLineFromSelections(nextSelections);
    },
    [buildLineFromSelections, selectedAlternatives],
  );

  const compareAnyTwoPlayers = useCallback(
    (playerA: Player | null, playerB: Player | null) => {
      if (!playerA || !playerB || playerA.id === playerB.id) {
        return null;
      }

      for (let slotIndex = 0; slotIndex < baselineRoster.length; slotIndex += 1) {
        const slot = baselineRoster[slotIndex];
        const alternativeIndexA = slot.alternatives.findIndex(
          (alternative) => alternative.player.id === playerA.id,
        );
        const alternativeIndexB = slot.alternatives.findIndex(
          (alternative) => alternative.player.id === playerB.id,
        );
        const starterIsA = slot.starter.id === playerA.id;
        const starterIsB = slot.starter.id === playerB.id;

        if (!(starterIsA && alternativeIndexB !== -1) && !(starterIsB && alternativeIndexA !== -1)) {
          continue;
        }

        const leftSelectionIndex = starterIsA ? null : alternativeIndexA;
        const rightSelectionIndex = starterIsB ? null : alternativeIndexB;
        const leftLine = getOptionLine(slotIndex, leftSelectionIndex);
        const rightLine = getOptionLine(slotIndex, rightSelectionIndex);
        const leftProjection =
          leftSelectionIndex === null
            ? slot.projection
            : slot.alternatives[leftSelectionIndex]?.projection ?? slot.projection;
        const rightProjection =
          rightSelectionIndex === null
            ? slot.projection
            : slot.alternatives[rightSelectionIndex]?.projection ?? slot.projection;

        return {
          slotIndex,
          leftSelectionIndex,
          rightSelectionIndex,
          leftLine,
          rightLine,
          leftProjection,
          rightProjection,
          deltaWinProbability: roundTo(
            rightLine.winProbability - leftLine.winProbability,
          ),
        };
      }

      return buildSyntheticComparison(
        playerA,
        playerB,
        baselineLine.yours,
        baselineRoster,
        baselineBench,
      );
    },
    [baselineBench, baselineLine.yours, baselineRoster, getOptionLine],
  );

  const activeYourLine = useMemo(
    () => buildLineFromSelections(selectedAlternatives),
    [buildLineFromSelections, selectedAlternatives],
  );

  const activeLine = useMemo(() => {
    const opponentProjection = roundTo(activeYourLine.total - activeYourLine.projection);

    return {
      yours: activeYourLine,
      opponent: {
        moneyline: Math.round(
          baselineLine.opponent.moneyline -
            (activeYourLine.moneyline - baselineLine.yours.moneyline),
        ),
        winProbability: roundTo(100 - activeYourLine.winProbability),
        projection: opponentProjection,
        spread: roundTo(activeYourLine.spread * -1),
        total: activeYourLine.total,
      },
    };
  }, [activeYourLine, baselineLine.opponent, baselineLine.yours.moneyline]);

  const roster = useMemo(
    () =>
      baselineRoster.map((slot, index) => {
        const selectedAlternativeIndex = selectedAlternatives[index] ?? null;

        if (!isSwappableSlot(slot) || selectedAlternativeIndex === null) {
          return slot;
        }

        const selectedAlternative = slot.alternatives[selectedAlternativeIndex];

        if (!selectedAlternative) {
          return slot;
        }

        return {
          ...slot,
          starter: selectedAlternative.player,
          projection: selectedAlternative.projection,
          floor: selectedAlternative.floor,
          ceiling: selectedAlternative.ceiling,
        };
      }),
    [baselineRoster, selectedAlternatives],
  );

  const bench = useMemo(() => {
    const currentStarterIds = new Set(roster.map((slot) => slot.starter.id));
    const benchedStarters = baselineRoster.flatMap((slot, index) => {
      if ((selectedAlternatives[index] ?? null) === null) {
        return [];
      }

      return [
        {
          player: slot.starter,
          projection: slot.projection,
        },
      ];
    });

    const availableBench = baselineBench.filter(
      (benchPlayer) => !currentStarterIds.has(benchPlayer.player.id),
    );

    return [...benchedStarters, ...availableBench];
  }, [baselineBench, baselineRoster, roster, selectedAlternatives]);

  const selectPlayer = useCallback(
    (slotIndex: number, alternativeIndex: number | null) => {
      const slot = baselineRoster[slotIndex];

      if (!isSwappableSlot(slot)) {
        return;
      }

      const currentSelection = selectedAlternatives[slotIndex] ?? null;

      if (currentSelection === alternativeIndex) {
        return;
      }

      const nextSelections: SelectionMap = {
        ...selectedAlternatives,
        [slotIndex]: alternativeIndex,
      };
      const selectedPlayerId =
        alternativeIndex === null ? null : slot.alternatives[alternativeIndex]?.player.id;

      if (selectedPlayerId) {
        baselineRoster.forEach((otherSlot, otherIndex) => {
          if (otherIndex === slotIndex) {
            return;
          }

          const otherSelection = nextSelections[otherIndex];

          if (otherSelection === null || otherSelection === undefined) {
            return;
          }

          const otherPlayer = otherSlot.alternatives[otherSelection]?.player.id;

          if (otherPlayer === selectedPlayerId) {
            nextSelections[otherIndex] = null;
          }
        });
      }

      const previousLine = buildLineFromSelections(selectedAlternatives);
      const nextLine = buildLineFromSelections(nextSelections);

      setSelectedAlternatives(nextSelections);
      setLastChangeDelta(roundTo(nextLine.winProbability - previousLine.winProbability));
    },
    [baselineRoster, buildLineFromSelections, selectedAlternatives],
  );

  const openDecision = useCallback(
    (slotIndex: number) => {
      const slot = baselineRoster[slotIndex];

      if (!isSwappableSlot(slot)) {
        return;
      }

      setActiveDecisionSlot((current) => (current === slotIndex ? null : slotIndex));
    },
    [baselineRoster],
  );

  const closeDecision = useCallback(() => {
    setActiveDecisionSlot(null);
  }, []);

  const winProbDelta = useMemo(
    () => roundTo(activeLine.yours.winProbability - baselineLine.yours.winProbability),
    [activeLine.yours.winProbability, baselineLine.yours.winProbability],
  );

  return {
    activeLine,
    baselineLine,
    baselineRoster,
    bench,
    roster,
    activeDecisionSlot,
    selectedAlternatives,
    selectPlayer,
    openDecision,
    closeDecision,
    winProbDelta,
    lastChangeDelta,
    getOptionLine,
    compareAnyTwoPlayers,
  };
}
