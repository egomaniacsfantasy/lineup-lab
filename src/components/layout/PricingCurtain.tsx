import { useEffect, useMemo, useState } from 'react';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import './PricingCurtain.css';

const PRICING_LINES = [
  'Setting the line',
  'Balancing the book',
  'Reading every roster',
  'Finding the edge',
  'Moving the market',
  'Locking the number',
];

export function PricingCurtain() {
  const { stored, bootstrap, pricing, isLoading, error } = useLeagueConnection();
  const [lineIndex, setLineIndex] = useState(0);
  const showCurtain = Boolean(
    stored && !error && ((!bootstrap && isLoading) || (bootstrap && !pricing)),
  );
  const title = bootstrap ? 'Pricing your league' : 'Syncing your league';
  const activeLine = useMemo(
    () => PRICING_LINES[lineIndex % PRICING_LINES.length],
    [lineIndex],
  );

  useEffect(() => {
    if (!showCurtain) return undefined;

    const timer = window.setInterval(() => {
      setLineIndex((current) => (current + 1) % PRICING_LINES.length);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [showCurtain]);

  if (!showCurtain) return null;

  return (
    <div className="pricing-curtain" role="status" aria-live="polite" aria-label={title}>
      <div className="pricing-curtain__scrim" aria-hidden="true" />
      <section className="pricing-curtain__card" aria-busy="true">
        <span className="pricing-curtain__spinner" aria-hidden="true" />
        <p className="pricing-curtain__brand">ODDS GODS</p>
        <h2>{title}…</h2>
        <span className="pricing-curtain__progress" aria-hidden="true">
          <span className="pricing-curtain__progress-fill" />
        </span>
        <p className="pricing-curtain__line">{activeLine}…</p>
        <p className="pricing-curtain__sub">Hold the ticket. The book is moving.</p>
      </section>
    </div>
  );
}
