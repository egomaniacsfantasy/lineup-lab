import { useEffect, useState } from 'react';
import './PricingOdds.css';

/**
 * A price being worked out, rather than a price.
 *
 * The hero used to print the engine's unpriced default, which is an even
 * market, so both sides read +100 for a second on every league switch. That is
 * not a blank, it is a confident claim that the game is a coin flip.
 *
 * A static placeholder fixes the lie but reads as broken. A book's board does
 * not sit still while it works, so this cycles plausible prices in the same
 * shape and width as the real one. It is obviously not settled, and it is
 * obviously not stuck.
 *
 * The numbers are decorative and deliberately never touch the engine: this
 * draws random values because they are meaningless. Anything derived from real
 * projections would be a half-computed price shown as if it were finished,
 * which is the problem it exists to solve.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY IT IS DIMMED AND MONOSPACED
 *
 * This was briefly replaced with a dash, because a report of a hero at -311
 * that "repriced" to +169 turned out to be two frames of THIS, read as the
 * book changing its mind by five hundred points. The diagnosis was right and
 * the fix was wrong: the churn is the design, and a frozen board is the worse
 * failure.
 *
 * What was actually wrong is that a frame of it was indistinguishable from a
 * settled quote in a screenshot. So the churn stays and the costume goes: it
 * is dimmed, it is set in the mono face rather than the price face every real
 * number on this screen uses, and it pulses. Still a moving board, no longer
 * something you can screenshot as a price.
 */
const FRAME_MS = 80;

function scramble(percent: boolean) {
  if (percent) return `${(Math.random() * 60 + 20).toFixed(1)}%`;
  const magnitude = Math.round(Math.random() * 260 + 105);
  return `${Math.random() < 0.5 ? '-' : '+'}${magnitude}`;
}

export function PricingOdds({
  percent = false,
  className = '',
}: {
  /** Match whichever format the user reads prices in. */
  percent?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(() => scramble(percent));

  useEffect(() => {
    /* Someone who has asked for less motion gets one still frame. */
    const reduced =
      typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const id = window.setInterval(() => setValue(scramble(percent)), FRAME_MS);
    return () => window.clearInterval(id);
  }, [percent]);

  return (
    <span
      aria-label="Pricing"
      className={['pricing-odds', className].filter(Boolean).join(' ')}
      role="status"
    >
      {value}
    </span>
  );
}
