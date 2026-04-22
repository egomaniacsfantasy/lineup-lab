import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Player, Position } from '../../types';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import './PlayerSelect.css';

interface PlayerSelectProps {
  label: string;
  players: Player[];
  placeholder: string;
  value: Player | null;
  excludePlayerId?: string | null;
  onChange: (player: Player | null) => void;
}

const POSITION_ORDER: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

function groupPlayers(players: Player[]) {
  return POSITION_ORDER.map((position) => ({
    position,
    players: players.filter((player) => player.position === position),
  })).filter((group) => group.players.length > 0);
}

function PlayerOption({
  isActive,
  onSelect,
  player,
}: {
  isActive: boolean;
  onSelect: () => void;
  player: Player;
}) {
  return (
    <button
      className={[
        'player-select__option',
        isActive ? 'player-select__option--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onSelect}
      type="button"
    >
      <PlayerHeadshot
        className="player-select__option-avatar"
        fallbackClassName="player-select__option-avatar-fallback"
        imageClassName="player-select__option-avatar-image"
        player={player}
      />
      <span className="player-select__option-name">{player.shortName}</span>
      <span className="player-select__option-meta">
        {player.position} · {player.team}
      </span>
    </button>
  );
}

export function PlayerSelect({
  label,
  players,
  placeholder,
  value,
  excludePlayerId = null,
  onChange,
}: PlayerSelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const availablePlayers = useMemo(
    () =>
      players.filter((player) => {
        if (excludePlayerId && player.id === excludePlayerId) {
          return false;
        }

        if (!query.trim()) {
          return true;
        }

        const normalized = query.trim().toLowerCase();
        const haystack = `${player.name} ${player.shortName} ${player.position} ${player.team}`.toLowerCase();
        return haystack.includes(normalized);
      }),
    [excludePlayerId, players, query],
  );

  const groupedPlayers = useMemo(() => groupPlayers(availablePlayers), [availablePlayers]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const positionMenu = () => {
      const menuElement = menuRef.current;
      const containerElement = containerRef.current;

      if (!menuElement || !containerElement) {
        return;
      }

      menuElement.dataset.align = 'left';

      const boundaryElement = containerElement.closest('.compare-widget');
      const boundaryRect =
        boundaryElement?.getBoundingClientRect() ?? {
          left: 0,
          right: window.innerWidth,
        };
      const menuRect = menuElement.getBoundingClientRect();

      if (menuRect.right > boundaryRect.right) {
        menuElement.dataset.align = 'right';
      } else if (menuRect.left < boundaryRect.left) {
        menuElement.dataset.align = 'left';
      }
    };

    positionMenu();
    window.addEventListener('resize', positionMenu);

    return () => {
      window.removeEventListener('resize', positionMenu);
    };
  }, [groupedPlayers, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    inputRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const buttonLabel = value
    ? `${value.shortName} · ${value.position} · ${value.team}`
    : placeholder;

  return (
    <div className="player-select" ref={containerRef}>
      <span className="player-select__label">{label}</span>

      <button
        aria-expanded={isOpen}
        className={[
          'player-select__trigger',
          value ? 'player-select__trigger--selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="player-select__trigger-copy">{buttonLabel}</span>
        <span className="player-select__trigger-icon">{isOpen ? '−' : '▾'}</span>
      </button>

      {isOpen ? (
        <div className="player-select__menu" data-align="left" ref={menuRef}>
          <div className="player-select__search-row">
            <input
              aria-label={`${label} search`}
              className="player-select__search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search players"
              ref={inputRef}
              type="text"
              value={query}
            />
            {value ? (
              <button
                className="player-select__clear"
                onClick={() => {
                  onChange(null);
                  setQuery('');
                  setIsOpen(false);
                }}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="player-select__groups">
            {groupedPlayers.length === 0 ? (
              <p className="player-select__empty">No players match that search.</p>
            ) : (
              groupedPlayers.map((group) => (
                <div className="player-select__group" key={group.position}>
                  <p className="player-select__group-label">{group.position}</p>
                  <div className="player-select__options">
                    {group.players.map((player) => (
                      <PlayerOption
                        isActive={value?.id === player.id}
                        key={player.id}
                        onSelect={() => {
                          onChange(player);
                          setQuery('');
                          setIsOpen(false);
                        }}
                        player={player}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
