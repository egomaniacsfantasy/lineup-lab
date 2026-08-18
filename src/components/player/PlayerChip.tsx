import type { Player, Position } from '../../types';
import { apiUrl } from '../../services/apiBase.ts';
import { PlayerHeadshot } from './PlayerHeadshot';
import './PlayerChip.css';

type PlayerChipSize = 'sm' | 'md' | 'lg';

interface PlayerChipProps {
  player: Player;
  className?: string;
  size?: PlayerChipSize;
  showPosition?: boolean;
  tone?: 'default' | 'accent';
}

function positionClass(position: Position | string | undefined) {
  return ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(position ?? '')
    ? String(position).toLowerCase()
    : 'wr';
}

export function PlayerChip({
  player,
  className = '',
  showPosition = true,
  size = 'md',
  tone = 'default',
}: PlayerChipProps) {
  const position = player.position ?? 'WR';
  const teamLogoUrl =
    player.teamLogoUrl || (player.team ? apiUrl(`/api/img/logo/${player.team.toLowerCase()}`) : '');

  return (
    <span
      aria-hidden="true"
      className={[
        'player-chip',
        `player-chip--${size}`,
        `player-chip--${positionClass(position)}`,
        tone === 'accent' ? 'player-chip--accent' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showPosition ? <span className="player-chip__position">{position}</span> : null}
      <span className="player-chip__portrait">
        <PlayerHeadshot
          className="player-chip__headshot"
          fallbackClassName="player-chip__fallback"
          imageClassName="player-chip__image"
          player={player}
        />
        {teamLogoUrl ? (
          <img
            alt=""
            className="player-chip__team"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
            src={teamLogoUrl}
          />
        ) : null}
      </span>
    </span>
  );
}
