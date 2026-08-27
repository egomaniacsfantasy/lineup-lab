import { formatAmericanOdds } from '../../utils/formatOdds';
import { formatMultiplier, type Ticket } from '../../utils/ticket';
import './YourTicket.css';

/**
 * A sparkline of the ticket's own price, drawn from stored snapshots.
 *
 * Scaled to its own range rather than to 0-100, because a title price that
 * moved from 9% to 12% is a real swing in the life of a ticket and would be a
 * flat line on an absolute axis. The only claim it makes is relative shape,
 * and the numbers beside it carry the levels.
 */
function Sparkline({ points, tone }: { points: { prob: number }[]; tone: string }) {
  if (points.length < 2) return null;

  const values = points.map((point) => point.prob);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(0.4, high - low);
  const width = 160;
  const height = 40;

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.prob - low) / span) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const lastX = width;
  const lastY = height - ((values[values.length - 1] - low) / span) * height;

  return (
    <svg
      aria-hidden="true"
      className={`ticket__spark ticket__spark--${tone}`}
      preserveAspectRatio="none"
      viewBox={`0 -3 ${width} ${height + 6}`}
    >
      <path className="ticket__spark-line" d={path} />
      <circle className="ticket__spark-dot" cx={lastX} cy={lastY} r={2.6} />
    </svg>
  );
}

/**
 * The preseason ticket, re-marked.
 *
 * Shaped like a ticket because that is the emotional object: a thing you were
 * handed before any of this happened, that is now worth more or less than it
 * was. The whole appeal is that the opening price is a receipt, quoted before
 * the season and never retconned.
 *
 * The first build put all of that in the left third of a card twelve hundred
 * pixels wide, at caption size, and left the rest empty — a receipt with
 * nothing on it. This one is laid out as the object it is imitating: a stub
 * you tear off, the bet written across the middle, and what the position is
 * worth now down the right.
 *
 * Three facts were added, and all three are readings of snapshots that already
 * exist rather than anything re-simulated. The sparkline is the ticket's own
 * recorded price path, which is what makes it feel alive rather than printed.
 * The peak is the high-water mark — the "you could have cashed out at" number,
 * which is most of why anyone re-reads a ticket. The rank is a count of teams
 * priced shorter in a book the engine already produced.
 *
 * What is still deliberately absent: money. No stake, no payout, no cash-out
 * value. Value is carried by the two prices, their implied probabilities, and
 * a multiplier — the honest version of the cash-out feeling, because the ratio
 * of the probabilities is exactly what changed.
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
  const openWeek = ticket.series[0]?.week ?? 1;
  const rankMoved =
    ticket.rankOpen != null && ticket.rankNow != null && ticket.rankOpen !== ticket.rankNow;

  return (
    <section aria-labelledby="your-ticket-title" className={`ticket ticket--${tone}`}>
      <div className="ticket__stub">
        <span className="ticket__stub-label">Opened</span>
        <span className="ticket__stub-week">Week {openWeek}</span>
        {ticket.weeksHeld != null ? (
          <span className="ticket__stub-held">
            Held {ticket.weeksHeld} {ticket.weeksHeld === 1 ? 'week' : 'weeks'}
          </span>
        ) : null}
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

          <span aria-hidden="true" className="ticket__arrow">
            →
          </span>

          <span className="ticket__price ticket__price--now">
            <span className="ticket__price-label">Now</span>
            <span className="ticket__price-value">{formatAmericanOdds(ticket.nowOdds)}</span>
            <span className="ticket__price-prob">{ticket.nowProb.toFixed(1)}%</span>
          </span>
        </div>

        <dl className="ticket__facts">
          {/* The high-water mark is only worth printing when it is not the
              price you are already looking at. "Best: the number above it" is
              a row that says nothing. */}
          {ticket.peak && ticket.peak.prob > ticket.nowProb + 0.05 ? (
            <div className="ticket__fact">
              <dt>Best</dt>
              <dd>
                {formatAmericanOdds(ticket.peak.odds)}
                <span className="ticket__fact-note">Week {ticket.peak.week}</span>
              </dd>
            </div>
          ) : null}

          {ticket.rankNow != null ? (
            <div className="ticket__fact">
              <dt>In the book</dt>
              <dd>
                #{ticket.rankNow}
                {ticket.fieldSize != null ? ` of ${ticket.fieldSize}` : ''}
                {rankMoved ? (
                  <span className="ticket__fact-note">Opened #{ticket.rankOpen}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="ticket__value">
        {/* The multiplier, not a dollar figure. 10% to 17.4% is 1.74x, and
            that ratio is the only thing that actually changed. */}
        {tone === 'flat' ? (
          <>
            <span className="ticket__multiplier">Level</span>
            <p className="ticket__verdict-copy">The market has not moved on you.</p>
          </>
        ) : (
          <>
            <span className="ticket__multiplier">{formatMultiplier(ticket.multiplier)}</span>
            <p className="ticket__verdict-copy">
              what it opened at, {tone === 'up' ? 'in your favour' : 'against you'}
            </p>
          </>
        )}
        <Sparkline points={ticket.series} tone={tone} />
      </div>
    </section>
  );
}
