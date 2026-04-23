import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Player, RosterSlot } from '../../types';
import type { TradeTarget } from '../../mocks/tradeTargets';
import type { LineupLockWindow, WaiverSuggestion } from '../../mocks/actions';
import { Gloss } from '../ui/Gloss';
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
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

function LightningIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M9.4 1.7 4.6 8.2h3.7l-1.7 6.1 4.8-6.7H7.8l1.6-5.9Z" />
    </svg>
  );
}

function ScalesIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M8 2.3v11.4" />
      <path d="M4.1 5h7.8" />
      <path d="M5.1 5 2.8 9.1h4.6L5.1 5Z" />
      <path d="m10.9 5-2.3 4.1h4.6L10.9 5Z" />
      <path d="M5.3 13.7h5.4" />
    </svg>
  );
}

function ExchangeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M8 2.2v11.6" />
      <path d="M5.2 5.1c-1.3.4-2.2 1.5-2.2 2.9 0 1.7 1.3 3 3 3h3.6" />
      <path d="m8.4 9.1 1.8 1.9-1.8 1.8" />
      <path d="M10.8 10.9c1.3-.4 2.2-1.5 2.2-2.9 0-1.7-1.3-3-3-3H6.4" />
      <path d="M7.6 6.9 5.8 5l1.8-1.8" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M4.2 2.4h7.6" />
      <path d="M4.2 13.6h7.6" />
      <path d="M5.2 2.4c0 3.4 1.4 4 2.8 5.6-1.4 1.6-2.8 2.2-2.8 5.6" />
      <path d="M10.8 2.4c0 3.4-1.4 4-2.8 5.6 1.4 1.6 2.8 2.2 2.8 5.6" />
    </svg>
  );
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
    return lineupLocks.map((window) => {
      const primaryPlayer = window.players[0]?.replace(/^J\\.\\s*/, '') ?? 'This slot';
      const lockCopy =
        window.day === 'Thursday'
          ? `${primaryPlayer} locks Thu ${window.time} (${window.game})`
          : 'All other slots lock Sun 1:00 PM ET';

      return {
        ...window,
        lockCopy,
      };
    });
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
              <LightningIcon />
            </span>
            <div className="quick-actions__copy">
              <p className="quick-actions__label">Biggest swing</p>
              {biggestSwing ? (
                <>
                  <p className="quick-actions__headline">
                    {biggestSwing.starter.shortName} → {biggestSwing.alternative.shortName}:{' '}
                    {formatSwing(biggestSwing.delta)} <Gloss term="win-prob">win prob</Gloss>
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
              <ScalesIcon />
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
              <ExchangeIcon />
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
              <HourglassIcon />
            </span>
            <div className="quick-actions__copy">
              <p className="quick-actions__label">Lineup locks</p>
              <div className="quick-actions__locks">
                {lineupCopy.map((window) => (
                  <p className="quick-actions__context" key={`${window.day}-${window.time}`}>
                    {window.lockCopy}
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
