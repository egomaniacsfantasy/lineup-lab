import { useState } from 'react';
import type { MatchupLine, RosterSlot, SlotLabel } from '../../types';
import {
  cacheImageFailure,
  getInitials,
  getPlayerAvatarUrl,
  hasCachedImageFailure,
} from '../../utils/playerAssets';
import './PlayerRow.css';

interface PlayerRowProps {
  slot: RosterSlot;
  referenceSlot: RosterSlot;
  slotIndex: number;
  isActive: boolean;
  isBench?: boolean;
  selectedAlternativeIndex: number | null;
  onToggleDecision: (slotIndex: number) => void;
  getOptionLine: (slotIndex: number, alternativeIndex: number | null) => MatchupLine;
}

type ImpactTier = 'pivot' | 'tap' | 'low' | 'none';

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

function getPreviewLabel(slot: RosterSlot, selectedAlternativeIndex: number | null) {
  if (selectedAlternativeIndex === null) {
    return slot.alternatives[0]?.player.shortName ?? slot.starter.shortName;
  }

  return slot.starter.shortName;
}

function getBestAlternativeDelta(slot: RosterSlot) {
  return slot.alternatives.reduce((bestDelta, alternative) => {
    const candidate = Math.abs(alternative.deltaWinProbability);
    return Math.max(bestDelta, candidate);
  }, 0);
}

function getImpactTier(slot: RosterSlot, isBench: boolean): ImpactTier {
  if (isBench || slot.alternatives.length === 0) {
    return 'none';
  }

  const bestDelta = getBestAlternativeDelta(slot);

  if (bestDelta >= 5) {
    return 'pivot';
  }

  if (bestDelta >= 1) {
    return 'tap';
  }

  return 'low';
}

function Headshot({
  imageUrl,
  logoUrl,
  fallbackLabel,
  showLogoBadge,
}: {
  imageUrl: string;
  logoUrl: string;
  fallbackLabel: string;
  showLogoBadge: boolean;
}) {
  const [hasError, setHasError] = useState(hasCachedImageFailure(imageUrl));

  return (
    <span className="player-row__avatar-wrap" aria-hidden="true">
      <span className="player-row__avatar">
        {hasError ? (
          <span className="player-row__avatar-fallback">{fallbackLabel}</span>
        ) : (
          <img
            alt=""
            className="player-row__avatar-image"
            onError={() => {
              cacheImageFailure(imageUrl);
              setHasError(true);
            }}
            src={imageUrl}
          />
        )}
      </span>
      {showLogoBadge ? (
        <span className="player-row__logo-badge">
          <img
            alt=""
            className="player-row__logo-image"
            src={logoUrl}
          />
        </span>
      ) : null}
    </span>
  );
}

export function PlayerRow({
  slot,
  referenceSlot,
  slotIndex,
  isActive,
  isBench = false,
  selectedAlternativeIndex,
  onToggleDecision,
  getOptionLine,
}: PlayerRowProps) {
  const tone = getPositionTone(slot.slotLabel);
  const impactTier = getImpactTier(referenceSlot, isBench);
  const isInteractive = impactTier !== 'none';
  const showsPivotTreatment = impactTier === 'pivot';

  const currentLine = isInteractive
    ? getOptionLine(slotIndex, selectedAlternativeIndex)
    : null;
  const previewAlternativeIndex = isInteractive
    ? selectedAlternativeIndex === null
      ? 0
      : null
    : null;
  const previewLine =
    isInteractive && previewAlternativeIndex !== undefined
      ? getOptionLine(slotIndex, previewAlternativeIndex)
      : null;
  const previewDelta =
    currentLine && previewLine
      ? previewLine.winProbability - currentLine.winProbability
      : 0;

  const previewTone =
    previewDelta > 0 ? 'positive' : previewDelta < 0 ? 'negative' : 'neutral';
  const swingLabel =
    previewDelta > 0 ? `+${previewDelta.toFixed(1)}%` : `${previewDelta.toFixed(1)}%`;

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

      <Headshot
        fallbackLabel={getInitials(slot.starter.shortName)}
        imageUrl={getPlayerAvatarUrl(slot.starter)}
        logoUrl={slot.starter.teamLogoUrl}
        showLogoBadge={slot.starter.position !== 'DEF'}
      />

      <span className="player-row__content">
        <span className="player-row__name-wrap">
          <span className="player-row__name">{slot.starter.shortName}</span>
          {showsPivotTreatment ? (
            <span className="player-row__decision-badge">Pivot</span>
          ) : null}
        </span>
        <span className="player-row__meta">
          {slot.starter.position} · {slot.starter.team}
        </span>
        {showsPivotTreatment && currentLine && previewLine ? (
          <span className="player-row__preview">
            <span className="player-row__preview-current">
              {currentLine.moneyline > 0
                ? `+${currentLine.moneyline}`
                : `${currentLine.moneyline}`}
            </span>
            <span className="player-row__preview-arrow">-&gt;</span>
            <span className={`player-row__preview-alt player-row__preview-alt--${previewTone}`}>
              {previewLine.moneyline > 0
                ? `+${previewLine.moneyline}`
                : `${previewLine.moneyline}`}
            </span>
            <span className="player-row__preview-note">
              if {getPreviewLabel(referenceSlot, selectedAlternativeIndex)}
            </span>
          </span>
        ) : null}
      </span>

      <span className="player-row__value-stack">
        {showsPivotTreatment ? (
          <>
            <span className={`player-row__delta player-row__delta--${previewTone}`}>
              {swingLabel}
            </span>
            <span className="player-row__value-label">if switch</span>
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
            `player-row__chevron--${impactTier}`,
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
          `player-row--impact-${impactTier}`,
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

  return (
    <div
      className={[
        'player-row',
        isBench ? 'player-row--bench' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {content}
    </div>
  );
}
