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

const SCAN_MESSAGES = [
  'Scanning the market...',
  'Pricing every swap...',
  'Reading the room...',
];

export function SimulationLoader({
  label = 'Pricing',
  variant = 'trade',
  size = 'default',
  messages: customMessages,
}: {
  label?: string;
  variant?: 'trade' | 'evener' | 'scan';
  size?: 'default' | 'compact';
  messages?: string[];
}) {
  const messages = useMemo(
    () =>
      customMessages && customMessages.length > 0
        ? customMessages
        : variant === 'evener'
          ? EVENER_MESSAGES
          : variant === 'scan'
            ? SCAN_MESSAGES
            : DEFAULT_MESSAGES,
    [customMessages, variant],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [messages]);

  useEffect(() => {
    if (messages.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, 3400);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  return (
    <div
      className={[
        'simulation-loader',
        size === 'compact' ? 'simulation-loader--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-label={label}
    >
      <span className="simulation-loader__spinner" aria-hidden="true" />
      <span className="simulation-loader__copy">{messages[index]}</span>
    </div>
  );
}
