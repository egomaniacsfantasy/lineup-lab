import type { Player } from '../../types';
import './PlayerSearch.css';

interface PlayerSearchProps {
  players: Player[];
  query: string;
  selectedPlayer: Player | null;
  onQueryChange: (value: string) => void;
  onSelect: (player: Player) => void;
}

export function PlayerSearch({
  players,
  query,
  selectedPlayer,
  onQueryChange,
  onSelect,
}: PlayerSearchProps) {
  const normalizedQuery = query.trim().toLowerCase();

  const filteredPlayers =
    normalizedQuery.length === 0
      ? []
      : players
          .filter((player) =>
            [player.name, player.shortName, player.team, player.position]
              .join(' ')
              .toLowerCase()
              .includes(normalizedQuery),
          )
          .slice(0, 6);

  return (
    <div className="player-search">
      <label className="player-search__label" htmlFor="player-search-input">
        Player
      </label>
      <input
        autoComplete="off"
        className="player-search__input"
        id="player-search-input"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search player..."
        type="text"
        value={query}
      />

      {selectedPlayer && normalizedQuery.length === 0 ? (
        <p className="player-search__selected">
          {selectedPlayer.shortName} · {selectedPlayer.position} · {selectedPlayer.team}
        </p>
      ) : null}

      {filteredPlayers.length > 0 ? (
        <div className="player-search__results">
          {filteredPlayers.map((player) => (
            <button
              key={player.id}
              className="player-search__result"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(player)}
              type="button"
            >
              <span className="player-search__result-name">{player.shortName}</span>
              <span className="player-search__result-meta">
                {player.position} · {player.team}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
