import { getComparisonVerdict } from '../../utils/lineupComparison';
import './StarterSwapConfirm.css';

interface StarterSwapConfirmProps {
  currentPlayerName: string;
  targetPlayerName: string;
  currentWinProbability: number;
  targetWinProbability: number;
  deltaWinProbability: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function StarterSwapConfirm({
  currentPlayerName,
  targetPlayerName,
  currentWinProbability,
  targetWinProbability,
  deltaWinProbability,
  onCancel,
  onConfirm,
}: StarterSwapConfirmProps) {
  const isPositive = deltaWinProbability > 0;
  const impactTone = isPositive
    ? 'positive'
    : deltaWinProbability < 0
      ? 'negative'
      : 'neutral';

  return (
    <div className="starter-swap-confirm" data-swap-confirm>
      <p className="starter-swap-confirm__eyebrow">Swap confirmation</p>

      <p className="starter-swap-confirm__title">
        Swap <span>{currentPlayerName}</span>{' '}
        <span className="starter-swap-confirm__arrow">-&gt;</span>{' '}
        <span>{targetPlayerName}</span>
      </p>

      <p className="starter-swap-confirm__impact">
        Win prob:{' '}
        <span>{currentWinProbability.toFixed(1)}%</span>{' '}
        <span className="starter-swap-confirm__arrow">-&gt;</span>{' '}
        <span
          className={`starter-swap-confirm__impact-next starter-swap-confirm__impact-next--${impactTone}`}
        >
          {targetWinProbability.toFixed(1)}%
        </span>
      </p>

      <p className="starter-swap-confirm__verdict">
        {getComparisonVerdict(deltaWinProbability, currentPlayerName, targetPlayerName)}
      </p>

      <div className="starter-swap-confirm__actions">
        <button
          className="starter-swap-confirm__button starter-swap-confirm__button--ghost"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="starter-swap-confirm__button starter-swap-confirm__button--primary"
          onClick={onConfirm}
          type="button"
        >
          Swap
        </button>
      </div>
    </div>
  );
}
