import type { GamePhase, Scoreline, TeamGameState } from '../../utils/liveScoreline';
import { gameTagFor, primaryNumber } from '../../utils/liveScoreline';

/**
 * A lineup row's numbers. See utils/liveScoreline.ts for the rule.
 *
 * Before his game: one number, the projection, as the Hub has always shown.
 * Once it starts: points scored take the big number, and the projection moves
 * underneath with a word on it. Two unlabelled one-decimal numbers stacked in
 * the same face are a guessing game, and "20.9 / 0.1 now" was read as twenty
 * points scored.
 *
 * `finalProjection` is what a FINAL row compares against. A live projection
 * converges on the actual score as the clock runs out, so by the final whistle
 * "proj" would just repeat the score. The pregame number is the one worth
 * reading beside a result.
 */
export function SlotNumbers({
  projection,
  finalProjection = null,
  scoreline,
  align = 'left',
}: {
  projection: string;
  finalProjection?: string | null;
  scoreline: Scoreline | null;
  align?: 'left' | 'right';
}) {
  const className = [
    'matchup-page__slot-numbers',
    align === 'right' ? 'matchup-page__slot-numbers--right' : '',
    scoreline?.started ? `matchup-page__slot-numbers--${scoreline.phase}` : '',
  ].filter(Boolean).join(' ');

  if (!scoreline?.started) {
    return (
      <span className={className}>
        <span className="matchup-page__slot-projection">{projection}</span>
      </span>
    );
  }

  const isFinal = scoreline.phase === 'final';
  const reference = isFinal ? finalProjection ?? projection : projection;
  return (
    <span className={className}>
      <span className="matchup-page__slot-scored" title={isFinal ? 'Final points' : 'Points scored'}>
        {primaryNumber(scoreline, projection)}
      </span>
      <span
        className="matchup-page__slot-proj-label"
        title={isFinal ? 'Projected before kickoff' : 'Projected final'}
      >
        proj {reference}
      </span>
    </span>
  );
}

/**
 * Where the player's game is: the clock while it runs, FINAL once it ends.
 *
 * It sits in the meta line where the kickoff time was, so that one spot always
 * answers "when": when it starts, where it is, that it is over. Live is the only
 * state with colour, cyan, which is the product's colour for live system state
 * and nothing else. Final is deliberately quiet: a settled result is not news.
 */
export function GameTag({
  phase,
  game,
  lead = true,
}: {
  phase: GamePhase | null;
  game?: TeamGameState | null;
  /** False when nothing precedes the tag on its line, so it sits flush. */
  lead?: boolean;
}) {
  if (!phase || phase === 'upcoming') return null;
  const label = gameTagFor(phase, game);
  if (!label) return null;
  return (
    <span
      className={[
        'matchup-page__game-tag',
        `matchup-page__game-tag--${phase}`,
        lead ? '' : 'matchup-page__game-tag--flush',
      ].filter(Boolean).join(' ')}
    >
      {phase === 'live' ? <span aria-hidden="true" className="matchup-page__game-tag-dot" /> : null}
      {label}
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
