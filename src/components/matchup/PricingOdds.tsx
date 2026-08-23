import { useEffect, useState } from 'react';

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
