import type { RosterSlot, SlotLabel } from '../../types';
import type { PlayerDetailRequest } from '../../contexts/PlayerDetailContext';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import type { StarterEvaluation } from '../../utils/starterEvaluation';
import { getPlayerLastName } from '../../utils/starterEvaluation';
import './PlayerRow.css';

interface PlayerRowProps {
  slot: RosterSlot;
  slotIndex: number;
  isActive: boolean;
  isBench?: boolean;
  evaluation: StarterEvaluation | null;
  selectedAlternativeIndex: number | null;
  detailRequest?: PlayerDetailRequest;
  onOpenPlayerDetail?: (request: PlayerDetailRequest) => void;
  onToggleDecision: (slotIndex: number) => void;
}

function getPositionTone(slotLabel: SlotLabel) {
  switch (slotLabel) {
    case 'QB':
      return 'qb';
    case 'RB':
      return 'rb';
    case 'WR':
      return 'wr';
    case 'TE':
      return 'te';
    case 'K':
      return 'k';
    case 'DEF':
      return 'def';
    case 'FLEX':
      return 'flex';
    default:
      return 'wr';
  }
}

function formatDelta(delta: number) {
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

export function PlayerRow({
  slot,
  slotIndex,
  isActive,
  isBench = false,
  evaluation,
  selectedAlternativeIndex,
  detailRequest,
  onOpenPlayerDetail,
  onToggleDecision,
}: PlayerRowProps) {
  const tone = getPositionTone(slot.slotLabel);
  const isRecommendedAlternativeStarted =
    evaluation?.alternativeIndex !== null &&
    evaluation?.alternativeIndex !== undefined &&
    selectedAlternativeIndex === evaluation.alternativeIndex;
  const visualState =
    isBench || isRecommendedAlternativeStarted ? 'OPTIMAL' : evaluation?.state ?? 'OPTIMAL';
  const isSwapState = Boolean(
    visualState === 'SWAP' && evaluation?.bestBenchAlternative && evaluation.delta > 0,
  );
  const isTightCallState = Boolean(
    visualState === 'TIGHT_CALL' && evaluation?.bestBenchAlternative,
  );
  const isInteractive = Boolean(isSwapState);
  const swingLabel = evaluation ? formatDelta(evaluation.delta) : '';
  const alternativeShortName = evaluation?.bestBenchAlternative?.player.shortName ?? '';
  const alternativeLastName = evaluation?.bestBenchAlternative
    ? getPlayerLastName(evaluation.bestBenchAlternative.player.shortName)
    : '';
  const tightCallDelta = evaluation ? formatDelta(Math.abs(evaluation.delta)) : '';

  const content = (
    <>
      <span
        className={[
          'player-row__position',
          `player-row__position--${tone}`,
          isBench ? 'player-row__position--bench' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {slot.slotLabel}
      </span>

      <span className="player-row__avatar-wrap" aria-hidden="true">
        <PlayerHeadshot
          className="player-row__avatar"
          fallbackClassName="player-row__avatar-fallback"
          imageClassName="player-row__avatar-image"
          player={slot.starter}
        />
        {slot.starter.position !== 'DEF' ? (
          <span className="player-row__logo-badge">
            <img
              alt=""
              className="player-row__logo-image"
              src={slot.starter.teamLogoUrl}
            />
          </span>
        ) : null}
      </span>

      <span className="player-row__content">
        <span className="player-row__name-wrap">
          <span className="player-row__name">{slot.starter.shortName}</span>
          {isSwapState ? (
            <span className="player-row__decision-badge">
              Swap
            </span>
          ) : null}
        </span>
        <span className="player-row__meta">
          {slot.starter.position} · {slot.starter.team}
        </span>
        {isTightCallState ? (
          <span className="player-row__tight-call">
            Tight call. {alternativeLastName} within {tightCallDelta}.
          </span>
        ) : null}
        {isSwapState ? (
          <span className="player-row__preview">
            <span className="player-row__preview-note">Start {alternativeShortName}</span>
            <span className="player-row__preview-arrow">·</span>
            <span className="player-row__preview-gain">{swingLabel}</span>
          </span>
        ) : null}
      </span>

      <span className="player-row__value-stack">
        {isSwapState ? (
          <>
            <span className="player-row__delta">
              {swingLabel}
            </span>
            <span className="player-row__value-label">
              swap +%
            </span>
          </>
        ) : (
          <>
            <span className="player-row__value">{slot.projection.toFixed(1)}</span>
            <span className="player-row__value-label">pts</span>
          </>
        )}
      </span>

      {isInteractive ? (
        <span
          className={[
            'player-row__chevron',
            'player-row__chevron--swap',
          ].join(' ')}
          aria-hidden="true"
        >
          &gt;
        </span>
      ) : null}
    </>
  );

  if (isInteractive) {
    return (
      <button
        className={[
          'player-row',
          'player-row--interactive',
          'player-row--state-swap',
          isActive ? 'player-row--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-expanded={isActive}
        onClick={() => onToggleDecision(slotIndex)}
        type="button"
      >
        {content}
      </button>
    );
  }

  if (detailRequest && onOpenPlayerDetail) {
    return (
      <button
        className={[
          'player-row',
          'player-row--detail',
          !isBench ? `player-row--state-${visualState.toLowerCase().replace('_', '-')}` : '',
          isBench ? 'player-row--bench' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onOpenPlayerDetail(detailRequest)}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={[
        'player-row',
        !isBench ? `player-row--state-${visualState.toLowerCase().replace('_', '-')}` : '',
        isBench ? 'player-row--bench' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {content}
    </div>
  );
}
