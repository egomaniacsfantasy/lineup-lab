import type { GamePhase, Scoreline, TeamGameState } from '../../utils/liveScoreline';
import { gameTagFor, primaryNumber } from '../../utils/liveScoreline';

/**
 * A lineup row's numbers. See utils/liveScoreline.ts for the rule.
 *
 * Before his game: one number, the projection, as the Hub has always shown.
 * While it is on: points scored take the big number, and the projected final
 * sits underneath with a word on it. Two unlabelled one-decimal numbers stacked
 * in the same face are a guessing game, and "20.9 / 0.1 now" was read as twenty
 * points scored.
 *
 * Once it is over: the score and nothing else. A projection beside a settled
 * result is a second number on a row where nothing is left to happen, and on
 * the Hub it had converged on the score anyway, so every finished row read
 * "15.9 / proj 15.9". The row recedes instead (slot-card--final), which is what
 * says the game is done.
 */
export function SlotNumbers({
  projection,
  scoreline,
  align = 'left',
}: {
  projection: string;
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

  if (scoreline.phase === 'final') {
    return (
      <span className={className}>
        <span className="matchup-page__slot-scored" title="Final points">
          {primaryNumber(scoreline, projection)}
        </span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span className="matchup-page__slot-scored" title="Points scored">
        {primaryNumber(scoreline, projection)}
      </span>
      <span className="matchup-page__slot-proj-label" title="Projected final">
        proj {projection}
      </span>
    </span>
  );
}

/**
 * Where the player's game is, in the spot his kickoff time held: the clock
 * while it runs.
 *
 * A finished game prints no tag. Its row recedes instead (slot-card--final),
 * which says "over" without another word on the line. The word stays for
 * screen readers, which cannot see a row go grey.
 *
 * Live has no colour of its own. Green and red are money, amber is you, and a
 * game clock is neither: it is the brightest thing on a row whose finished
 * neighbours have gone quiet, and its dot pulses.
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
  if (phase === 'final') return <span className="visually-hidden">{label}</span>;
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
