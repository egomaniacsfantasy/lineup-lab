import { formatAmericanOdds } from '../../utils/formatOdds';
import { formatMultiplier, type Ticket } from '../../utils/ticket';
import './YourTicket.css';

/**
 * The preseason ticket, re-marked.
 *
 * Shaped like a ticket because that is the emotional object: a thing you were
 * handed before any of this happened, that is now worth more or less than it
 * was. The whole appeal is that the opening price is a receipt, quoted before
 * the season and never retconned.
 *
 * What is deliberately absent: money. No stake, no payout, no cash-out value.
 * Value is carried by the two prices, the two implied probabilities, and a
 * multiplier — which is the honest version of the cash-out feeling, because
 * the ratio of the probabilities is exactly what changed.
 */
export function YourTicket({
  ticket,
  teamName,
  leagueName,
}: {
  ticket: Ticket;
  teamName: string;
  leagueName: string;
}) {
  const tone = ticket.direction;

  return (
    <section aria-labelledby="your-ticket-title" className={`ticket ticket--${tone}`}>
      <div className="ticket__stub">
        <span className="ticket__stub-label">Opened</span>
        <span className="ticket__stub-week">Week 1</span>
      </div>

      <div className="ticket__body">
        <p className="ticket__kicker">Your ticket</p>
        <h2 className="ticket__title" id="your-ticket-title">
          {teamName} to win {leagueName}
        </h2>

        <div className="ticket__prices">
          <span className="ticket__price ticket__price--open">
            <span className="ticket__price-label">Opened</span>
            <span className="ticket__price-value">{formatAmericanOdds(ticket.openOdds)}</span>
            <span className="ticket__price-prob">{ticket.openProb.toFixed(1)}%</span>
          </span>

          <span aria-hidden="true" className="ticket__arrow">→</span>

          <span className="ticket__price ticket__price--now">
            <span className="ticket__price-label">Now</span>
            <span className="ticket__price-value">{formatAmericanOdds(ticket.nowOdds)}</span>
            <span className="ticket__price-prob">{ticket.nowProb.toFixed(1)}%</span>
          </span>
        </div>

        {/* The multiplier, not a dollar figure. 10% to 17.4% is 1.74x, and that
            ratio is the only thing that actually changed. */}
        {tone === 'flat' ? (
          <p className="ticket__verdict">The market has not moved on you.</p>
        ) : (
          <p className="ticket__verdict">
            <span className="ticket__multiplier">{formatMultiplier(ticket.multiplier)}</span>
            <span className="ticket__verdict-copy">
              what it opened at, {tone === 'up' ? 'in your favour' : 'against you'}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
