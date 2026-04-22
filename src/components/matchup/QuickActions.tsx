import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Player, RosterSlot } from '../../types';
import type { TradeTarget } from '../../mocks/tradeTargets';
import type { LineupLockWindow, WaiverSuggestion } from '../../mocks/actions';
import './QuickActions.css';

interface BiggestSwing {
  slotIndex: number;
  slotLabel: RosterSlot['slotLabel'];
  starter: Player;
  alternative: Player;
  delta: number;
}

interface QuickActionsProps {
  biggestSwing: BiggestSwing | null;
  lineupLocks: LineupLockWindow[];
  topTradeTarget: TradeTarget | null;
  waiverSuggestion: WaiverSuggestion;
  onCompareBiggestSwing: () => void;
}

function formatSwing(delta: number) {
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% win prob`;
}

export function QuickActions({
  biggestSwing,
  lineupLocks,
  topTradeTarget,
  waiverSuggestion,
  onCompareBiggestSwing,
}: QuickActionsProps) {
  const navigate = useNavigate();

  const lineupCopy = useMemo(() => {
    return lineupLocks.map((window) => ({
      ...window,
      playersText: window.players.join(', '),
    }));
  }, [lineupLocks]);

  return (
    <section aria-labelledby="quick-actions-title" className="quick-actions">
      <div className="quick-actions__header">
        <p className="quick-actions__kicker">This week</p>
        <h2 className="quick-actions__title" id="quick-actions-title">
          The week, priced.
        </h2>
      </div>

      <div className="quick-actions__list">
        <article className="quick-actions__item quick-actions__item--primary">
          <div className="quick-actions__item-head">
            <span className="quick-actions__icon" aria-hidden="true">
              🔥
            </span>
            <div className="quick-actions__copy">
              <p className="quick-actions__label">Biggest swing</p>
              {biggestSwing ? (
                <>
                  <p className="quick-actions__headline">
                    {biggestSwing.starter.shortName} → {biggestSwing.alternative.shortName}:{' '}
                    {formatSwing(biggestSwing.delta)}
                  </p>
                  <p className="quick-actions__context">
                    Your {biggestSwing.slotLabel} slot has the clearest swap edge this week.
                  </p>
                </>
              ) : (
                <p className="quick-actions__context">No swap targets on this slate.</p>
              )}
            </div>
          </div>

          <button
            className="quick-actions__button"
            onClick={onCompareBiggestSwing}
            type="button"
          >
            OPEN →
          </button>
        </article>

        <article className="quick-actions__item">
          <div className="quick-actions__item-head">
            <span className="quick-actions__icon" aria-hidden="true">
              📈
            </span>
            <div className="quick-actions__copy">
              <p className="quick-actions__label">Waiver watch</p>
              <p className="quick-actions__headline">
                {waiverSuggestion.player.name} ({waiverSuggestion.player.position} ·{' '}
                {waiverSuggestion.player.team}) available
              </p>
              <p className="quick-actions__context">{waiverSuggestion.context}</p>
            </div>
          </div>

          <button className="quick-actions__button" type="button">
            OPEN →
          </button>
        </article>

        <article className="quick-actions__item">
          <div className="quick-actions__item-head">
            <span className="quick-actions__icon" aria-hidden="true">
              🔄
            </span>
            <div className="quick-actions__copy">
              <p className="quick-actions__label">Trade opportunity</p>
              {topTradeTarget ? (
                <>
                  <p className="quick-actions__headline">
                    {topTradeTarget.teamName} needs {topTradeTarget.theirNeed} help.
                  </p>
                  <p className="quick-actions__context">
                    You have assets they want and a {topTradeTarget.fitScore}% fit waiting.
                  </p>
                </>
              ) : (
                <p className="quick-actions__context">Trade fits will show up here soon.</p>
              )}
            </div>
          </div>

          <button
            className="quick-actions__button"
            onClick={() => navigate('/league')}
            type="button"
          >
            OPEN →
          </button>
        </article>

        <article className="quick-actions__item">
          <div className="quick-actions__item-head">
            <span className="quick-actions__icon" aria-hidden="true">
              ⏰
            </span>
            <div className="quick-actions__copy">
              <p className="quick-actions__label">Lineup locks</p>
              <div className="quick-actions__locks">
                {lineupCopy.map((window) => (
                  <p className="quick-actions__context" key={`${window.day}-${window.time}`}>
                    {window.day}: {window.playersText} ({window.game}) · {window.time}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
