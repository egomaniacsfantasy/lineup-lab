import { useEffect, useState } from 'react';

/**
 * Steps an index through a marketing reel.
 *
 * Holds still for anyone who has asked their machine to stop animating, and
 * stops while the tab is hidden so a backgrounded landing page is not
 * repainting forever.
 */
export function useReel(length: number, intervalMs: number, startDelayMs = 0) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (length <= 1) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduced?.matches) return;

    let intervalId: number | undefined;
    const advance = () => {
      if (document.hidden) return;
      setIndex((current) => (current + 1) % length);
    };

    const startId = window.setTimeout(() => {
      advance();
      intervalId = window.setInterval(advance, intervalMs);
    }, startDelayMs + intervalMs);

    return () => {
      window.clearTimeout(startId);
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [length, intervalMs, startDelayMs]);

  return index;
}
