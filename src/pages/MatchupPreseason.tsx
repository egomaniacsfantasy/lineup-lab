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
          The gods return September 4.
        </h2>
        <p className="matchup-preseason__body">
          Until then: preview the season, replay the draft, build your trade leverage.
        </p>

        <div className="matchup-preseason__links">
          <Link className="matchup-preseason__link" to="/season">
            Preview the season →
          </Link>
          <Link className="matchup-preseason__link" to="/draft">
            Replay the draft →
          </Link>
          <Link className="matchup-preseason__link" to="/rankings">
            Rank players →
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
