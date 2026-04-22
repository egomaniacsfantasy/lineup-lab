import type { CSSProperties } from 'react';
import type { MatchupLine, Player } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { Gloss } from '../ui/Gloss';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import './ComparisonCard.css';

interface ComparisonCardProps {
  player: Player;
  projection: number;
  floor: number;
  ceiling: number;
  resultingLine?: MatchupLine;
  deltaWinProbability?: number;
  gameLine: string;
  playerProp?: string;
  isCurrentStarter: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function formatDelta(delta: number) {
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

export function ComparisonCard({
  player,
  projection,
  floor,
  ceiling,
  resultingLine,
  deltaWinProbability = 0,
  gameLine,
  playerProp,
  isCurrentStarter,
  isSelected,
  onSelect,
}: ComparisonCardProps) {
  const line = resultingLine;

  if (!line) {
    return null;
  }

  const rangeStart = clampPercent((floor / 40) * 100);
  const rangeEnd = clampPercent((ceiling / 40) * 100);
  const rangeWidth = Math.max(4, rangeEnd - rangeStart);
  const tickPosition = clampPercent((projection / 40) * 100);

  const rangeStyle = {
    '--comparison-range-start': `${rangeStart}%`,
    '--comparison-range-width': `${rangeWidth}%`,
    '--comparison-range-tick': `${tickPosition}%`,
  } as CSSProperties;

  const deltaTone =
    deltaWinProbability > 0 ? 'positive' : deltaWinProbability < 0 ? 'negative' : 'neutral';

  return (
    <article
      className={[
        'comparison-card',
        isSelected ? 'comparison-card--selected' : '',
        isCurrentStarter ? 'comparison-card--starter' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        className="comparison-card__select"
        onClick={onSelect}
        type="button"
      >
        <div className="comparison-card__top">
            <div className="comparison-card__identity">
              <span className="comparison-card__avatar-wrap" aria-hidden="true">
              <PlayerHeadshot
                className="comparison-card__avatar"
                fallbackClassName="comparison-card__avatar-fallback"
                imageClassName="comparison-card__avatar-image"
                player={player}
              />
              {player.position !== 'DEF' ? (
                <span className="comparison-card__logo-badge">
                  <img
                    alt=""
                    className="comparison-card__logo-image"
                    src={player.teamLogoUrl}
                  />
                </span>
              ) : null}
            </span>

            <div className="comparison-card__identity-copy">
              <p className="comparison-card__name">{player.shortName}</p>
              <div className="comparison-card__meta">
                <span className="comparison-card__team">{player.team}</span>
                <span className="comparison-card__position">{player.position}</span>
              </div>
            </div>
          </div>

          <div className="comparison-card__status-wrap">
            {isCurrentStarter && !isSelected ? (
              <span className="comparison-card__tag">Original starter</span>
            ) : null}
            {isSelected ? (
              <span className="comparison-card__status">Selected</span>
            ) : null}
          </div>
        </div>

        <div className="comparison-card__stats">
          <div className="comparison-card__stat comparison-card__stat--line">
            <span className="comparison-card__stat-label">
              <Gloss term="line-if-started">Line if started</Gloss>
            </span>
            <p className="comparison-card__line">
              {formatAmericanOdds(line.moneyline)} · {line.winProbability.toFixed(1)}%
            </p>
          </div>

          <div className="comparison-card__stat comparison-card__stat--projection">
            <span className="comparison-card__stat-label">
              <Gloss term="projection">Projection</Gloss>
            </span>
            <p className="comparison-card__projection">
              {projection.toFixed(1)}
              <span className="comparison-card__projection-unit"> pts</span>
            </p>
          </div>
        </div>

        <div
          className={[
            'comparison-card__impact',
            `comparison-card__impact--${isSelected ? 'selected' : deltaTone}`,
          ].join(' ')}
        >
          <span className="comparison-card__impact-label">
            {isSelected ? 'Active choice' : 'Line impact'}
          </span>
          <span className="comparison-card__impact-value">
            {isSelected ? 'In lineup' : formatDelta(deltaWinProbability)}
          </span>
          <span className="comparison-card__impact-note">
            {isSelected ? 'This option is live right now' : 'win probability'}
          </span>
        </div>

        <div className="comparison-card__action">
          <span className="comparison-card__action-copy">
            {isSelected ? `${player.shortName} is active` : `Start ${player.shortName}`}
          </span>
          <span className="comparison-card__action-pill">
            {isSelected ? 'Selected' : 'Tap to choose'}
          </span>
        </div>
      </button>

      <details className="comparison-card__details">
        <summary className="comparison-card__details-summary">
          Game and range details
        </summary>
        <div className="comparison-card__details-body">
          <div className="comparison-card__range">
            <div className="comparison-card__range-bar" style={rangeStyle}>
              <span className="comparison-card__range-fill" />
              <span className="comparison-card__range-tick" />
            </div>
            <div className="comparison-card__range-copy">
              <span>Floor {floor.toFixed(1)}</span>
              <span>Ceiling {ceiling.toFixed(1)}</span>
            </div>
          </div>

          <p className="comparison-card__market">
            {gameLine.includes('O/U') ? (
              <>
                {gameLine.split('O/U')[0]}
                <Gloss term="o-u">O/U</Gloss>
                {gameLine.split('O/U')[1]}
              </>
            ) : (
              gameLine
            )}
          </p>
          {playerProp ? <p className="comparison-card__prop">{playerProp}</p> : null}
        </div>
      </details>
    </article>
  );
}
