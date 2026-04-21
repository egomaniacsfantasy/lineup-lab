import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import type { MatchupData, MatchupLine, RosterSlot, ScoringFormat } from '../../types';
import { formatAmericanOdds, formatSpread } from '../../utils/formatOdds';
import {
  cacheImageFailure,
  getInitials,
  getPlayerAvatarUrl,
  hasCachedImageFailure,
} from '../../utils/playerAssets';
import './MatchupCard.css';
import { useState } from 'react';

interface MatchupCardProps {
  matchup: MatchupData;
  activeRoster?: RosterSlot[];
  activeLine: {
    yours: MatchupLine;
    opponent: MatchupLine;
  };
}

const SCORING_LABELS: Record<ScoringFormat, string> = {
  standard: 'STD',
  ppr: 'PPR',
  'half-ppr': 'HALF',
};

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatProjection(value: number) {
  return value.toFixed(1);
}

function formatUserSpread(value: number) {
  return `You ${formatSpread(value * -1)}`;
}

function getCommentary(winProbability: number) {
  if (winProbability > 75) {
    return "Comfortable. Don't get cocky.";
  }

  if (winProbability >= 60) {
    return 'Slight edge. One bad break away from sweating.';
  }

  if (winProbability >= 50) {
    return 'Coin flip with a lean. Every roster spot matters.';
  }

  if (winProbability >= 40) {
    return 'Underdog territory. Time to make moves.';
  }

  return 'You are getting points. The gods love an upset.';
}

function Avatar({
  imageUrl,
  fallbackLabel,
}: {
  imageUrl: string;
  fallbackLabel: string;
}) {
  const [hasError, setHasError] = useState(hasCachedImageFailure(imageUrl));

  if (hasError) {
    return <span className="matchup-card__avatar-fallback">{fallbackLabel}</span>;
  }

  return (
    <img
      alt=""
      className="matchup-card__avatar-image"
      onError={() => {
        cacheImageFailure(imageUrl);
        setHasError(true);
      }}
      src={imageUrl}
    />
  );
}

