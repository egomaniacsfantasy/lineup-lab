import { useMemo } from 'react';
import type { DraftSlotResult, LeagueStyle } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { LeagueStyleToggle } from './LeagueStyleToggle';
import './DraftSlotGrid.css';

interface DraftSlotGridProps {
  draftSlotResult: DraftSlotResult;
  leagueStyle: LeagueStyle;
  onLeagueStyleChange: (value: LeagueStyle) => void;
  selectedPosition: number | null;
  onSelectPosition: (position: number) => void;
  onShare: () => void;
}

function getSlotTone(position: number) {
  if (position <= 3) {
    return 'premium';
  }

  if (position <= 6) {
    return 'strong';
  }

  if (position <= 9) {
    return 'balanced';
  }

  return 'thin';
}

export function DraftSlotGrid({
  draftSlotResult,
  leagueStyle,
  onLeagueStyleChange,
  selectedPosition,
  onSelectPosition,
  onShare,
}: DraftSlotGridProps) {
  const topCell = useMemo(
    () => draftSlotResult.slots.reduce((best, slot) =>
      slot.winProbability > best.winProbability ? slot : best,
    ),
    [draftSlotResult.slots],
  );

  return (
    <section aria-labelledby="draft-slot-grid-title" className="draft-slot-grid">
      <div className="draft-slot-grid__header">
        <div className="draft-slot-grid__header-copy">
          <p className="draft-slot-grid__kicker">Draft slot odds</p>
          <h2 className="draft-slot-grid__title" id="draft-slot-grid-title">
            Championship probability by draft position
          </h2>
        </div>

        <LeagueStyleToggle value={leagueStyle} onChange={onLeagueStyleChange} />
      </div>

      <div className="draft-slot-grid__board">
        {draftSlotResult.slots.map((slot) => (
          <button
            key={slot.position}
            className={[
              'draft-slot-grid__cell',
              `draft-slot-grid__cell--${getSlotTone(slot.position)}`,
              selectedPosition === slot.position ? 'draft-slot-grid__cell--selected' : '',
              topCell.position === slot.position ? 'draft-slot-grid__cell--top' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelectPosition(slot.position)}
            type="button"
          >
            <span className="draft-slot-grid__position">#{slot.position}</span>
            <span className="draft-slot-grid__odds">
              {formatAmericanOdds(slot.championshipOdds)}
            </span>
            <span className="draft-slot-grid__probability">
              {slot.winProbability.toFixed(1)}%
            </span>
            <span className="draft-slot-grid__record">{slot.projectedRecord}</span>
          </button>
        ))}
      </div>

      <button className="draft-slot-grid__share" onClick={onShare} type="button">
        Share draft slot odds
      </button>
    </section>
  );
}
