import type { Player } from '../../types';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
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
  onOpenPlayerDetail?: (player: Player) => void;
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
  onOpenPlayerDetail,
}: DraggableCardProps) {
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
      <PlayerHeadshot
        className="draggable-card__avatar"
        fallbackClassName="draggable-card__avatar-fallback"
        imageClassName="draggable-card__avatar-image"
        player={player}
      />
      <span className="draggable-card__copy">
        <button
          className="draggable-card__name draggable-card__name--button"
          onClick={() => onOpenPlayerDetail?.(player)}
          type="button"
        >
          {player.shortName}
        </button>
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
