import { useEffect, useRef, useState } from 'react';
import type { BenchPlayer, MatchupLine, RosterSlot } from '../../types';
import { PlayerRow } from './PlayerRow';
import { StarterSwapConfirm } from './StarterSwapConfirm';
import './RosterList.css';

interface RosterListProps {
  roster: RosterSlot[];
  baselineRoster: RosterSlot[];
  bench: BenchPlayer[];
  activeDecisionSlot: number | null;
  pendingSwapSlotIndex: number | null;
  selectedAlternatives: Record<number, number | null>;
  onCancelSwapConfirm: () => void;
  onConfirmSwap: (slotIndex: number, alternativeIndex: number | null) => void;
  onToggleDecision: (slotIndex: number) => void;
  getOptionLine: (slotIndex: number, alternativeIndex: number | null) => MatchupLine;
}

export function RosterList({
  roster,
  baselineRoster,
  bench,
  activeDecisionSlot,
  pendingSwapSlotIndex,
  selectedAlternatives,
  onCancelSwapConfirm,
  onConfirmSwap,
  onToggleDecision,
  getOptionLine,
}: RosterListProps) {
  const confirmWrapRef = useRef<HTMLDivElement | null>(null);
  const [renderedSwapSlotIndex, setRenderedSwapSlotIndex] = useState<number | null>(
    pendingSwapSlotIndex,
  );
  const interactiveCount = baselineRoster.filter(
    (slot) => slot.alternatives.length > 0,
  ).length;

  useEffect(() => {
    const collapseDelay = pendingSwapSlotIndex === null ? 200 : 0;
    const renderTimer = window.setTimeout(() => {
      setRenderedSwapSlotIndex(pendingSwapSlotIndex);
    }, collapseDelay);

    return () => {
      window.clearTimeout(renderTimer);
    };
  }, [pendingSwapSlotIndex]);

  useEffect(() => {
    if (pendingSwapSlotIndex === null) {
      return undefined;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (confirmWrapRef.current?.contains(target)) {
        return;
      }

      onCancelSwapConfirm();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelSwapConfirm();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancelSwapConfirm, pendingSwapSlotIndex]);

  return (
    <section aria-labelledby="roster-title" className="roster-list">
      <div className="roster-list__header">
        <h2 className="roster-list__label" id="roster-title">
          Starters
        </h2>
        <p className="roster-list__meta">
          {interactiveCount} swappable starter{interactiveCount === 1 ? '' : 's'}
        </p>
      </div>

      <div className="roster-list__items">
        {roster.map((slot, slotIndex) => {
          const referenceSlot = baselineRoster[slotIndex];
          const selectedAlternativeIndex = selectedAlternatives[slotIndex] ?? null;
          const targetAlternativeIndex =
            selectedAlternativeIndex === null ? 0 : null;
          const currentPlayer =
            selectedAlternativeIndex === null
              ? referenceSlot.starter
              : referenceSlot.alternatives[selectedAlternativeIndex]?.player ??
                referenceSlot.starter;
          const targetPlayer =
            targetAlternativeIndex === null
              ? referenceSlot.starter
              : referenceSlot.alternatives[targetAlternativeIndex]?.player;
          const currentLine = getOptionLine(slotIndex, selectedAlternativeIndex);
          const shouldRenderSwapConfirm = renderedSwapSlotIndex === slotIndex;
          const isSwapConfirmOpen = pendingSwapSlotIndex === slotIndex;
          const targetLine =
            targetPlayer && shouldRenderSwapConfirm
              ? getOptionLine(slotIndex, targetAlternativeIndex)
              : null;

          return (
            <div
              className="roster-list__starter"
              data-roster-slot-index={slotIndex}
              key={`${slot.slotLabel}-${baselineRoster[slotIndex]?.starter.id ?? slotIndex}`}
            >
              <PlayerRow
                getOptionLine={getOptionLine}
                isActive={activeDecisionSlot === slotIndex}
                onToggleDecision={onToggleDecision}
                referenceSlot={referenceSlot}
                selectedAlternativeIndex={selectedAlternativeIndex}
                slot={slot}
                slotIndex={slotIndex}
              />

              <div
                className={[
                  'roster-list__swap-confirm-shell',
                  isSwapConfirmOpen ? 'roster-list__swap-confirm-shell--open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                ref={shouldRenderSwapConfirm ? confirmWrapRef : null}
              >
                {shouldRenderSwapConfirm && targetPlayer && targetLine ? (
                  <StarterSwapConfirm
                    currentPlayerName={currentPlayer.shortName}
                    currentWinProbability={currentLine.winProbability}
                    deltaWinProbability={
                      targetLine.winProbability - currentLine.winProbability
                    }
                    onCancel={onCancelSwapConfirm}
                    onConfirm={() => onConfirmSwap(slotIndex, targetAlternativeIndex)}
                    targetPlayerName={targetPlayer.shortName}
                    targetWinProbability={targetLine.winProbability}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="roster-list__bench-header">
        <h3 className="roster-list__bench-label">Bench</h3>
        <p className="roster-list__bench-meta">{bench.length} players</p>
      </div>

      <div className="roster-list__items roster-list__items--bench">
        {bench.map((benchPlayer, benchIndex) => {
          const benchSlot: RosterSlot = {
            slotLabel: benchPlayer.player.position,
            starter: benchPlayer.player,
            projection: benchPlayer.projection,
            floor: 0,
            ceiling: 0,
            isDecisionSlot: false,
            alternatives: [],
          };

          return (
            <PlayerRow
              getOptionLine={getOptionLine}
              isActive={false}
              isBench
              key={`bench-${benchPlayer.player.id}-${benchIndex}`}
              onToggleDecision={onToggleDecision}
              referenceSlot={benchSlot}
              selectedAlternativeIndex={null}
              slot={benchSlot}
              slotIndex={-1}
            />
          );
        })}
      </div>
    </section>
  );
}
