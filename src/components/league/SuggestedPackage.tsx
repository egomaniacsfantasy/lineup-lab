import { formatAmericanOdds } from '../../utils/formatOdds';
import type { SuggestedPackage as SuggestedPackageData } from '../../mocks/tradeTargets';
import './SuggestedPackage.css';

interface SuggestedPackageProps {
  package: SuggestedPackageData;
  targetTeamName: string;
  isExpanded: boolean;
  onToggle: () => void;
  showLaunchNote: boolean;
}

function formatSignedPercent(value: number) {
  const absolute = Math.abs(value).toFixed(1);
  return `${value >= 0 ? '+' : '-'}${absolute}%`;
}

function formatSignedOddsDelta(value: number) {
  const absolute = Math.abs(value);
  return `${value >= 0 ? '+' : '-'}${absolute}`;
}

export function SuggestedPackage({
  package: pkg,
  targetTeamName,
  isExpanded,
  onToggle,
  showLaunchNote,
}: SuggestedPackageProps) {
  const weeklyIsPositive = pkg.weeklyImpact.delta < 0;
  const playoffIsPositive = pkg.playoffProbDelta > 0;
  const titleIsPositive = pkg.championshipOddsAfter < pkg.championshipOddsBefore;

  return (
    <div
      className={[
        'suggested-package',
        isExpanded ? 'suggested-package--expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        aria-expanded={isExpanded}
        className="suggested-package__toggle"
        onClick={onToggle}
        type="button"
      >
        <span>Analyze this trade</span>
        <span className="suggested-package__toggle-icon">{isExpanded ? '−' : '→'}</span>
      </button>

      <div className="suggested-package__body-wrap">
        <div className="suggested-package__body">
          <div className="suggested-package__header">
            <p className="suggested-package__kicker">Suggested package</p>
            <h4 className="suggested-package__title">{targetTeamName}</h4>
          </div>

          <div className="suggested-package__trade">
            <div className="suggested-package__column">
              <span className="suggested-package__label">You send</span>
              <div className="suggested-package__players">
                {pkg.youSend.map((player) => (
                  <div
                    className="suggested-package__player"
                    key={`${player.name}-${player.team}-send`}
                  >
                    <span className="suggested-package__player-name">{player.name}</span>
                    <span className="suggested-package__player-meta">
                      {player.position} · {player.team} · {player.projection.toFixed(1)} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <span aria-hidden="true" className="suggested-package__arrow">
              →
            </span>

            <div className="suggested-package__column">
              <span className="suggested-package__label">You receive</span>
              <div className="suggested-package__players">
                {pkg.youReceive.map((player) => (
                  <div
                    className="suggested-package__player"
                    key={`${player.name}-${player.team}-receive`}
                  >
                    <span className="suggested-package__player-name">{player.name}</span>
                    <span className="suggested-package__player-meta">
                      {player.position} · {player.team} · {player.projection.toFixed(1)} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="suggested-package__impact">
            <span className="suggested-package__label">Matchup impact</span>

            <div className="suggested-package__impact-row">
              <span className="suggested-package__impact-title">This week</span>
              <span className="suggested-package__impact-values">
                {formatAmericanOdds(pkg.weeklyImpact.before)} →{' '}
                {formatAmericanOdds(pkg.weeklyImpact.after)}
              </span>
              <span
                className={[
                  'suggested-package__delta',
                  weeklyIsPositive
                    ? 'suggested-package__delta--positive'
                    : 'suggested-package__delta--negative',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {formatSignedOddsDelta(pkg.weeklyImpact.delta)} ·{' '}
                {formatSignedPercent(pkg.weeklyWinProbDelta)}
              </span>
            </div>

            <div className="suggested-package__impact-row">
              <span className="suggested-package__impact-title">Playoff odds</span>
              <span className="suggested-package__impact-values">
                {formatSignedPercent(pkg.playoffProbDelta)}
              </span>
              <span
                className={[
                  'suggested-package__delta',
                  playoffIsPositive
                    ? 'suggested-package__delta--positive'
                    : 'suggested-package__delta--negative',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {playoffIsPositive ? 'Improves path' : 'Adds risk'}
              </span>
            </div>

            <div className="suggested-package__impact-row">
              <span className="suggested-package__impact-title">Championship</span>
              <span className="suggested-package__impact-values">
                {formatAmericanOdds(pkg.championshipOddsBefore)} →{' '}
                {formatAmericanOdds(pkg.championshipOddsAfter)}
              </span>
              <span
                className={[
                  'suggested-package__delta',
                  titleIsPositive
                    ? 'suggested-package__delta--positive'
                    : 'suggested-package__delta--negative',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {titleIsPositive ? 'Price improves' : 'Price drifts'}
              </span>
            </div>
          </div>

          {showLaunchNote ? (
            <p className="suggested-package__note">
              Full trade analyzer with crowdsourced values launches Week 5.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
