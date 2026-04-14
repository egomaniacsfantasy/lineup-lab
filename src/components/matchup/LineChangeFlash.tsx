import { useEffect, useMemo, useState } from 'react';
import './LineChangeFlash.css';

interface LineChangeFlashProps {
  delta: number;
  visible: boolean;
}

const POSITIVE_MESSAGES = [
  'The gods approve.',
  'The line moves in your favor.',
  'Smart play. The odds agree.',
  'Fortune favors the bold.',
];

const NEGATIVE_MESSAGES = [
  "Bold move. The line doesn't love it.",
  'The odds shift against you.',
  'Risky. The gods are watching.',
  'The line tightens.',
];

function pickMessage(delta: number) {
  if (delta > 0) {
    return POSITIVE_MESSAGES[Math.floor(Math.random() * POSITIVE_MESSAGES.length)];
  }

  if (delta < 0) {
    return NEGATIVE_MESSAGES[Math.floor(Math.random() * NEGATIVE_MESSAGES.length)];
  }

  return 'No change. The line holds.';
}

export function LineChangeFlash({ delta, visible }: LineChangeFlashProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState('');

  const roundedDelta = useMemo(() => Math.round(delta * 10) / 10, [delta]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const nextMessage =
      roundedDelta === 0
        ? pickMessage(0)
        : `${pickMessage(roundedDelta)} ${roundedDelta > 0 ? '+' : ''}${roundedDelta.toFixed(1)}%`;

    setMessage(nextMessage);
    setIsVisible(true);

    const hideTimer = window.setTimeout(() => {
      setIsVisible(false);
    }, 2000);

    return () => {
      window.clearTimeout(hideTimer);
    };
  }, [roundedDelta, visible]);

  return (
    <div
      className={[
        'line-change-flash',
        isVisible ? 'line-change-flash--visible' : '',
        roundedDelta > 0
          ? 'line-change-flash--positive'
          : roundedDelta < 0
            ? 'line-change-flash--negative'
            : 'line-change-flash--neutral',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
