import type { BenchPlayer, MatchupLine, RosterSlot } from '../../types';
import { PlayerRow } from './PlayerRow';
import './RosterList.css';

interface RosterListProps {
  roster: RosterSlot[];
  baselineRoster: RosterSlot[];
  bench: BenchPlayer[];
  activeDecisionSlot: number | null;
  selectedAlternatives: Record<number, number | null>;
  onToggleDecision: (slotIndex: number) => void;
  getOptionLine: (slotIndex: number, alternativeIndex: number | null) => MatchupLine;
}

export function RosterList({
  roster,
  baselineRoster,
  bench,
  activeDecisionSlot,
  selectedAlternatives,
  onToggleDecision,
  getOptionLine,
}: RosterListProps) {
  const interactiveCount = baselineRoster.filter(
    (slot) => slot.alternatives.length > 0,
  ).length;

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
        {roster.map((slot, slotIndex) => (
          <PlayerRow
            getOptionLine={getOptionLine}
            isActive={activeDecisionSlot === slotIndex}
            key={`${slot.slotLabel}-${baselineRoster[slotIndex]?.starter.id ?? slotIndex}`}
            onToggleDecision={onToggleDecision}
            referenceSlot={baselineRoster[slotIndex]}
            selectedAlternativeIndex={selectedAlternatives[slotIndex] ?? null}
            slot={slot}
            slotIndex={slotIndex}
          />
        ))}
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
