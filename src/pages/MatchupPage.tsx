import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DecisionPanel } from '../components/decision/DecisionPanel';
import { CompareWidget } from '../components/matchup/CompareWidget';
import { LineChangeFlash } from '../components/matchup/LineChangeFlash';
import { MatchupCard } from '../components/matchup/MatchupCard';
import { OneMoveRow } from '../components/matchup/OneMoveRow';
import { QuickActions } from '../components/matchup/QuickActions';
import { WeeklyRecapCard } from '../components/matchup/WeeklyRecapCard';
import { RosterList } from '../components/roster/RosterList';
import { useMatchupEngine } from '../hooks/useMatchupEngine';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSeasonMode } from '../hooks/useSeasonMode';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { toMatchupData } from '../adapters/connectedLeague';
import { usePlayerDetail } from '../contexts/PlayerDetailContext';
import {
  MOCK_LINEUP_LOCKS,
  MOCK_MATCHUP,
  MOCK_PLAYER_POOL,
  MOCK_TRADE_TARGET_GROUPS,
  MOCK_WAIVER_SUGGESTION,
} from '../mocks';
import { MatchupPreseason } from './MatchupPreseason';
import { setStoredCascadeScenarioLabel } from '../utils/seasonSelection';
import {
  evaluateStarterRoster,
  getTopSwapEvaluation,
} from '../utils/starterEvaluation';
import type { MatchupData, Player, RosterSlot } from '../types';
import { getWeek8ReplayGameLine } from '../data/playerManifest';
import './MatchupPage.css';

