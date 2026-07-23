import { formatMovementLabel } from '../../utils/leagueMovement';
import './LeagueMovementChip.css';

interface LeagueMovementChipProps {
  move: number;
  timeframe: string;
  className?: string;
  variant?: 'pill' | 'quiet';
}

export function LeagueMovementChip({
  move,
  timeframe,
  className = '',
  variant = 'pill',
}: LeagueMovementChipProps) {
  return (
    <span
      className={[
        'league-movement-chip',
        `league-movement-chip--${variant}`,
        move >= 0 ? 'league-movement-chip--up' : 'league-movement-chip--down',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {formatMovementLabel(move, timeframe)}
    </span>
  );
}
