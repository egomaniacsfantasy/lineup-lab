import { useEffect } from 'react';
import './WelcomeCard.css';

interface WelcomeCardProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export function WelcomeCard({ isOpen, onDismiss }: WelcomeCardProps) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onDismiss]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-card__scrim" onClick={onDismiss} />
      <section className="welcome-card__panel">
        <p className="welcome-card__kicker">Welcome to Lineup Lab</p>
        <h2 className="welcome-card__title" id="welcome-title">
          Your lineup, priced.
        </h2>
        <p className="welcome-card__replay-note">2024 season replay · demo data</p>

        <div className="welcome-card__sections">
          <div className="welcome-card__section">
            <p className="welcome-card__label">What we do</p>
            <p className="welcome-card__copy">
              We price every decision in your lineup. Every starter is evaluated against
              your bench. Every swap moves the line.
            </p>
          </div>

          <div className="welcome-card__section">
            <p className="welcome-card__label">How it works</p>
            <p className="welcome-card__copy">
              Click a SWAP row to see what swapping in a bench player does to your win
              probability. The book moves in real time.
            </p>
          </div>

          <div className="welcome-card__section">
            <p className="welcome-card__label">What you get</p>
            <p className="welcome-card__copy">
              Sportsbook-grade odds for fantasy football. Powered by 10,000-iteration
              Monte Carlo simulation. No more guessing.
            </p>
          </div>
        </div>

        <button className="welcome-card__primary" onClick={onDismiss} type="button">
          Got it — show me my matchup
        </button>
        <button className="welcome-card__secondary" onClick={onDismiss} type="button">
          I&apos;ll explore on my own.
        </button>
      </section>
    </div>
  );
}
