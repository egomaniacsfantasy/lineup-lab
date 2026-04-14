import { Link } from 'react-router-dom';
import { MOCK_SCHEDULE_PREVIEW } from '../mocks';
import { formatAmericanOdds } from '../utils/formatOdds';
import './MatchupPreseason.css';

const OPENING_PREVIEW = MOCK_SCHEDULE_PREVIEW[0];

function formatImpliedProbability(odds: number) {
  const absoluteOdds = Math.abs(odds);

  if (odds < 0) {
    return ((absoluteOdds / (absoluteOdds + 100)) * 100).toFixed(1);
  }

  return ((100 / (absoluteOdds + 100)) * 100).toFixed(1);
}

export function MatchupPreseason() {
  return (
    <div className="matchup-preseason">
      <h1 className="visually-hidden">Pre-season matchup preview</h1>

      <section className="matchup-preseason__hero">
        <p className="matchup-preseason__kicker">Your matchup line</p>
        <h2 className="matchup-preseason__title">
          Season starts September 4.
        </h2>
        <p className="matchup-preseason__body">
          Your live matchup board opens Week 1. Until then, use Lineup Lab to
          preview the season, review your draft, and build trade value context.
        </p>

        <div className="matchup-preseason__links">
          <Link className="matchup-preseason__link" to="/season">
            Check your season outlook
          </Link>
          <Link className="matchup-preseason__link" to="/draft">
            Explore draft tools
          </Link>
          <Link className="matchup-preseason__link" to="/rankings">
            Rank players to build trade values
          </Link>
        </div>
      </section>

      <section className="matchup-preseason__preview-card">
        <p className="matchup-preseason__preview-kicker">Week 1 preview</p>
        <h2 className="matchup-preseason__preview-title">
          vs. {OPENING_PREVIEW.opponent}
        </h2>
        <p className="matchup-preseason__preview-line">
          Pre-season line: {formatAmericanOdds(OPENING_PREVIEW.yourLine)} (
          {formatImpliedProbability(OPENING_PREVIEW.yourLine)}%)
        </p>
        <p className="matchup-preseason__preview-meta">
          Opens live September 4
        </p>
      </section>
    </div>
  );
}
