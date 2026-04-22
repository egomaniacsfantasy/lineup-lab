import { useEffect, useMemo, useRef, useState } from 'react';
import { DecisionPanel } from '../components/decision/DecisionPanel';
import { CompareWidget } from '../components/matchup/CompareWidget';
import { LineChangeFlash } from '../components/matchup/LineChangeFlash';
import { MatchupCard } from '../components/matchup/MatchupCard';
import { QuickActions } from '../components/matchup/QuickActions';
import { RosterList } from '../components/roster/RosterList';
import { useMatchupEngine } from '../hooks/useMatchupEngine';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSeasonMode } from '../hooks/useSeasonMode';
import {
  MOCK_LINEUP_LOCKS,
  MOCK_MATCHUP,
  MOCK_TRADE_TARGET_GROUPS,
  MOCK_WAIVER_SUGGESTION,
} from '../mocks';
import { MatchupPreseason } from './MatchupPreseason';
import { setStoredCascadeScenarioLabel } from '../utils/seasonSelection';
import {
  evaluateStarterRoster,
  getTopSwapEvaluation,
} from '../utils/starterEvaluation';
import type { Player, RosterSlot } from '../types';
import './MatchupPage.css';

const STARTER_MARKET_CONTEXT: Record<
  string,
  { gameLine: string; playerProp?: string }
> = {
  'mahomes-01': {
    gameLine: 'KC -3.0 · O/U 47.5',
    playerProp: 'Mahomes O/U 281.5 pass yds (-115)',
  },
  'henry-01': {
    gameLine: 'BAL -3.5 · O/U 47.0',
    playerProp: 'Henry O/U 83.5 rush yds (-112)',
  },
  'robinson-01': {
    gameLine: 'ATL -2.0 · O/U 45.5',
    playerProp: 'Robinson O/U 78.5 rush yds (-110)',
  },
  'adams-01': {
    gameLine: 'LV +2.5 · O/U 44.5',
    playerProp: 'Adams O/U 72.5 rec yds (-110)',
  },
  'jefferson-01': {
    gameLine: 'MIN -2.5 · O/U 44.0',
    playerProp: 'Jefferson O/U 87.5 rec yds (-118)',
  },
  'kelce-01': {
    gameLine: 'KC -3.0 · O/U 47.5',
    playerProp: 'Kelce O/U 63.5 rec yds (-114)',
  },
  'mclaurin-01': {
    gameLine: 'WAS -1.5 · O/U 42.0',
    playerProp: 'McLaurin O/U 68.5 rec yds (-110)',
  },
  'tucker-01': {
    gameLine: 'BAL -3.5 · O/U 47.0',
    playerProp: 'Tucker O/U 1.5 FGs made (-105)',
  },
  'sf-def-01': {
    gameLine: 'SF -1.5 · O/U 43.5',
    playerProp: '49ers D/ST O/U 2.5 sacks (-118)',
  },
};

function getBestAlternative(slot: RosterSlot) {
  return slot.alternatives.reduce<(typeof slot.alternatives)[number] | null>(
    (bestAlternative, alternative) => {
      if (!bestAlternative) {
        return alternative;
      }

      return Math.abs(alternative.deltaWinProbability) >
        Math.abs(bestAlternative.deltaWinProbability)
        ? alternative
        : bestAlternative;
    },
    null,
  );
}

function getHighestImpactDecision(roster: RosterSlot[]) {
  return roster.reduce<{
    slotIndex: number;
    slot: RosterSlot;
    alternative: RosterSlot['alternatives'][number];
  } | null>((bestDecision, slot, slotIndex) => {
    const bestAlternative = getBestAlternative(slot);

    if (!bestAlternative) {
      return bestDecision;
    }

    if (!bestDecision) {
      return { slotIndex, slot, alternative: bestAlternative };
    }

    return Math.abs(bestAlternative.deltaWinProbability) >
      Math.abs(bestDecision.alternative.deltaWinProbability)
      ? { slotIndex, slot, alternative: bestAlternative }
      : bestDecision;
  }, null);
}

