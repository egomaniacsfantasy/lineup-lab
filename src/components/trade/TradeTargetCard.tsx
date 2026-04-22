import type { TradeTarget } from '../../mocks/tradeTargets';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import { usePlayerDetail } from '../../contexts/PlayerDetailContext';
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

export function TradeTargetCard({
  target,
  isExpanded,
  isPrimary,
  onToggle,
  showLaunchNote,
}: TradeTargetCardProps) {
  const { openPlayerDetail } = usePlayerDetail();
  const openTargetDetail = () => {
    openPlayerDetail({
      slug: target.player.slug,
      projection: target.player.projection,
    });
  };

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
        <div
          className="trade-target-card__main"
          onClick={openTargetDetail}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openTargetDetail();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <PlayerHeadshot
            className="trade-target-card__avatar"
            fallbackClassName="trade-target-card__avatar-fallback"
            imageClassName="trade-target-card__avatar-image"
            name={target.player.name}
            position={target.player.position}
            slug={target.player.slug}
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
