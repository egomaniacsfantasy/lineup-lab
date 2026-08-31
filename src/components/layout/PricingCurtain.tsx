import { useEffect, useMemo, useState } from 'react';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { PRICING_LINES } from './pricingLines';
import './PricingCurtain.css';

const PRICING_CURTAIN_SEEN_KEY = 'og.pricingCurtain.seenThisSession';

export function PricingCurtain() {
  const { stored, bootstrap, pricing, isLoading, error } = useLeagueConnection();
  const [lineIndex, setLineIndex] = useState(0);
  const [hasShownThisSession, setHasShownThisSession] = useState(
    () => window.sessionStorage.getItem(PRICING_CURTAIN_SEEN_KEY) === 'true',
  );
  const wouldShowCurtain = Boolean(
    stored && !error && ((!bootstrap && isLoading) || (bootstrap && !pricing)),
  );
  const showCurtain = wouldShowCurtain && !hasShownThisSession;
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

    return () => {
      window.clearInterval(timer);
      window.sessionStorage.setItem(PRICING_CURTAIN_SEEN_KEY, 'true');
      setHasShownThisSession(true);
    };
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
      </section>
    </div>
  );
}
