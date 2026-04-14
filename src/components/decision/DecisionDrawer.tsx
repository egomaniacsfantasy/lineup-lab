import { useEffect, useId, useRef } from 'react';
import type { MatchupLine, RosterSlot } from '../../types';
import { ComparisonCard } from './ComparisonCard';
import './DecisionDrawer.css';

interface DecisionDrawerProps {
  slot: RosterSlot;
  starterLine: MatchupLine;
  starterGameLine: string;
  starterPlayerProp?: string;
  alternativeLines: MatchupLine[];
  isClosing?: boolean;
  onSelectStarter: () => void;
  onSelectAlternative: (altIndex: number) => void;
  onClose: () => void;
  selectedAlternativeIndex: number | null;
}

function getDecisionTitle(slot: RosterSlot) {
  if (slot.alternatives.length === 0) {
    return `${slot.slotLabel} decision`;
  }

  return `${slot.starter.shortName} vs ${slot.alternatives[0].player.shortName}`;
}

export function DecisionDrawer({
  slot,
  starterLine,
  starterGameLine,
  starterPlayerProp,
  alternativeLines,
  isClosing = false,
  onSelectStarter,
  onSelectAlternative,
  onClose,
  selectedAlternativeIndex,
}: DecisionDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'));

      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);

    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const currentSelectedLine =
    selectedAlternativeIndex === null
      ? starterLine
      : alternativeLines[selectedAlternativeIndex];

  return (
    <>
      <button
        aria-label="Close decision drawer"
        className={[
          'decision-drawer__overlay',
          isClosing ? 'decision-drawer__overlay--closing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={onClose}
        type="button"
      />

      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={[
          'decision-drawer',
          isClosing ? 'decision-drawer--closing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        ref={dialogRef}
        role="dialog"
        onTouchEnd={(event) => {
          if (touchStartYRef.current === null) {
            return;
          }

          const deltaY = event.changedTouches[0].clientY - touchStartYRef.current;
          touchStartYRef.current = null;

          if (deltaY > 72) {
            onClose();
          }
        }}
        onTouchStart={(event) => {
          touchStartYRef.current = event.changedTouches[0].clientY;
        }}
      >
        <div className="decision-drawer__handle-wrap">
          <button
            aria-label="Close decision drawer"
            className="decision-drawer__handle-button"
            onClick={onClose}
            type="button"
          >
            <span className="decision-drawer__handle" />
          </button>
        </div>

        <div className="decision-drawer__header">
          <div>
            <p className="decision-drawer__eyebrow">{slot.slotLabel} Decision</p>
            <h2 className="decision-drawer__title" id={titleId}>
              {getDecisionTitle(slot)}
            </h2>
            <p className="decision-drawer__subtitle" id={descriptionId}>
              Tap a player to reprice the matchup.
            </p>
          </div>
          <button
            aria-label="Close decision drawer"
            className="decision-drawer__close"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            X
          </button>
        </div>

        <div className="decision-drawer__cards">
        <ComparisonCard
          ceiling={slot.ceiling}
          deltaWinProbability={starterLine.winProbability - currentSelectedLine.winProbability}
          gameLine={starterGameLine}
          isCurrentStarter
          isSelected={selectedAlternativeIndex === null}
          key={slot.starter.id}
          onSelect={onSelectStarter}
          player={slot.starter}
            playerProp={starterPlayerProp}
            projection={slot.projection}
            resultingLine={starterLine}
            floor={slot.floor}
          />

          {slot.alternatives.map((alternative, index) => (
            <ComparisonCard
              ceiling={alternative.ceiling}
              deltaWinProbability={
                alternativeLines[index].winProbability - currentSelectedLine.winProbability
              }
              gameLine={alternative.gameLine}
              isCurrentStarter={false}
              isSelected={selectedAlternativeIndex === index}
              key={alternative.player.id}
              onSelect={() => onSelectAlternative(index)}
              player={alternative.player}
              playerProp={alternative.playerProp}
              projection={alternative.projection}
              resultingLine={alternativeLines[index]}
              floor={alternative.floor}
            />
          ))}
        </div>
      </section>
    </>
  );
}
