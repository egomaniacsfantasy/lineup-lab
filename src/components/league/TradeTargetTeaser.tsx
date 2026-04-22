import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { TradeTargetGroup } from '../../mocks/tradeTargets';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import './TradeTargetTeaser.css';

interface TradeTargetTeaserProps {
  groups: TradeTargetGroup[];
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

export function TradeTargetTeaser({ groups }: TradeTargetTeaserProps) {
  const topTargets = useMemo(
    () =>
      groups
        .flatMap((group) => group.targets)
        .sort((targetA, targetB) => targetB.fitScore - targetA.fitScore)
        .slice(0, 3),
    [groups],
  );

  return (
    <section aria-labelledby="trade-target-teaser-title" className="trade-target-teaser">
      <div className="trade-target-teaser__header">
        <div className="trade-target-teaser__copy">
          <p className="trade-target-teaser__kicker">Trade targets</p>
          <h2 className="trade-target-teaser__title" id="trade-target-teaser-title">
            Players you could actually get this week
          </h2>
        </div>

        <Link className="trade-target-teaser__link" to="/trade">
          See all in trade →
        </Link>
      </div>

      <div className="trade-target-teaser__cards">
        {topTargets.map((target) => (
          <Link
            className="trade-target-teaser__card"
            key={target.id}
            to={`/trade#trade-target-${target.id}`}
          >
            <PlayerHeadshot
              className="trade-target-teaser__avatar"
              fallbackClassName="trade-target-teaser__avatar-fallback"
              imageClassName="trade-target-teaser__avatar-image"
              name={target.player.name}
              position={target.player.position}
              slug={target.player.slug}
            />
            <span className="trade-target-teaser__name">{target.player.name}</span>
            <span className="trade-target-teaser__meta">
              {target.player.position} · {target.player.team}
            </span>
            <span className="trade-target-teaser__stat">
              {target.player.positionRank} · {target.player.projection.toFixed(1)} pts
            </span>
            <span
              className={[
                'trade-target-teaser__fit',
                `trade-target-teaser__fit--${getFitTone(target.fitScore)}`,
              ].join(' ')}
            >
              {target.fitScore}% fit
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
