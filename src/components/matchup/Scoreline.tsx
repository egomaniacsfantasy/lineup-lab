import { NO_VALUE } from '../../utils/formatOdds';
import type { ScoreMode, Scoreline } from '../../utils/liveScoreline';

/**
 * A lineup row's numbers.
 *
 * Projection mode is the Hub as it always was: one number. Scoreboard mode
 * leads with points scored and carries the projection beneath it with a word
 * on it, because two unlabelled one-decimal numbers stacked in the same face
 * are a guessing game, and "20.9 / 0.1 now" was read as twenty points scored.
 *
 * A player who has not kicked off gets a dash, not 0.0: a zero is a score.
 */
export function SlotNumbers({
  mode,
  projection,
  scoreline,
  align = 'left',
}: {
  mode: ScoreMode;
  projection: string;
  scoreline: Scoreline | null;
  align?: 'left' | 'right';
}) {
  const className = [
    'matchup-page__slot-numbers',
    align === 'right' ? 'matchup-page__slot-numbers--right' : '',
  ].filter(Boolean).join(' ');

  if (mode === 'projection') {
    return (
      <span className={className}>
        <span className="matchup-page__slot-projection">{projection}</span>
      </span>
    );
  }

  const scored = scoreline?.scored ?? null;
  return (
    <span className={`${className} matchup-page__slot-numbers--scoreboard`}>
      <span
        className={[
          'matchup-page__slot-scored',
          scored == null ? 'matchup-page__slot-scored--pending' : '',
        ].filter(Boolean).join(' ')}
        title={scored == null ? 'Game not started' : 'Points scored'}
      >
        {scored == null ? NO_VALUE : scored.toFixed(1)}
      </span>
      <span className="matchup-page__slot-proj-label" title="Projected final">
        proj {projection}
      </span>
    </span>
  );
}

/** A team's score under the head-to-head: scored first once games are on. */
export function TeamScoreline({ projection, scored }: { projection: string; scored: number | null }) {
  if (scored == null) {
    return (
      <p className="matchup-page__meta-copy">
        Proj{' '}
        <span className="matchup-page__inline-number">{projection}</span>{' '}
        pts
      </p>
    );
  }
  return (
    <p className="matchup-page__meta-copy matchup-page__team-scoreline">
      <span className="matchup-page__team-scored" title="Points scored">{scored.toFixed(1)}</span>
      <span className="matchup-page__team-scored-unit">pts</span>
      <span className="matchup-page__team-proj" title="Projected final">proj {projection}</span>
    </p>
  );
}