export function MatchupCard({ matchup, activeRoster, activeLine }: MatchupCardProps) {
  const winProbability = Math.max(0, Math.min(100, activeLine.yours.winProbability));
  const lineDelta = activeLine.yours.winProbability - matchup.baseline.yours.winProbability;
  const deltaTone =
    lineDelta > 0 ? 'positive' : lineDelta < 0 ? 'negative' : 'neutral';
  const movementLabel =
    lineDelta === 0
      ? 'Baseline'
      : `${lineDelta > 0 ? '+' : ''}${lineDelta.toFixed(1)} pts`;
  const yourRoster = activeRoster ?? matchup.yourTeam.roster;
  const yourQuarterback =
    yourRoster.find((slot) => slot.slotLabel === 'QB')?.starter ?? null;
  const opponentQuarterback =
    matchup.opponentTeam.roster.find((slot) => slot.slotLabel === 'QB')?.starter ?? null;
  const animatedYourProjection = useAnimatedNumber(activeLine.yours.projection, {
    formatter: formatProjection,
  });
  const animatedOpponentProjection = useAnimatedNumber(activeLine.opponent.projection, {
    formatter: formatProjection,
  });
  const animatedYourMoneyline = useAnimatedNumber(activeLine.yours.moneyline, {
    formatter: formatAmericanOdds,
  });
  const animatedOpponentMoneyline = useAnimatedNumber(activeLine.opponent.moneyline, {
    formatter: formatAmericanOdds,
  });
  const animatedYourWinProbability = useAnimatedNumber(activeLine.yours.winProbability, {
    formatter: formatPercentage,
  });
  const animatedOpponentWinProbability = useAnimatedNumber(
    activeLine.opponent.winProbability,
    {
      formatter: formatPercentage,
    },
  );
  const animatedSpread = useAnimatedNumber(activeLine.yours.spread, {
    formatter: formatUserSpread,
  });
  const animatedTotal = useAnimatedNumber(activeLine.yours.total, {
    formatter: formatProjection,
  });

  return (
    <section
      aria-labelledby="matchup-market-title"
      className={`matchup-card matchup-card--${deltaTone}`}
    >
      <div className="matchup-card__content">
        <header className="matchup-card__header">
          <div>
            <p className="matchup-card__eyebrow">Matchup Market</p>
            <h2 className="matchup-card__title" id="matchup-market-title">
              Week {matchup.week} · {SCORING_LABELS[matchup.scoringFormat]}
            </h2>
          </div>

          <div className="matchup-card__header-pills">
            <span className="matchup-card__live-pill">Live</span>
            <span className={`matchup-card__movement matchup-card__movement--${deltaTone}`}>
              {movementLabel}
            </span>
          </div>
        </header>

        <div className="matchup-card__teams">
          <article className="matchup-card__team matchup-card__team--yours">
            <div className="matchup-card__team-head">
              <span className="matchup-card__avatar" aria-hidden="true">
                {yourQuarterback ? (
                  <Avatar
                    fallbackLabel={getInitials(yourQuarterback.shortName)}
                    imageUrl={getPlayerAvatarUrl(yourQuarterback)}
                  />
                ) : null}
              </span>
              <div>
                <p className="matchup-card__team-label">Your team</p>
                <h3 className="matchup-card__team-name">{matchup.yourTeam.teamName}</h3>
                <p className="matchup-card__team-record">
                  {matchup.yourTeam.managerName} · {matchup.yourTeam.record}
                </p>
              </div>
            </div>

            <div className="matchup-card__projection-block">
              <p className="matchup-card__projection">{animatedYourProjection}</p>
              <p className="matchup-card__projection-label">Projected points</p>
            </div>
          </article>

          <article className="matchup-card__team matchup-card__team--opponent">
            <div className="matchup-card__team-head">
              <span className="matchup-card__avatar" aria-hidden="true">
                {opponentQuarterback ? (
                  <Avatar
                    fallbackLabel={getInitials(opponentQuarterback.shortName)}
                    imageUrl={getPlayerAvatarUrl(opponentQuarterback)}
                  />
                ) : null}
              </span>
              <div>
                <p className="matchup-card__team-label">Opponent</p>
                <h3 className="matchup-card__team-name">{matchup.opponentTeam.teamName}</h3>
                <p className="matchup-card__team-record">
                  {matchup.opponentTeam.managerName} · {matchup.opponentTeam.record}
                </p>
              </div>
            </div>

            <div className="matchup-card__projection-block">
              <p className="matchup-card__projection">{animatedOpponentProjection}</p>
              <p className="matchup-card__projection-label">Projected points</p>
            </div>
          </article>
        </div>

        <div className="matchup-card__odds-board">
          <div className="matchup-card__price-card matchup-card__price-card--yours">
            <p className="matchup-card__price-label">You</p>
            <p className="matchup-card__moneyline matchup-card__moneyline--yours">
              {animatedYourMoneyline}
            </p>
            <p className="matchup-card__win-probability">{animatedYourWinProbability}</p>
          </div>

          <div className="matchup-card__odds-center">
            <p className="matchup-card__board-label">Moneyline</p>
            <div className="matchup-card__probability-bar" aria-hidden="true">
              <div
                className="matchup-card__probability-fill"
                style={{ width: `${winProbability}%` }}
              />
            </div>

            <div className="matchup-card__probability-meta">
              <span>{matchup.yourTeam.teamName}</span>
              <span>{matchup.opponentTeam.teamName}</span>
            </div>

            <p className="matchup-card__commentary">
              {getCommentary(activeLine.yours.winProbability)}
            </p>
          </div>

          <div className="matchup-card__price-card matchup-card__price-card--opponent">
            <p className="matchup-card__price-label">Opp</p>
            <p className="matchup-card__moneyline matchup-card__moneyline--opponent">
              {animatedOpponentMoneyline}
            </p>
            <p className="matchup-card__win-probability">
              {animatedOpponentWinProbability}
            </p>
          </div>
        </div>

        <div className="matchup-card__markets">
          <div className="matchup-card__market matchup-card__market--accent">
            <p className="matchup-card__market-label">Spread</p>
            <p className="matchup-card__market-value">{animatedSpread}</p>
          </div>

          <div className="matchup-card__market matchup-card__market--neutral">
            <p className="matchup-card__market-label">Total</p>
            <p className="matchup-card__market-value matchup-card__market-value--neutral">
              {animatedTotal}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
