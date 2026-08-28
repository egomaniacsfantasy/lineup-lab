import { useEffect, useRef, useState } from 'react';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { MARKET_LABEL, legKey, parlayPrice, type ParlayLeg } from '../../utils/parlay';
import { slipAsText } from '../../utils/slipText';
import './BetSlip.css';

/**
 * The slip, pinned to the bottom of the board while you build it.
 *
 * Sticky rather than parked at the end of the page, because the thing it
 * prices is the board above it: a slip you have to scroll away from the cards
 * to read is a slip you cannot build against them. This is the one pattern
 * every sportsbook has converged on, and for that reason.
 *
 * It renders nothing at all with no legs on it. An empty slip inviting you to
 * add legs is a permanent bar across the bottom of a page that mostly is not
 * about betting.
 *
 * No money in here: no stake field, no payout, no balance. The number at the
 * bottom is what the parlay is worth, and what two people do about that
 * between themselves is their business. A test enforces it.
 */

interface BetSlipProps {
  legs: ParlayLeg[];
  week: number | null;
  onRemove: (key: string) => void;
  onClear: () => void;
}

export function BetSlip({ legs, week, onRemove, onClear }: BetSlipProps) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* The confirmation has to clear itself, and it has to stop doing that if
     the slip unmounts first, or the timer fires into a dead component. */
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  if (legs.length === 0) return null;

  const price = parlayPrice(legs);
  const legWord = legs.length === 1 ? 'pick' : 'legs';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(slipAsText(legs, week));
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard access can be refused, and there is nothing useful to say
         about it: the slip is on screen and can be read off it. */
    }
  };

  return (
    <aside aria-label="Your parlay" className={`bet-slip${open ? '' : ' bet-slip--closed'}`}>
      <button
        aria-expanded={open}
        className="bet-slip__handle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="bet-slip__count">{legs.length}</span>
        <span className="bet-slip__handle-label">
          {legs.length === 1 ? 'Single' : `${legs.length}-leg parlay`}
        </span>
        {/* The price rides the handle so it is readable closed. Building a
            slip is a loop of tap, look at the number, tap again, and folding
            the number away would break it. */}
        <span className="bet-slip__handle-price">{price == null ? '' : formatAmericanOdds(price)}</span>
        <span aria-hidden="true" className="bet-slip__chevron">
          {open ? '▾' : '▴'}
        </span>
      </button>

      {open ? (
        <div className="bet-slip__body">
          <ul className="bet-slip__legs">
            {legs.map((leg) => {
              const key = legKey(leg);
              return (
                <li className="bet-slip__leg" key={key}>
                  <span className="bet-slip__leg-copy">
                    <span className="bet-slip__leg-pick">
                      {leg.label}
                      {leg.line ? <span className="bet-slip__leg-line"> {leg.line}</span> : null}
                    </span>
                    <span className="bet-slip__leg-meta">
                      {MARKET_LABEL[leg.market]} · {leg.matchupLabel}
                    </span>
                  </span>
                  <span className="bet-slip__leg-price">{formatAmericanOdds(leg.price)}</span>
                  <button
                    aria-label={`Remove ${leg.label}`}
                    className="bet-slip__drop"
                    onClick={() => onRemove(key)}
                    type="button"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="bet-slip__foot">
            <span className="bet-slip__total">
              {/* "Fair" is the claim and it is worth making explicitly: this
                  is the price with no cut taken out of it, which is not the
                  price the same parlay gets anywhere else. */}
              <span className="bet-slip__total-label">Fair odds · {legs.length} {legWord}</span>
              <span className="bet-slip__total-price">
                {price == null ? '' : formatAmericanOdds(price)}
              </span>
            </span>
            <span className="bet-slip__actions">
              <button className="bet-slip__action" onClick={copy} type="button">
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button className="bet-slip__action" onClick={onClear} type="button">
                Clear
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
