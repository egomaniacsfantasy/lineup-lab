import { formatMovementLabel } from '../../utils/leagueMovement';
import './LeagueMovementChip.css';

interface LeagueMovementChipProps {
  move: number;
  timeframe: string;
  className?: string;
}

export function LeagueMovementChip({
  move,
  timeframe,
  className = '',
}: LeagueMovementChipProps) {
  return (
    <span
      className={[
        'league-movement-chip',
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
