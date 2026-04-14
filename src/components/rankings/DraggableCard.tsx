import { useState } from 'react';
import type { Player } from '../../types';
import {
  cacheImageFailure,
  getInitials,
  getPlayerAvatarUrl,
  hasCachedImageFailure,
} from '../../utils/playerAssets';
import './DraggableCard.css';

interface DraggableCardProps {
  player: Player;
  rank: number;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function DraggableCard({
  player,
  rank,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMoveUp,
  onMoveDown,
}: DraggableCardProps) {
  const avatarUrl = getPlayerAvatarUrl(player);
  const [hasImageError, setHasImageError] = useState(hasCachedImageFailure(avatarUrl));

  return (
    <div
      className={[
        'draggable-card',
        isDragging ? 'draggable-card--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDragStart={onDragStart}
      onDrop={onDrop}
      role="listitem"
    >
      <span className="draggable-card__rank">{rank}</span>
      <span className="draggable-card__handle" aria-hidden="true">
        ⋮⋮
      </span>
      <span className="draggable-card__avatar" aria-hidden="true">
        {hasImageError ? (
          <span className="draggable-card__avatar-fallback">{getInitials(player.shortName)}</span>
        ) : (
          <img
            alt=""
            className="draggable-card__avatar-image"
            onError={() => {
              cacheImageFailure(avatarUrl);
              setHasImageError(true);
            }}
            src={avatarUrl}
          />
        )}
      </span>
      <span className="draggable-card__copy">
        <span className="draggable-card__name">{player.shortName}</span>
        <span className="draggable-card__meta">
          {player.position} · {player.team}
        </span>
      </span>
      <span className="draggable-card__controls">
        <button
          aria-label={`Move ${player.shortName} up`}
          className="draggable-card__move"
          onClick={onMoveUp}
          type="button"
        >
          ↑
        </button>
        <button
          aria-label={`Move ${player.shortName} down`}
          className="draggable-card__move"
          onClick={onMoveDown}
          type="button"
        >
          ↓
        </button>
      </span>
    </div>
  );
}
