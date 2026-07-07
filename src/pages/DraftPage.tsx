import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DraftSlotGrid } from '../components/draft/DraftSlotGrid';
import { PlayerAvailability } from '../components/draft/PlayerAvailability';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { useSeasonMode } from '../hooks/useSeasonMode';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
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

function normalizeSlots(slots: DraftSlotResult['slots']) {
  const total = slots.reduce((sum, slot) => sum + slot.winProbability, 0) || 1;
  return slots.map((slot) => {
    const winProbability = Number(((slot.winProbability / total) * 100).toFixed(1));
    return {
      ...slot,
      winProbability,
      championshipOdds: probabilityToAmerican(winProbability),
    };
  });
}

function deriveDraftSlotOdds(style: LeagueStyle, slotCount: number): DraftSlotResult {
  const baseSlots = MOCK_DRAFT_SLOT_ODDS.slots.slice(0, slotCount);
  if (style === 'competitive') {
    return { ...MOCK_DRAFT_SLOT_ODDS, slots: normalizeSlots(baseSlots) };
  }

  return {
    leagueStyle: style,
    slots: normalizeSlots(baseSlots.map((slot) => {
      const midpoint = (slotCount + 1) / 2;
      const distanceFromMiddle = Math.abs(slot.position - midpoint) / Math.max(1, midpoint - 1);
      const earlyPick = slot.position <= midpoint;
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
    })),
  };
}

// SCOPE: POST-MVP — draft tooling returns as a seasonal event (August),
// not a year-round tab. Keep the route and the seasonal notice.
export function DraftPage() {
  const { mode } = useSeasonMode();
  const { bootstrap } = useLeagueConnection();
  const [leagueStyle, setLeagueStyle] = useState<LeagueStyle>('competitive');
  const [selectedPosition, setSelectedPosition] = useState<number | null>(3);
  const slotCount = bootstrap?.league.totalTeams ?? MOCK_DRAFT_SLOT_ODDS.slots.length;
  const draftSeason = bootstrap?.league.season ?? '2026';

  const slotOdds = useMemo(
    () => deriveDraftSlotOdds(leagueStyle, slotCount),
    [leagueStyle, slotCount],
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
          Draft tools open in August. {draftSeason} boards are parked for now.
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
          slotCount={slotCount}
          leagueStyle={leagueStyle}
          onLeagueStyleChange={setLeagueStyle}
          players={Object.values(MOCK_PLAYERS)}
          rankings={MOCK_CONSENSUS_RANKINGS}
        />

        <section className="draft-page__cta">
          <p className="draft-page__cta-kicker">Build trade values</p>
          <h2 className="draft-page__cta-title">
            Rank 5 players to shape consensus values.
          </h2>
          <Link className="draft-page__cta-link" to="/rankings">
            Rank players
          </Link>
        </section>
      </div>
    </div>
  );
}
