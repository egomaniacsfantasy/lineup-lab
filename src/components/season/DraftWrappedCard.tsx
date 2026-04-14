import type { DraftWrappedData } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import './DraftWrappedCard.css';

interface DraftWrappedCardProps {
  draftWrapped: DraftWrappedData;
  onShare?: () => void;
}

export function DraftWrappedCard({
  draftWrapped,
  onShare,
}: DraftWrappedCardProps) {
  return (
    <section aria-labelledby="draft-wrapped-title" className="draft-wrapped-card">
      <div className="draft-wrapped-card__header">
        <p className="draft-wrapped-card__kicker">Draft wrapped</p>
        <h2 className="draft-wrapped-card__title" id="draft-wrapped-title">
          {draftWrapped.teamName}
        </h2>
        <p className="draft-wrapped-card__league">{draftWrapped.leagueName}</p>
      </div>

      <div className="draft-wrapped-card__hero">
        <div className="draft-wrapped-card__hero-block">
          <span className="draft-wrapped-card__label">Roster grade</span>
          <span className="draft-wrapped-card__value">{draftWrapped.rosterGrade}</span>
        </div>
        <div className="draft-wrapped-card__hero-block">
          <span className="draft-wrapped-card__label">Championship</span>
          <span className="draft-wrapped-card__value draft-wrapped-card__value--amber">
            {formatAmericanOdds(draftWrapped.championshipOdds)}
          </span>
        </div>
      </div>

      <div className="draft-wrapped-card__detail-block">
        <span className="draft-wrapped-card__label">Boldest pick</span>
        <p className="draft-wrapped-card__body">
          {draftWrapped.boldestPick.player.shortName} — picked{' '}
          {draftWrapped.boldestPick.pickNumber}
          th ({draftWrapped.boldestPick.adpDelta} above model)
        </p>
      </div>

      <div className="draft-wrapped-card__split">
        <div className="draft-wrapped-card__split-card">
          <span className="draft-wrapped-card__label">Toughest week</span>
          <p className="draft-wrapped-card__body">
            Wk {draftWrapped.toughestMatchup.week}: {' '}
            {formatAmericanOdds(draftWrapped.toughestMatchup.odds)}
          </p>
          <p className="draft-wrapped-card__meta">
            vs {draftWrapped.toughestMatchup.opponent}
          </p>
        </div>
        <div className="draft-wrapped-card__split-card">
          <span className="draft-wrapped-card__label">Easiest week</span>
          <p className="draft-wrapped-card__body">
            Wk {draftWrapped.easiestMatchup.week}: {' '}
            {formatAmericanOdds(draftWrapped.easiestMatchup.odds)}
          </p>
          <p className="draft-wrapped-card__meta">
            vs {draftWrapped.easiestMatchup.opponent}
          </p>
        </div>
      </div>

      <button
        className="draft-wrapped-card__share"
        onClick={onShare}
        type="button"
      >
        Share your draft
      </button>
    </section>
  );
}
