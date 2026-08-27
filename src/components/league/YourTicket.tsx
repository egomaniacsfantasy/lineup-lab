import { formatAmericanOdds } from '../../utils/formatOdds';
import { formatMultiplier, type Ticket } from '../../utils/ticket';
import './YourTicket.css';

/**
 * The season so far, one closing price per week.
 *
 * Drawn only once there are three weeks to draw. Below that the line is two
 * points and a slope, which reads as a trend the season has not produced yet
 * — and this card's whole claim is that its numbers are a receipt rather than
 * a story told about one.
 */
function SeasonLine({ points, tone }: { points: { week: number; prob: number }[]; tone: string }) {
  if (points.length < 3) return null;

  const values = points.map((point) => point.prob);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(0.5, high - low);
  const width = 260;
  const height = 46;

  const at = (index: number, prob: number) => ({
    x: (index / (points.length - 1)) * width,
    y: height - ((prob - low) / span) * height,
  });

  const line = points
    .map((point, index) => {
      const { x, y } = at(index, point.prob);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const last = at(points.length - 1, values[values.length - 1]);

  return (
    <div className={`ticket__season ticket__season--${tone}`}>
      <svg
        aria-hidden="true"
        className="ticket__season-chart"
        viewBox={`0 -4 ${width} ${height + 8}`}
      >
        <path className="ticket__season-line" d={line} />
        <circle className="ticket__season-dot" cx={last.x} cy={last.y} r={3} />
      </svg>
      <span className="ticket__season-scale">
        <span>Wk {points[0].week}</span>
        <span>Wk {points[points.length - 1].week}</span>
      </span>
    </div>
  );
}

/**
 * Your preseason ticket, re-marked.
 *
 * Built as a printed slip rather than a dashboard card, because that is the
 * whole appeal: a thing you were handed before any of this happened, that is
 * now worth more or less than it was. The previous version stretched the same
 * six numbers across the full width of the page, so it read as a widget with
 * a lot of empty space in it — the fix was not more content, it was giving the
 * object a size. A ticket is something you hold.
 *
 * The lead fact is the rank move. "You opened ninth and you are second" is the
 * sentence a manager repeats out loud; the multiplier is the same news in a
 * quieter unit, and the two prices are the receipt underneath it. Ordered any
 * other way this card is a table of six figures with no argument.
 *
 * Every number is a reading of snapshots that already exist. Nothing here is
 * re-simulated, and there is no money anywhere — no stake, no payout, no
 * cash-out value. Value is carried by the prices, their implied
 * probabilities, and the multiplier, which is the honest version of the
 * cash-out feeling because the ratio of the probabilities is exactly what
 * changed.
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
  const climbed =
    ticket.rankOpen != null && ticket.rankNow != null && ticket.rankNow < ticket.rankOpen;
  const slipped =
    ticket.rankOpen != null && ticket.rankNow != null && ticket.rankNow > ticket.rankOpen;

  return (
    <section aria-labelledby="your-ticket-title" className={`ticket ticket--${tone}`}>
      <header className="ticket__head">
        <span className="ticket__kicker">Your ticket</span>
        <span className="ticket__placed">Placed Wk {openWeek}</span>
      </header>

      <h2 className="ticket__title" id="your-ticket-title">
        {teamName}
      </h2>
      <p className="ticket__market">to win {leagueName}</p>

      {/* The lead. A rank move is the one fact on this card that is a sentence
          rather than a figure, so it goes first and it goes big. */}
      {ticket.rankNow != null && (climbed || slipped) ? (
        <p className={`ticket__rank ticket__rank--${climbed ? 'up' : 'down'}`}>
          <span className="ticket__rank-from">#{ticket.rankOpen}</span>
          <span aria-hidden="true" className="ticket__rank-arrow">
            →
          </span>
          <span className="ticket__rank-to">#{ticket.rankNow}</span>
          <span className="ticket__rank-note">
            in the book{ticket.fieldSize != null ? ` of ${ticket.fieldSize}` : ''}
          </span>
        </p>
      ) : ticket.rankNow != null ? (
        <p className="ticket__rank ticket__rank--flat">
          <span className="ticket__rank-to">#{ticket.rankNow}</span>
          <span className="ticket__rank-note">
            in the book{ticket.fieldSize != null ? ` of ${ticket.fieldSize}` : ''}, where it opened
          </span>
        </p>
      ) : null}

      {/* The receipt itself, set like one. */}
      <dl className="ticket__lines">
        <div className="ticket__line">
          <dt>Opened</dt>
          <dd>
            {formatAmericanOdds(ticket.openOdds)}
            <span className="ticket__implied">{ticket.openProb.toFixed(1)}%</span>
          </dd>
        </div>
        <div className="ticket__line ticket__line--now">
          <dt>Now</dt>
          <dd>
            {formatAmericanOdds(ticket.nowOdds)}
            <span className="ticket__implied">{ticket.nowProb.toFixed(1)}%</span>
          </dd>
        </div>
        {/* Only when the best price is not the one printed directly above it. */}
        {ticket.peak && ticket.peak.prob > ticket.nowProb + 0.05 ? (
          <div className="ticket__line">
            <dt>Best</dt>
            <dd>
              {formatAmericanOdds(ticket.peak.odds)}
              <span className="ticket__implied">Wk {ticket.peak.week}</span>
            </dd>
          </div>
        ) : null}
      </dl>

      {/* The season and the stamp share the foot of the slip. The stamp was
          absolutely positioned over the card at first and landed on top of
          the chart's last week and its own axis label. */}
      <div className="ticket__foot">
        <SeasonLine points={ticket.series} tone={tone} />

        {/* Stamped rather than printed: the one part of the slip that was
            added after it was issued. */}
        <div className="ticket__stamp" role="presentation">
          {tone === 'flat' ? (
            <>
              <span className="ticket__stamp-value">Level</span>
              <span className="ticket__stamp-note">since open</span>
            </>
          ) : (
            <>
              <span className="ticket__stamp-value">{formatMultiplier(ticket.multiplier)}</span>
            <span className="ticket__stamp-note">since open</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
