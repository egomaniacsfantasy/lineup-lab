import { useEffect, useMemo, useState } from 'react';
import './SimulationLoader.css';

const DEFAULT_MESSAGES = [
  'Pricing this trade...',
  'Simulating the rest of your season...',
  'Running both rosters 10,000 times...',
  'Moving the line...',
  'Checking their depth chart...',
  'Setting the price...',
];

const EVENER_MESSAGES = [
  'Hunting for the piece that evens it...',
  'Testing fair adds...',
  'Checking both rosters...',
  'Moving the line...',
  'Setting the price...',
];

export function SimulationLoader({
  label = 'Pricing',
  variant = 'trade',
}: {
  label?: string;
  variant?: 'trade' | 'evener';
}) {
  const messages = useMemo(
    () => (variant === 'evener' ? EVENER_MESSAGES : DEFAULT_MESSAGES),
    [variant],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % messages.length),
      3400,
    );
    return () => window.clearInterval(timer);
  }, [messages.length]);

  return (
    <div className="simulation-loader" role="status" aria-label={label}>
      <span className="simulation-loader__spinner" aria-hidden="true" />
      <span className="simulation-loader__copy">{messages[index]}</span>
    </div>
  );
}
