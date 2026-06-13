import { useEffect } from 'react';
import { formatAmericanOdds } from '../../utils/formatOdds';
import './WeekDetailModal.css';

interface WeeklyLine {
  week: number;
  opponentName: string;
  moneyline: number;
  winProb: number;
  projection: number;
  opponentProjection: number;
}

interface WeekDetailModalProps {
  week: number;
  userTeamName: string;
  line: WeeklyLine | null;
  onClose: () => void;
}

/**
 * One week's projected matchup, opened from the schedule. Numbers come
 * straight from the engine's per-week pricing; if a week isn't priced
 * (bye, or projections not imported) we say so rather than guess.
 */
export function WeekDetailModal({ week, userTeamName, line, onClose }: WeekDetailModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const favored = line ? line.winProb >= 50 : false;
  const spread = line ? Math.abs(line.projection - line.opponentProjection) : 0;

  return (
    <div className="week-detail__scrim" onClick={onClose} role="presentation">
      <section
        aria-labelledby="week-detail-title"
        className="week-detail"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="week-detail__header">
          <div>
            <p className="week-detail__kicker">Week {week} projection</p>
            <h2 className="week-detail__title" id="week-detail-title">
              {line ? `${userTeamName} vs ${line.opponentName}` : `Week ${week}`}
            </h2>
          </div>
          <button
            aria-label="Close week detail"
            className="week-detail__close"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        {line ? (
          <>
            <div className="week-detail__teams">
              <div className="week-detail__team">
                <p className="week-detail__team-name">{userTeamName}</p>
                <p className="week-detail__proj">{line.projection.toFixed(1)}</p>
                <p className="week-detail__proj-label">projected</p>
              </div>
              <span className="week-detail__vs" aria-hidden="true">
                VS
              </span>
              <div className="week-detail__team week-detail__team--opp">
                <p className="week-detail__team-name">{line.opponentName}</p>
                <p className="week-detail__proj">{line.opponentProjection.toFixed(1)}</p>
                <p className="week-detail__proj-label">projected</p>
              </div>
            </div>

            <div className="week-detail__line">
              <div>
                <p className="week-detail__line-value">{formatAmericanOdds(line.moneyline)}</p>
                <p className="week-detail__line-label">your line</p>
              </div>
              <div>
                <p className="week-detail__line-value">{line.winProb.toFixed(0)}%</p>
                <p className="week-detail__line-label">win probability</p>
              </div>
              <div>
                <p className="week-detail__line-value">
                  {favored ? '−' : '+'}
                  {spread.toFixed(1)}
                </p>
                <p className="week-detail__line-label">spread</p>
              </div>
            </div>

            <p className="week-detail__note">
              {favored
                ? `You're projected to favor by ${spread.toFixed(1)}. Lineups can swing this before kickoff — it reprices when rosters change.`
                : `You're the underdog by ${spread.toFixed(1)} on projection. The right starts can still flip it.`}
            </p>
          </>
        ) : (
          <p className="week-detail__note">
            This week isn&apos;t priced yet. It&apos;s either a bye or waiting on a
            projections import.
          </p>
        )}
      </section>
    </div>
  );
}
