import type { GamePhase, Scoreline, TeamGameState } from '../../utils/liveScoreline';
import { gameTagFor, primaryNumber } from '../../utils/liveScoreline';
import './Scoreline.css';

/**
 * A lineup row's numbers. See utils/liveScoreline.ts for the rule.
 *
 * Before anyone in the matchup has kicked off: one number per row, the
 * projection, as the Hub has always shown. Every number means the same thing,
 * so none of them needs a word.
 *
 * Once the matchup is under way the column is a mix, and every number says
 * what it is:
 *
 *  - not kicked off yet: the projection, with "proj" under it
 *  - playing: points scored, with the projected final under it ("proj 17.1")
 *  - over: the final score, with "final" under it
 *
 * The finished row also recedes (slot-card--final), but a fade on its own was
 * read as nothing: on a Sunday with two 9:30 games done, the two faded scores
 * sat in a column of bright projections and nobody could say which numbers had
 * happened. Two unlabelled one-decimal numbers in the same face are a guessing
 * game, and the same is true of one unlabelled number in a column where its
 * neighbours mean something else.
 */
export function SlotNumbers({
  projection,
  scoreline,
  align = 'left',
  matchupStarted = false,
}: {
  projection: string;
  scoreline: Scoreline | null;
  align?: 'left' | 'right';
  /** True once anybody in the matchup has kicked off, which is when a bare
      number stops being self-explanatory. */
  matchupStarted?: boolean;
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
        {matchupStarted ? (
          <span className="matchup-page__slot-number-label matchup-page__slot-number-label--proj" title="Projected">
            proj
          </span>
        ) : null}
      </span>
    );
  }

  if (scoreline.phase === 'final') {
    return (
      <span className={className}>
        <span className="matchup-page__slot-scored" title="Final points">
          {primaryNumber(scoreline, projection)}
        </span>
        <span className="matchup-page__slot-number-label matchup-page__slot-number-label--final">
          final
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
 * A finished game prints no tag on the meta line: its row recedes
 * (slot-card--final) and its score carries "final" in the number column, so a
 * tag here would say it a third time. The word stays on the meta line for
 * screen readers, which read the line before the number.
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
