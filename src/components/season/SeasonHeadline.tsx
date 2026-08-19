import { formatAmericanOdds } from '../../utils/formatOdds';
import './SeasonHeadline.css';

interface SeasonHeadlineProps {
  title: string;
  recordValue: string;
  recordLabel: string;
  /* null when this team's futures have not been priced. A season outlook is
     the most quotable thing on the screen, so the one number it must never do
     is invent one: a connected user was being shown the demo league's
     championship odds and playoff probability as their own. */
  championshipOdds: number | null;
  recordRange?: {
    best: string;
    worst: string;
    median: string;
  };
  playoffProbability: number | null;
  leagueRank: number;
  live?: boolean;
}

export function SeasonHeadline({
  title,
  recordValue,
  recordLabel,
  championshipOdds,
  recordRange,
  playoffProbability,
  leagueRank,
  live = false,
}: SeasonHeadlineProps) {
  return (
    <section aria-labelledby="season-headline-title" className="season-headline">
      <div className="season-headline__kicker-row">
        <p className="season-headline__kicker">{title}</p>
        {live ? (
          <span className="season-headline__live">
            <span className="season-headline__live-dot" aria-hidden="true" />
            Live
          </span>
        ) : null}
      </div>

      <div className="season-headline__grid">
        <div className="season-headline__metric">
          <span className="season-headline__label">{recordLabel}</span>
          <h2 className="season-headline__value" id="season-headline-title">
            {recordValue}
          </h2>
          {recordRange ? (
            <p className="season-headline__range">
              Range {recordRange.worst} to {recordRange.best}
            </p>
          ) : null}
        </div>

        <div className="season-headline__metric">
          <span className="season-headline__label">Championship odds</span>
          <p className="season-headline__value season-headline__value--amber">
            {championshipOdds != null ? formatAmericanOdds(championshipOdds) : 'Not priced'}
          </p>
          {recordRange ? (
            <p className="season-headline__range">Median {recordRange.median}</p>
          ) : null}
        </div>
      </div>

      <div className="season-headline__bar-block">
        <div className="season-headline__bar-copy">
          <span className="season-headline__label">Playoff probability</span>
          <span className="season-headline__bar-value">
            {playoffProbability != null ? `${playoffProbability.toFixed(1)}%` : 'Not priced yet'}
          </span>
        </div>
        <div className="season-headline__bar" aria-hidden="true">
          <span
            className="season-headline__bar-fill"
            style={{ width: `${playoffProbability ?? 0}%` }}
          />
        </div>
      </div>

      <p className="season-headline__rank">
        League rank <span className="season-headline__rank-value">#{leagueRank}</span>
      </p>
    </section>
  );
}