function getBestAlternative(slot: RosterSlot) {
  return slot.alternatives.reduce<(typeof slot.alternatives)[number] | null>(
    (bestAlternative, alternative) => {
      if (!bestAlternative) {
        return alternative;
      }

      if (alternative.deltaWinProbability > 0 && bestAlternative.deltaWinProbability <= 0) {
        return alternative;
      }

      if (alternative.deltaWinProbability <= 0 && bestAlternative.deltaWinProbability > 0) {
        return bestAlternative;
      }

      return alternative.deltaWinProbability > bestAlternative.deltaWinProbability
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

interface MatchupLiveProps {
  matchup: MatchupData;
  isConnected: boolean;
  isPriced?: boolean;
  scoringNote?: string | null;
  unpricedStarterCount?: number;
  seasonLabel?: string;
}

function MatchupLive({
  matchup,
  isConnected,
  isPriced = false,
  scoringNote = null,
  unpricedStarterCount = 0,
  seasonLabel,
}: MatchupLiveProps) {
  const { isOpen: isPlayerDetailOpen, openPlayerDetail } = usePlayerDetail();
  const engine = useMatchupEngine(matchup);
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
  const [isLineupOpen, setIsLineupOpen] = useState(false);
  const [pendingSwapSlotIndex, setPendingSwapSlotIndex] = useState<number | null>(null);
  const [highlightedSwapSlotIndex, setHighlightedSwapSlotIndex] = useState<number | null>(null);
  const [swapToast, setSwapToast] = useState<{
    previousAlternativeIndex: number | null;
    slotIndex: number;
  } | null>(null);
  const swapToastTimerRef = useRef<number | null>(null);

  const availablePlayers = useMemo(
    () => MOCK_PLAYER_POOL,
    [],
  );
  const playerMap = useMemo(
    () => new Map(availablePlayers.map((player) => [player.id, player])),
    [availablePlayers],
  );
  const playerContexts = useMemo(() => {
    const contexts: Record<string, { gameLine: string; playerProp?: string }> = {};

    engine.baselineRoster.forEach((slot) => {
      contexts[slot.starter.id] = {
        gameLine: getWeek8ReplayGameLine(slot.starter.slug ?? slot.starter.id),
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

  const prefillCompare = useCallback((playerId: string) => {
    setCompareSelection((current) =>
      current.leftId === playerId
        ? current
        : { leftId: playerId, rightId: current.rightId === playerId ? null : current.rightId },
    );
  }, []);

  const handleOpenBiggestSwing = useCallback((slotIndex: number) => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }

    setIsLineupOpen(true);
    setHighlightedSwapSlotIndex(slotIndex);

    window.setTimeout(() => {
      document
        .querySelector(`[data-roster-slot-index="${slotIndex}"]`)
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
    }, 60);

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedSwapSlotIndex(null);
      highlightTimerRef.current = null;
    }, 1000);
  }, []);

  useEffect(() => {
    const topSwap = topSwapEvaluation;

    if (!topSwap?.bestBenchAlternative) {
      return;
    }

    const selectedAlternative = engine.selectedAlternatives[topSwap.slotIndex] ?? null;
    const nextLabel =
      selectedAlternative === null
        ? `Start ${topSwap.currentStarter.shortName}`
        : `Start ${topSwap.bestBenchAlternative.player.shortName}`;

    setStoredCascadeScenarioLabel(nextLabel);
  }, [engine.selectedAlternatives, topSwapEvaluation]);

  useEffect(() => {
    if (!hasActivatedCompare || !compareResult) {
      return;
    }

    engine.selectPlayer(compareResult.slotIndex, compareResult.rightSelectionIndex);
  }, [compareResult, engine, hasActivatedCompare]);

  useEffect(() => {
    const handleHighlightSlot = (event: Event) => {
      const slotIndex = (event as CustomEvent<{ slotIndex?: number }>).detail?.slotIndex;

      if (typeof slotIndex !== 'number') {
        return;
      }

      handleOpenBiggestSwing(slotIndex);
    };

    window.addEventListener('lineuplab:highlight-slot', handleHighlightSlot);

    return () => {
      window.removeEventListener('lineuplab:highlight-slot', handleHighlightSlot);

      if (swapToastTimerRef.current !== null) {
        window.clearTimeout(swapToastTimerRef.current);
      }

      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, [handleOpenBiggestSwing]);

  const activeSlotIndex = engine.activeDecisionSlot;
  const activeSlot =
    activeSlotIndex !== null ? engine.baselineRoster[activeSlotIndex] : null;
  const selectedAlternativeIndex =
    activeSlotIndex !== null
      ? engine.selectedAlternatives[activeSlotIndex] ?? null
      : null;

  const starterContext =
    activeSlot !== null
      ? {
          gameLine: getWeek8ReplayGameLine(activeSlot.starter.slug ?? activeSlot.starter.id),
          playerProp: undefined,
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

  const handleRosterInteraction = (slotIndex: number) => {
    const slot = engine.baselineRoster[slotIndex];

    if (slot) {
      const selectedIndex = engine.selectedAlternatives[slotIndex] ?? null;
      const tappedPlayer =
        selectedIndex === null
          ? slot.starter
          : slot.alternatives[selectedIndex]?.player ?? slot.starter;
      prefillCompare(tappedPlayer.id);
    }

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

  const handleOpenPlayerDetail = (request: Parameters<typeof openPlayerDetail>[0]) => {
    if (request.player) {
      prefillCompare(request.player.id);
    }

    openPlayerDetail(request);
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
      <h1 className="visually-hidden">The Olympus matchup dashboard</h1>

      <div className="matchup-page__main">
        <LineChangeFlash
          delta={engine.lastChangeDelta}
          visible={engine.lastChangeDelta !== 0}
        />

        <div className="matchup-page__market-stack">
          <p className="matchup-page__thesis">
            Every lineup decision moves your line.
          </p>
          {scoringNote ? <SeasonalNotice>{scoringNote}</SeasonalNotice> : null}
          {unpricedStarterCount > 0 ? (
            <SeasonalNotice>
              {unpricedStarterCount} of your starters{' '}
              {unpricedStarterCount === 1 ? 'is' : 'are'} not in the projection
              sheet, so this line is reduced-confidence.
            </SeasonalNotice>
          ) : null}
          <MatchupCard
            activeLine={engine.activeLine}
            activeRoster={engine.roster}
            isProvisional={isConnected && !isPriced}
            matchup={matchup}
            seasonLabel={seasonLabel}
          />
        </div>

        <OneMoveRow
          biggestSwing={biggestSwing}
          onExpandLineup={() => {
            setIsLineupOpen(true);

            if (biggestSwing) {
              handleOpenBiggestSwing(biggestSwing.slotIndex);
            }
          }}
        />

        {!isDesktop ? (
          <QuickActions
            biggestSwing={biggestSwing}
            lineupLocks={MOCK_LINEUP_LOCKS}
            onCompareBiggestSwing={() => {
              if (!biggestSwing) {
                return;
              }

              handleOpenBiggestSwing(biggestSwing.slotIndex);
            }}
            topTradeTarget={isConnected ? null : topTradeTarget}
            waiverSuggestion={isConnected ? null : MOCK_WAIVER_SUGGESTION}
          />
        ) : null}

        <section className="matchup-page__lineup">
          <button
            aria-expanded={isLineupOpen}
            className="matchup-page__lineup-toggle"
            onClick={() => setIsLineupOpen((open) => !open)}
            type="button"
          >
            <span className="matchup-page__lineup-title">Your lineup</span>
            <span className="matchup-page__lineup-meta">
              {starterEvaluations.filter((evaluation) => evaluation.state === 'SWAP')
                .length}{' '}
              swap targets · {engine.bench.length} bench
            </span>
            <span aria-hidden="true" className="matchup-page__lineup-chevron">
              {isLineupOpen ? '−' : '+'}
            </span>
          </button>

          {isLineupOpen ? (
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
              onOpenPlayerDetail={handleOpenPlayerDetail}
              onToggleDecision={handleRosterInteraction}
              pendingSwapSlotIndex={isDesktop ? pendingSwapSlotIndex : null}
              roster={engine.roster}
              selectedAlternatives={engine.selectedAlternatives}
              starterEvaluations={starterEvaluations}
            />
          ) : null}
        </section>

        {!isDesktop ? (
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
              onOpenPlayerDetail={(player, projection) =>
                handleOpenPlayerDetail({
                  player,
                  slug: player.slug ?? player.id,
                  projection,
                  gameLine: playerContexts[player.id]?.gameLine,
                })
              }
              playerContexts={playerContexts}
              players={availablePlayers}
              rightPlayer={rightPlayer}
            />
          </div>
        ) : null}

        {!isConnected ? <WeeklyRecapCard /> : null}
      </div>

      {isDesktop ? (
        <aside className="matchup-page__sidebar">
          <div
            className={[
              'matchup-page__sidebar-stack',
              isPlayerDetailOpen ? 'matchup-page__sidebar-stack--detail-open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <QuickActions
              biggestSwing={biggestSwing}
              lineupLocks={MOCK_LINEUP_LOCKS}
              onCompareBiggestSwing={() => {
                if (!biggestSwing) {
                  return;
                }

                handleOpenBiggestSwing(biggestSwing.slotIndex);
              }}
              topTradeTarget={isConnected ? null : topTradeTarget}
              waiverSuggestion={isConnected ? null : MOCK_WAIVER_SUGGESTION}
            />

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
                onOpenPlayerDetail={(player, projection) =>
                  handleOpenPlayerDetail({
                    player,
                    slug: player.slug ?? player.id,
                    projection,
                    gameLine: playerContexts[player.id]?.gameLine,
                  })
                }
                playerContexts={playerContexts}
                players={availablePlayers}
                rightPlayer={rightPlayer}
              />
            </div>
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


export function MatchupPage() {
  const { mode } = useSeasonMode();
  const { bootstrap, pricing } = useLeagueConnection();

  const connectedMatchup = bootstrap ? toMatchupData(bootstrap, pricing) : null;

  if (!connectedMatchup && mode === 'preseason') {
    return <MatchupPreseason />;
  }

  return (
    <MatchupLive
      isConnected={connectedMatchup !== null}
      isPriced={Boolean(pricing?.available)}
      scoringNote={pricing?.available ? pricing.scoringNote ?? null : null}
      unpricedStarterCount={
        pricing?.available && bootstrap
          ? (pricing.lines
              ?.flatMap((l) => Object.entries(l.sides))
              .find(([rosterId]) =>
                bootstrap.teams.some(
                  (t) => t.isUser && String(t.rosterId) === rosterId,
                ),
              )?.[1].unpricedStarters.length ?? 0)
          : 0
      }
      seasonLabel={
        connectedMatchup && bootstrap
          ? `${bootstrap.league.season} season`
          : undefined
      }
      key={connectedMatchup ? `league-${bootstrap?.league.id}-${bootstrap?.week}` : 'demo'}
      matchup={connectedMatchup ?? MOCK_MATCHUP}
    />
  );
}
