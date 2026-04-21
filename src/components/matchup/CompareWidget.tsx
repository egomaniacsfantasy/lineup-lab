import { useMemo, useState } from 'react';
import type { Player } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import {
  cacheImageFailure,
  getInitials,
  getPlayerAvatarUrl,
  hasCachedImageFailure,
} from '../../utils/playerAssets';
import type { MatchupPlayerComparison } from '../../hooks/useMatchupEngine';
import { PlayerSelect } from './PlayerSelect';
import {
  getComparisonVerdict,
  getSyntheticGameContext,
} from '../../utils/lineupComparison';
import './CompareWidget.css';

interface PlayerContext {
  gameLine: string;
  playerProp?: string;
}

interface CompareWidgetProps {
  players: Player[];
  leftPlayer: Player | null;
  rightPlayer: Player | null;
  comparison: MatchupPlayerComparison | null;
  defaultSuggestionLabel: string;
  onSelectLeft: (player: Player | null) => void;
  onSelectRight: (player: Player | null) => void;
  playerContexts: Record<string, PlayerContext>;
}

function ComparePlayerCard({
  lineText,
  player,
  positionTeam,
  projection,
}: {
  player: Player;
  positionTeam: string;
  projection: number;
  lineText: string;
}) {
  const avatarUrl = getPlayerAvatarUrl(player);
  const [hasImageError, setHasImageError] = useState(hasCachedImageFailure(avatarUrl));

  return (
    <article className="compare-widget__card">
      <div className="compare-widget__card-top">
        <span className="compare-widget__avatar-wrap" aria-hidden="true">
          <span className="compare-widget__avatar">
            {hasImageError ? (
              <span className="compare-widget__avatar-fallback">
                {getInitials(player.shortName)}
              </span>
            ) : (
              <img
                alt=""
                className="compare-widget__avatar-image"
                onError={() => {
                  cacheImageFailure(avatarUrl);
                  setHasImageError(true);
                }}
                src={avatarUrl}
              />
            )}
          </span>
          {player.position !== 'DEF' ? (
            <span className="compare-widget__logo-badge">
              <img alt="" className="compare-widget__logo-image" src={player.teamLogoUrl} />
            </span>
          ) : null}
        </span>

        <div className="compare-widget__identity">
          <h3 className="compare-widget__player-name">{player.shortName}</h3>
          <p className="compare-widget__player-meta">{positionTeam}</p>
        </div>
      </div>

      <div className="compare-widget__stats">
        <div className="compare-widget__stat-block">
          <span className="compare-widget__stat-label">Projection</span>
          <span className="compare-widget__stat-value">
            {projection.toFixed(1)}
            <span className="compare-widget__stat-unit"> pts</span>
          </span>
        </div>

        <div className="compare-widget__stat-block">
          <span className="compare-widget__stat-label">Line if started</span>
          <span className="compare-widget__line-value">{lineText}</span>
        </div>
      </div>
    </article>
  );
}

export function CompareWidget({
  players,
  leftPlayer,
  rightPlayer,
  comparison,
  defaultSuggestionLabel,
  onSelectLeft,
  onSelectRight,
  playerContexts,
}: CompareWidgetProps) {
  const compareCopy = useMemo(() => {
    if (!leftPlayer || !rightPlayer || !comparison) {
      return null;
    }

    return getComparisonVerdict(
      comparison.deltaWinProbability,
      leftPlayer.shortName,
      rightPlayer.shortName,
    );
  }, [comparison, leftPlayer, rightPlayer]);

  const deltaTone =
    comparison && comparison.deltaWinProbability > 0
      ? 'positive'
      : comparison && comparison.deltaWinProbability < 0
        ? 'negative'
        : 'neutral';

  const deltaLabel =
    comparison && comparison.deltaWinProbability !== 0
      ? `Δ ${comparison.deltaWinProbability > 0 ? '+' : ''}${comparison.deltaWinProbability.toFixed(1)}%`
      : 'Δ 0.0%';

  const leftContext = leftPlayer
    ? playerContexts[leftPlayer.id] ?? getSyntheticGameContext(leftPlayer)
    : null;
  const rightContext = rightPlayer
    ? playerContexts[rightPlayer.id] ?? getSyntheticGameContext(rightPlayer)
    : null;

  return (
    <section aria-labelledby="compare-widget-title" className="compare-widget">
      <div className="compare-widget__header">
        <p className="compare-widget__kicker">Compare players</p>
        <h2 className="compare-widget__title" id="compare-widget-title">
          Price any lineup decision instantly
        </h2>
      </div>

      <div className="compare-widget__selectors">
        <PlayerSelect
          excludePlayerId={rightPlayer?.id ?? null}
          label="Player A"
          onChange={onSelectLeft}
          placeholder="Select a player"
          players={players}
          value={leftPlayer}
        />

        <span className="compare-widget__vs">vs</span>

        <PlayerSelect
          excludePlayerId={leftPlayer?.id ?? null}
          label="Player B"
          onChange={onSelectRight}
          placeholder="Select a player"
          players={players}
          value={rightPlayer}
        />
      </div>

      {!leftPlayer || !rightPlayer ? (
        <div className="compare-widget__empty">
          <p className="compare-widget__empty-copy">
            Compare any two players to see the line impact.
          </p>
          <p className="compare-widget__empty-suggestion">
            Try: {defaultSuggestionLabel}
          </p>
        </div>
      ) : comparison ? (
        <>
          <div className="compare-widget__cards">
            <ComparePlayerCard
              lineText={`${formatAmericanOdds(comparison.leftLine.moneyline)} · ${comparison.leftLine.winProbability.toFixed(1)}%`}
              player={leftPlayer}
              positionTeam={`${leftPlayer.position} · ${leftPlayer.team}`}
              projection={comparison.leftProjection}
            />
            <ComparePlayerCard
              lineText={`${formatAmericanOdds(comparison.rightLine.moneyline)} · ${comparison.rightLine.winProbability.toFixed(1)}%`}
              player={rightPlayer}
              positionTeam={`${rightPlayer.position} · ${rightPlayer.team}`}
              projection={comparison.rightProjection}
            />
          </div>

          <div
            className={[
              'compare-widget__delta',
              `compare-widget__delta--${deltaTone}`,
            ].join(' ')}
          >
            <span className="compare-widget__delta-value">{deltaLabel}</span>
            <p className="compare-widget__delta-copy">{compareCopy}</p>
          </div>

          <div className="compare-widget__context">
            <span className="compare-widget__context-label">Game context</span>
            <div className="compare-widget__context-list">
              <p className="compare-widget__context-item">
                {leftPlayer.shortName}: {leftContext?.gameLine ?? 'Line pending'}
              </p>
              <p className="compare-widget__context-item">
                {rightPlayer.shortName}: {rightContext?.gameLine ?? 'Line pending'}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="compare-widget__empty">
          <p className="compare-widget__empty-copy">
            Select two different players to price the lineup impact.
          </p>
          <p className="compare-widget__empty-suggestion">
            Try: {defaultSuggestionLabel}
          </p>
        </div>
      )}
    </section>
  );
}
