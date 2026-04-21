import { useEffect, useRef, useState } from 'react';
import { MOCK_RANKING_PROMPT } from '../../mocks';
import type { Player } from '../../types';
import { DraggableCard } from './DraggableCard';
import './RankingMechanic.css';

function reorderPlayers(players: Player[], fromIndex: number, toIndex: number) {
  const nextPlayers = [...players];
  const [moved] = nextPlayers.splice(fromIndex, 1);
  nextPlayers.splice(toIndex, 0, moved);
  return nextPlayers;
}

function shufflePlayers(players: Player[]) {
  const nextPlayers = [...players];

  for (let index = nextPlayers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextPlayers[index], nextPlayers[swapIndex]] = [nextPlayers[swapIndex], nextPlayers[index]];
  }

  return nextPlayers;
}

export function RankingMechanic() {
  const [players, setPlayers] = useState<Player[]>(MOCK_RANKING_PROMPT.players);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = () => {
    setToastVisible(true);

    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
      toastTimerRef.current = null;
    }, 2600);
  };

  const movePlayer = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= players.length || fromIndex === toIndex) {
      return;
    }

    setPlayers((currentPlayers) => reorderPlayers(currentPlayers, fromIndex, toIndex));
  };

  return (
    <section aria-labelledby="ranking-mechanic-title" className="ranking-mechanic">
      <div className="ranking-mechanic__header">
        <p className="ranking-mechanic__kicker">Rank these players</p>
        <h2 className="ranking-mechanic__title" id="ranking-mechanic-title">
          Rank these. Move the line.
        </h2>
      </div>

      <div className="ranking-mechanic__list" role="list">
        {players.map((player, index) => (
          <DraggableCard
            isDragging={dragIndex === index}
            key={player.id}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={() => {
              if (dragIndex === null || dragIndex === index) {
                return;
              }
              movePlayer(dragIndex, index);
              setDragIndex(index);
            }}
            onDragStart={() => setDragIndex(index)}
            onDrop={() => setDragIndex(null)}
            onMoveDown={() => movePlayer(index, index + 1)}
            onMoveUp={() => movePlayer(index, index - 1)}
            player={player}
            rank={index + 1}
          />
        ))}
      </div>

      <button
        className="ranking-mechanic__submit"
        onClick={() => {
          setPlayers((currentPlayers) => shufflePlayers(currentPlayers));
          showToast();
        }}
        type="button"
      >
        Submit ranking
      </button>

      <p className="ranking-mechanic__meta">
        Your rank shapes the consensus. Submitting enters this week&apos;s Pro raffle.
      </p>

      {toastVisible ? (
        <div className="ranking-mechanic__toast" role="status">
          Ranking submitted! You&apos;re entered in this week&apos;s Pro raffle.
        </div>
      ) : null}
    </section>
  );
}
