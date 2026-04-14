import { Link } from 'react-router-dom';
import './AnalyzerProgress.css';

const TARGET_SUBMISSIONS = 10000;
const CURRENT_SUBMISSIONS = 1247;
const PROGRESS = (CURRENT_SUBMISSIONS / TARGET_SUBMISSIONS) * 100;

export function AnalyzerProgress() {
  return (
    <section aria-labelledby="analyzer-progress-title" className="analyzer-progress">
      <p className="analyzer-progress__kicker" id="analyzer-progress-title">
        Trade analyzer — coming Week 5
      </p>

      <div className="analyzer-progress__row">
        <span className="analyzer-progress__copy">
          Rankings submitted: {CURRENT_SUBMISSIONS.toLocaleString()} / {TARGET_SUBMISSIONS.toLocaleString()}
        </span>
        <span className="analyzer-progress__percent">{PROGRESS.toFixed(1)}%</span>
      </div>

      <div aria-hidden="true" className="analyzer-progress__bar">
        <span className="analyzer-progress__bar-fill" style={{ width: `${PROGRESS}%` }} />
      </div>

      <Link className="analyzer-progress__link" to="/rankings">
        Rank players to build values →
      </Link>
    </section>
  );
}
