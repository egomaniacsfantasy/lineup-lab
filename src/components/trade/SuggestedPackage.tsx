import { formatAmericanOdds } from '../../utils/formatOdds';
import type { SuggestedPackage as SuggestedPackageData } from '../../mocks/tradeTargets';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import { Gloss } from '../ui/Gloss';
import './SuggestedPackage.css';

interface SuggestedPackageProps {
  package: SuggestedPackageData;
  isExpanded: boolean;
  showLaunchNote: boolean;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}%`;
}

function PackagePlayer({
  label,
  player,
}: {
  label: string;
  player: SuggestedPackageData['youSend'][number];
}) {
  return (
    <div className="trade-suggested-package__player">
      <span className="trade-suggested-package__column-label">{label}</span>
      <div className="trade-suggested-package__player-card">
        <PlayerHeadshot
          className="trade-suggested-package__avatar"
          fallbackClassName="trade-suggested-package__avatar-fallback"
          imageClassName="trade-suggested-package__avatar-image"
          name={player.name}
          position={player.position}
          slug={player.slug}
        />
        <div className="trade-suggested-package__player-copy">
          <span className="trade-suggested-package__player-name">{player.name}</span>
          <span className="trade-suggested-package__player-meta">
            {player.position} · {player.team}
          </span>
          <span className="trade-suggested-package__player-meta">
            {player.projection.toFixed(1)} pts
          </span>
        </div>
      </div>
    </div>
  );
}

export function SuggestedPackage({
  package: pkg,
  isExpanded,
  showLaunchNote,
}: SuggestedPackageProps) {
  const weeklyTone = pkg.weeklyImpact.delta < 0 ? 'positive' : 'negative';
  const playoffTone = pkg.playoffProbDelta >= 0 ? 'positive' : 'negative';
  const titleTone =
    pkg.championshipOddsAfter < pkg.championshipOddsBefore ? 'positive' : 'negative';

  return (
    <div
      className={[
        'trade-suggested-package',
        isExpanded ? 'trade-suggested-package--expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="trade-suggested-package__body-wrap">
        <div className="trade-suggested-package__body">
          <div className="trade-suggested-package__trade">
            <p className="trade-suggested-package__kicker">Suggested trade</p>

            <div className="trade-suggested-package__swap">
              <PackagePlayer label="You send" player={pkg.youSend[0]} />
              <span aria-hidden="true" className="trade-suggested-package__arrow">
                →
              </span>
              <PackagePlayer label="You receive" player={pkg.youReceive[0]} />
            </div>
          </div>

          <div className="trade-suggested-package__impact">
            <p className="trade-suggested-package__kicker">Matchup impact</p>

            <div className="trade-suggested-package__impact-row">
              <span className="trade-suggested-package__impact-label">This week</span>
              <span className="trade-suggested-package__impact-values">
                {formatAmericanOdds(pkg.weeklyImpact.before)} →{' '}
                {formatAmericanOdds(pkg.weeklyImpact.after)}
              </span>
              <span
                className={[
                  'trade-suggested-package__delta',
                  `trade-suggested-package__delta--${weeklyTone}`,
                ].join(' ')}
              >
                {formatSignedPercent(pkg.weeklyWinProbDelta)}{' '}
                <Gloss term="win-prob">win prob</Gloss>
              </span>
            </div>

            <div className="trade-suggested-package__impact-row">
              <span className="trade-suggested-package__impact-label">Playoffs</span>
              <span className="trade-suggested-package__impact-values">
                {pkg.playoffProbBefore.toFixed(1)}% → {pkg.playoffProbAfter.toFixed(1)}%
              </span>
              <span
                className={[
                  'trade-suggested-package__delta',
                  `trade-suggested-package__delta--${playoffTone}`,
                ].join(' ')}
              >
                {formatSignedPercent(pkg.playoffProbDelta)}
              </span>
            </div>

            <div className="trade-suggested-package__impact-row">
              <span className="trade-suggested-package__impact-label">Title</span>
              <span className="trade-suggested-package__impact-values">
                {formatAmericanOdds(pkg.championshipOddsBefore)} →{' '}
                {formatAmericanOdds(pkg.championshipOddsAfter)}
              </span>
              <span
                className={[
                  'trade-suggested-package__delta',
                  `trade-suggested-package__delta--${titleTone}`,
                ].join(' ')}
              >
                {titleTone === 'positive' ? 'Better' : 'Worse'}
              </span>
            </div>
          </div>

          {showLaunchNote ? (
            <p className="trade-suggested-package__note">
              Full analyzer with crowdsourced values: Week 5
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
