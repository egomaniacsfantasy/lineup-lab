import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DraftSlotGrid } from '../components/draft/DraftSlotGrid';
import { PlayerAvailability } from '../components/draft/PlayerAvailability';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { useSeasonMode } from '../hooks/useSeasonMode';
import type { DraftSlotResult, LeagueStyle } from '../types';
import { formatAmericanOdds } from '../utils/formatOdds';
import { shareText } from '../utils/share';
import {
  MOCK_CONSENSUS_RANKINGS,
  MOCK_DRAFT_SLOT_ODDS,
  MOCK_PLAYERS,
} from '../mocks';
import './DraftPage.css';

function probabilityToAmerican(probability: number) {
  const decimalProbability = probability / 100;

  if (decimalProbability >= 0.5) {
    return Math.round((-100 * decimalProbability) / (1 - decimalProbability));
  }

  return Math.round((100 * (1 - decimalProbability)) / decimalProbability);
}

function deriveDraftSlotOdds(style: LeagueStyle): DraftSlotResult {
  if (style === 'competitive') {
    return MOCK_DRAFT_SLOT_ODDS;
  }

  return {
    leagueStyle: style,
    slots: MOCK_DRAFT_SLOT_ODDS.slots.map((slot) => {
      const distanceFromMiddle = Math.abs(slot.position - 6.5) / 5.5;
      const earlyPick = slot.position <= 6;
      const styleAdjustment =
        style === 'casual'
          ? earlyPick
            ? -distanceFromMiddle * 8
            : distanceFromMiddle * 8
          : earlyPick
            ? distanceFromMiddle * 8
            : -distanceFromMiddle * 8;
      const nextProbability = Math.min(
        35,
        Math.max(7, slot.winProbability + styleAdjustment),
      );

      return {
        ...slot,
        winProbability: Number(nextProbability.toFixed(1)),
        championshipOdds: probabilityToAmerican(nextProbability),
      };
    }),
  };
}

// SCOPE: POST-MVP — draft tooling returns as a seasonal event (August),
// not a year-round tab. Keep the route and the seasonal notice.
export function DraftPage() {
  const { mode } = useSeasonMode();
  const [leagueStyle, setLeagueStyle] = useState<LeagueStyle>('competitive');
  const [selectedPosition, setSelectedPosition] = useState<number | null>(3);

  const slotOdds = useMemo(
    () => deriveDraftSlotOdds(leagueStyle),
    [leagueStyle],
  );
  const selectedSlot = slotOdds.slots.find((slot) => slot.position === selectedPosition) ?? null;
  const bestSlot = slotOdds.slots.reduce((best, slot) =>
    slot.winProbability > best.winProbability ? slot : best,
  );

  const handleShareDraftSlots = async () =>
    shareText({
      title: 'Draft slot odds',
      text: selectedSlot
        ? `Draft slot odds (${leagueStyle}): pick #${selectedSlot.position} prices at ${formatAmericanOdds(selectedSlot.championshipOdds)} with a ${selectedSlot.winProbability.toFixed(1)}% title chance. Best slot right now is #${bestSlot.position} at ${formatAmericanOdds(bestSlot.championshipOdds)}.`
        : `Draft slot odds (${leagueStyle}): best slot right now is #${bestSlot.position} at ${formatAmericanOdds(bestSlot.championshipOdds)} with a ${bestSlot.winProbability.toFixed(1)}% title chance.`,
      url: window.location.href,
    });

  return (
    <div className="draft-page">
      <h1 className="visually-hidden">Draft tools</h1>

      {mode === 'inseason' ? (
        <SeasonalNotice>
          Draft tools open in August. These boards replay your 2024 draft.
        </SeasonalNotice>
      ) : null}

      <DraftSlotGrid
        draftSlotResult={slotOdds}
        leagueStyle={leagueStyle}
        onLeagueStyleChange={setLeagueStyle}
        onSelectPosition={setSelectedPosition}
        onShare={handleShareDraftSlots}
        selectedPosition={selectedPosition}
      />

      <div className="draft-page__secondary">
        <PlayerAvailability
          leagueStyle={leagueStyle}
          onLeagueStyleChange={setLeagueStyle}
          players={Object.values(MOCK_PLAYERS)}
          rankings={MOCK_CONSENSUS_RANKINGS}
        />

        <section className="draft-page__cta">
          <p className="draft-page__cta-kicker">Build trade values</p>
          <h2 className="draft-page__cta-title">
            Rank 5 players to shape consensus values and enter the weekly Pro raffle.
          </h2>
          <Link className="draft-page__cta-link" to="/rankings">
            Rank players
          </Link>
        </section>
      </div>
    </div>
  );
}
