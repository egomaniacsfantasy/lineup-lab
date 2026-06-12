import type { Player } from '../../types';
import './OneMoveRow.css';

interface OneMoveRowProps {
  biggestSwing: {
    slotIndex: number;
    starter: Player;
    alternative: Player;
    delta: number;
  } | null;
  onExpandLineup: () => void;
}

export function OneMoveRow({ biggestSwing, onExpandLineup }: OneMoveRowProps) {
  return (
    <section aria-labelledby="one-move-title" className="one-move">
      <p className="one-move__kicker" id="one-move-title">
        The one move
      </p>

      {biggestSwing ? (
        <div className="one-move__row">
          <span className="one-move__swap">
            {biggestSwing.starter.shortName} → {biggestSwing.alternative.shortName}
          </span>
          <span className="one-move__delta">
            +{biggestSwing.delta.toFixed(1)}% win prob
          </span>
        </div>
      ) : (
        <div className="one-move__row">
          <span className="one-move__swap one-move__swap--locked">
            Lineup locked. No positive swap on the board.
          </span>
        </div>
      )}

      <button className="one-move__expand" onClick={onExpandLineup} type="button">
        All swap targets
      </button>
    </section>
  );
}