function getUniquePlayers(roster: RosterSlot[], bench: { player: Player }[]) {
  const seen = new Set<string>();
  const players: Player[] = [];

  [...roster.map((slot) => slot.starter), ...bench.map((benchPlayer) => benchPlayer.player)].forEach(
    (player) => {
      if (seen.has(player.id)) {
        return;
      }

      seen.add(player.id);
      players.push(player);
    },
  );

  return players;
}

export function MatchupPage() {
  const { mode } = useSeasonMode();
  const engine = useMatchupEngine(MOCK_MATCHUP);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const compareWidgetRef = useRef<HTMLDivElement | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  const starterEvaluations = useMemo(
    () => evaluateStarterRoster(engine.baselineRoster),
    [engine.baselineRoster],
  );
  const topSwapEvaluation = useMemo(
    () => getTopSwapEvaluation(starterEvaluations),
    [starterEvaluations],
  );

  const defaultComparison = useMemo(
    () => getHighestImpactDecision(engine.baselineRoster),
    [engine.baselineRoster],
  );

  const [compareSelection, setCompareSelection] = useState(() => ({
    leftId: defaultComparison?.slot.starter.id ?? null,
    rightId: defaultComparison?.alternative.player.id ?? null,
  }));
  const [hasActivatedCompare, setHasActivatedCompare] = useState(false);
  const [pendingSwapSlotIndex, setPendingSwapSlotIndex] = useState<number | null>(null);
  const [highlightedSwapSlotIndex, setHighlightedSwapSlotIndex] = useState<number | null>(null);
  const [swapToast, setSwapToast] = useState<{
    previousAlternativeIndex: number | null;
    slotIndex: number;
  } | null>(null);
  const swapToastTimerRef = useRef<number | null>(null);

  const availablePlayers = useMemo(
    () => getUniquePlayers(engine.roster, engine.bench),
    [engine.bench, engine.roster],
  );
  const playerMap = useMemo(
    () => new Map(availablePlayers.map((player) => [player.id, player])),
    [availablePlayers],
  );
  const playerContexts = useMemo(() => {
    const contexts: Record<string, { gameLine: string; playerProp?: string }> = {};

    engine.baselineRoster.forEach((slot) => {
      const starterContext = STARTER_MARKET_CONTEXT[slot.starter.id];
      contexts[slot.starter.id] =
        starterContext ?? {
          gameLine: `${slot.starter.team} line pending`,
        };

      slot.alternatives.forEach((alternative) => {
        contexts[alternative.player.id] = {
          gameLine: alternative.gameLine,
          playerProp: alternative.playerProp,
        };
      });
    });

    return contexts;
  }, [engine.baselineRoster]);
  const leftPlayer = compareSelection.leftId
    ? playerMap.get(compareSelection.leftId) ?? null
    : null;
  const rightPlayer = compareSelection.rightId
    ? playerMap.get(compareSelection.rightId) ?? null
    : null;
  const compareResult = useMemo(
    () => engine.compareAnyTwoPlayers(leftPlayer, rightPlayer),
    [engine, leftPlayer, rightPlayer],
  );
  const topTradeTarget = useMemo(
    () =>
      MOCK_TRADE_TARGET_GROUPS.flatMap((group) => group.targets).sort(
        (targetA, targetB) => targetB.fitScore - targetA.fitScore,
      )[0] ?? null,
    [],
  );

  useEffect(() => {
    const adamsSlotIndex = engine.baselineRoster.findIndex(
      (slot) => slot.starter.id === 'adams-01',
    );

    if (adamsSlotIndex === -1) {
      return;
    }

    const selectedAlternative = engine.selectedAlternatives[adamsSlotIndex] ?? null;
    const nextLabel =
      selectedAlternative === null ? 'Start Adams' : 'Start Waddle';

    setStoredCascadeScenarioLabel(nextLabel);
  }, [engine.baselineRoster, engine.selectedAlternatives]);

  useEffect(() => {
    if (!hasActivatedCompare || !compareResult) {
      return;
    }

    engine.selectPlayer(compareResult.slotIndex, compareResult.rightSelectionIndex);
  }, [compareResult, engine, hasActivatedCompare]);

  useEffect(() => {
    return () => {
      if (swapToastTimerRef.current !== null) {
        window.clearTimeout(swapToastTimerRef.current);
      }

      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  if (mode === 'preseason') {
    return <MatchupPreseason />;
  }

  const activeSlotIndex = engine.activeDecisionSlot;
  const activeSlot =
    activeSlotIndex !== null ? engine.baselineRoster[activeSlotIndex] : null;
  const selectedAlternativeIndex =
    activeSlotIndex !== null
      ? engine.selectedAlternatives[activeSlotIndex] ?? null
      : null;

  const starterContext =
    activeSlot !== null
      ? STARTER_MARKET_CONTEXT[activeSlot.starter.id] ?? {
          gameLine: `${activeSlot.starter.team} game line pending`,
        }
      : null;

  const decisionPanel =
    activeSlotIndex !== null && activeSlot && starterContext ? (
      <DecisionPanel
        alternativeLines={activeSlot.alternatives.map((_, alternativeIndex) =>
          engine.getOptionLine(activeSlotIndex, alternativeIndex),
        )}
        onClose={engine.closeDecision}
        onSelectAlternative={(alternativeIndex) =>
          engine.selectPlayer(activeSlotIndex, alternativeIndex)
        }
        onSelectStarter={() => engine.selectPlayer(activeSlotIndex, null)}
        selectedAlternativeIndex={selectedAlternativeIndex}
        slot={activeSlot}
        starterGameLine={starterContext.gameLine}
        starterLine={engine.getOptionLine(activeSlotIndex, null)}
        starterPlayerProp={starterContext.playerProp}
      />
    ) : null;

  const handleOpenBiggestSwing = (slotIndex: number) => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }

    setHighlightedSwapSlotIndex(slotIndex);

    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-roster-slot-index="${slotIndex}"]`)
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
    });

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedSwapSlotIndex(null);
      highlightTimerRef.current = null;
    }, 1000);
  };

  const handleRosterInteraction = (slotIndex: number) => {
    if (!isDesktop) {
      engine.openDecision(slotIndex);
      return;
    }

    const evaluation = starterEvaluations[slotIndex];

    if (!evaluation || evaluation.state !== 'SWAP') {
      return;
    }

    setPendingSwapSlotIndex((current) => (current === slotIndex ? null : slotIndex));
  };

  const handleComparePlayerChange = (side: 'left' | 'right', player: Player | null) => {
    setCompareSelection((current) => ({
      ...current,
      [side === 'left' ? 'leftId' : 'rightId']: player?.id ?? null,
    }));
    setHasActivatedCompare(true);
    setPendingSwapSlotIndex(null);
  };

  const showSwapToast = (slotIndex: number, previousAlternativeIndex: number | null) => {
    if (swapToastTimerRef.current !== null) {
      window.clearTimeout(swapToastTimerRef.current);
    }

    setSwapToast({ previousAlternativeIndex, slotIndex });
    swapToastTimerRef.current = window.setTimeout(() => {
      setSwapToast(null);
      swapToastTimerRef.current = null;
    }, 3000);
  };

  const handleConfirmSwap = (
    slotIndex: number,
    nextAlternativeIndex: number | null,
  ) => {
    const previousAlternativeIndex = engine.selectedAlternatives[slotIndex] ?? null;

    engine.selectPlayer(slotIndex, nextAlternativeIndex);
    setPendingSwapSlotIndex(null);
    showSwapToast(slotIndex, previousAlternativeIndex);
  };

  const handleUndoSwap = () => {
    if (!swapToast) {
      return;
    }

    if (swapToastTimerRef.current !== null) {
      window.clearTimeout(swapToastTimerRef.current);
      swapToastTimerRef.current = null;
    }

    engine.selectPlayer(swapToast.slotIndex, swapToast.previousAlternativeIndex);
    setSwapToast(null);
  };

  const biggestSwing = topSwapEvaluation?.bestBenchAlternative
    ? {
        slotIndex: topSwapEvaluation.slotIndex,
        slotLabel: engine.baselineRoster[topSwapEvaluation.slotIndex].slotLabel,
        starter: topSwapEvaluation.currentStarter,
        alternative: topSwapEvaluation.bestBenchAlternative.player,
        delta: topSwapEvaluation.delta,
      }
    : null;

  return (
    <div className="matchup-page">
      <h1 className="visually-hidden">The Lineup Lab matchup dashboard</h1>

      <div className="matchup-page__main">
        <LineChangeFlash
          delta={engine.lastChangeDelta}
          visible={engine.lastChangeDelta !== 0}
        />

        <div className="matchup-page__market-stack">
          <p className="matchup-page__thesis">
            THE LINE MOVES WITH YOUR LINEUP. PRICE EVERY DECISION.
          </p>
          <MatchupCard
            activeLine={engine.activeLine}
            activeRoster={engine.roster}
            matchup={MOCK_MATCHUP}
          />
        </div>

        <RosterList
          activeDecisionSlot={
            isDesktop
              ? pendingSwapSlotIndex
              : engine.activeDecisionSlot
          }
          baselineRoster={engine.baselineRoster}
          bench={engine.bench}
          getOptionLine={engine.getOptionLine}
          highlightedSlotIndex={highlightedSwapSlotIndex}
          onCancelSwapConfirm={() => setPendingSwapSlotIndex(null)}
          onConfirmSwap={handleConfirmSwap}
          onToggleDecision={handleRosterInteraction}
          pendingSwapSlotIndex={isDesktop ? pendingSwapSlotIndex : null}
          roster={engine.roster}
          selectedAlternatives={engine.selectedAlternatives}
          starterEvaluations={starterEvaluations}
        />

        {!isDesktop ? (
          <>
            <div ref={compareWidgetRef}>
              <CompareWidget
                comparison={compareResult}
                defaultSuggestionLabel={
                  defaultComparison
                    ? `${defaultComparison.slot.starter.shortName} vs ${defaultComparison.alternative.player.shortName}`
                    : 'your biggest swing this week'
                }
                leftPlayer={leftPlayer}
                onSelectLeft={(player) => handleComparePlayerChange('left', player)}
                onSelectRight={(player) => handleComparePlayerChange('right', player)}
                playerContexts={playerContexts}
                players={availablePlayers}
                rightPlayer={rightPlayer}
              />
            </div>

            <QuickActions
              biggestSwing={biggestSwing}
              lineupLocks={MOCK_LINEUP_LOCKS}
              onCompareBiggestSwing={() => {
                if (!biggestSwing) {
                  return;
                }

                handleOpenBiggestSwing(biggestSwing.slotIndex);
              }}
              topTradeTarget={topTradeTarget}
              waiverSuggestion={MOCK_WAIVER_SUGGESTION}
            />
          </>
        ) : null}
      </div>

      {isDesktop ? (
        <aside className="matchup-page__sidebar">
          <div className="matchup-page__sidebar-stack">
            <div ref={compareWidgetRef}>
              <CompareWidget
                comparison={compareResult}
                defaultSuggestionLabel={
                  defaultComparison
                    ? `${defaultComparison.slot.starter.shortName} vs ${defaultComparison.alternative.player.shortName}`
                    : 'your biggest swing this week'
                }
                leftPlayer={leftPlayer}
                onSelectLeft={(player) => handleComparePlayerChange('left', player)}
                onSelectRight={(player) => handleComparePlayerChange('right', player)}
                playerContexts={playerContexts}
                players={availablePlayers}
                rightPlayer={rightPlayer}
              />
            </div>

            <QuickActions
              biggestSwing={biggestSwing}
              lineupLocks={MOCK_LINEUP_LOCKS}
              onCompareBiggestSwing={() => {
                if (!biggestSwing) {
                  return;
                }

                handleOpenBiggestSwing(biggestSwing.slotIndex);
              }}
              topTradeTarget={topTradeTarget}
              waiverSuggestion={MOCK_WAIVER_SUGGESTION}
            />
          </div>
        </aside>
      ) : null}

      {!isDesktop ? decisionPanel : null}

      {swapToast ? (
        <div className="matchup-page__toast" role="status">
          <span>Lineup updated.</span>
          <button onClick={handleUndoSwap} type="button">
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
