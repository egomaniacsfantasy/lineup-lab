import { useState } from 'react';
import type { TradeTarget } from '../../mocks/tradeTargets';
import {
  cacheImageFailure,
  getInitials,
  hasCachedImageFailure,
} from '../../utils/playerAssets';
import { SuggestedPackage } from './SuggestedPackage';
import './TradeTargetCard.css';

interface TradeTargetCardProps {
  target: TradeTarget;
  isExpanded: boolean;
  isPrimary: boolean;
  onToggle: () => void;
  showLaunchNote: boolean;
}

function getFitTone(fitScore: number) {
  if (fitScore >= 80) {
    return 'strong';
  }

  if (fitScore >= 60) {
    return 'mid';
  }

  return 'soft';
}

function TradeAvatar({
  name,
  src,
}: {
  name: string;
  src: string;
}) {
  const [hasImageError, setHasImageError] = useState(hasCachedImageFailure(src));

  return (
    <span aria-hidden="true" className="trade-target-card__avatar">
      {hasImageError ? (
        <span className="trade-target-card__avatar-fallback">{getInitials(name)}</span>
      ) : (
        <img
          alt=""
          className="trade-target-card__avatar-image"
          onError={() => {
            cacheImageFailure(src);
            setHasImageError(true);
          }}
          src={src}
        />
      )}
    </span>
  );
}

export function TradeTargetCard({
  target,
  isExpanded,
  isPrimary,
  onToggle,
  showLaunchNote,
}: TradeTargetCardProps) {
  return (
    <article
      className={[
        'trade-target-card',
        isPrimary ? 'trade-target-card--primary' : '',
        isExpanded ? 'trade-target-card--expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      id={`trade-target-${target.id}`}
    >
      <div className="trade-target-card__content">
        <div className="trade-target-card__main">
          <TradeAvatar
            name={target.player.name}
            src={target.player.headshotUrl}
          />

          <div className="trade-target-card__copy">
            <div className="trade-target-card__headline">
              <div className="trade-target-card__headline-copy">
                <h3 className="trade-target-card__name">{target.player.name}</h3>
                <p className="trade-target-card__meta">
                  {target.player.position} · {target.player.team} · {target.player.positionRank}
                </p>
              </div>

              <span
                className={[
                  'trade-target-card__fit',
                  `trade-target-card__fit--${getFitTone(target.fitScore)}`,
                ].join(' ')}
              >
                {target.fitScore}% fit
              </span>
            </div>

            <p className="trade-target-card__projection">
              {target.player.projection.toFixed(1)} pts/wk projected
            </p>
            <p className="trade-target-card__from">
              From: {target.teamName} ({target.record})
            </p>
            <p className="trade-target-card__line">{target.tradeLine}</p>
          </div>
        </div>

        <button
          aria-expanded={isExpanded}
          className="trade-target-card__button"
          onClick={onToggle}
          type="button"
        >
          {isExpanded ? 'Hide trade' : 'Explore trade →'}
        </button>
      </div>

      <SuggestedPackage
        isExpanded={isExpanded}
        package={target.suggestedPackage}
        showLaunchNote={showLaunchNote}
      />
    </article>
  );
}
