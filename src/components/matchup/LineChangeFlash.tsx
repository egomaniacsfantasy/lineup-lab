import { useEffect, useMemo, useState } from 'react';
import './LineChangeFlash.css';

interface LineChangeFlashProps {
  delta: number;
  visible: boolean;
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
        ? 'Previewing swap'
        : `Previewing swap · ${roundedDelta > 0 ? '+' : ''}${roundedDelta.toFixed(1)}%`;

    let hideTimer: number | null = null;

    const showTimer = window.setTimeout(() => {
      setMessage(nextMessage);
      setIsVisible(true);
      hideTimer = window.setTimeout(() => {
        setIsVisible(false);
      }, 3500);
    }, 0);

    return () => {
      window.clearTimeout(showTimer);

      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }
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
