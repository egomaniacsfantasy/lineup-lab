import { useState } from 'react';

export interface LineupChanges {
  /** Players the best lineup starts that this lineup does not. */
  in: string[];
  /** Players this lineup starts that the best lineup benches. */
  out: string[];
}

/**
 * What the line would be if both managers fielded their best lineup.
 *
 * BOTH, not just yours. Optimising only your side prices a mistake the opponent
 * has not made yet, and hands you win probability that exists solely because
 * they have not looked at their lineup. So the number can go DOWN: if the stud
 * on the bench is theirs, "both at best" is worse for you than the board says,
 * and that is a real thing to know before you feel safe.
 *
 * It is a hypothetical and never replaces the board. The real line stays where
 * it is, in the same place, at the same size; this opens underneath it and
 * closes again. Nothing here changes a lineup either: the swaps are yours to
 * make in Sleeper or ESPN, and the panel says whose they are.
 *
 * Closed by default. On a screen somebody opens to find out where they stand,
 * a hypothetical that greets them unasked competes with the answer.
 */
export function BestLineups({
  changes,
  opponentChanges,
  nowLabel,
  bestLabel,
  deltaWinProb,
  started,
}: {
  changes: LineupChanges;
  opponentChanges: LineupChanges;
  /* Already formatted by the page, so this panel and the board it opens under
     can never disagree about the odds format or about an unpriced league. */
  nowLabel: string;
  bestLabel: string;
  deltaWinProb: number;
  /** True once anybody in the matchup has kicked off. */
  started: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (started) {
    /* Once a game is under way the engine's best lineup would happily bench a
       player who has already played, which is not a lineup anybody can set. The
       honest move is to say so rather than to price an impossible week. */
    return (
      <p className="matchup-page__best-note">
        Games have started, so a best lineup is no longer one you could set.
      </p>
    );
  }

  const nothingToDo = changes.in.length === 0 && opponentChanges.in.length === 0;

  return (
    <div className="matchup-page__best">
      <button
        aria-expanded={open}
        className="matchup-page__best-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {open ? 'Hide best lineups' : 'If we both start our best'}
      </button>

      {open ? (
        <div className="matchup-page__best-panel">
          {nothingToDo ? (
            <p className="matchup-page__best-note">
              Both lineups are already the best either of you can field. The line is the line.
            </p>
          ) : (
            <>
              <p className="matchup-page__best-line">
                <span className="matchup-page__best-from">{nowLabel}</span>
                <span aria-hidden="true" className="matchup-page__best-arrow">
                  {'→'}
                </span>
                <span className="matchup-page__best-to">{bestLabel}</span>
                <span className="matchup-page__best-delta">
                  {deltaWinProb > 0 ? '+' : ''}{deltaWinProb.toFixed(1)}pp
                </span>
              </p>

              <div className="matchup-page__best-sides">
                <ChangeList changes={changes} label="You would start" />
                <ChangeList changes={opponentChanges} label="They would start" />
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChangeList({ changes, label }: { changes: LineupChanges; label: string }) {
  return (
    <div className="matchup-page__best-side">
      <span className="matchup-page__eyebrow">{label}</span>
      {changes.in.length === 0 ? (
        <p className="matchup-page__best-note">Nothing. That lineup is already the best one.</p>
      ) : (
        <ul className="matchup-page__best-list">
          {changes.in.map((name, index) => (
            <li className="matchup-page__best-change" key={name}>
              <span className="matchup-page__best-in">{name}</span>
              {changes.out[index] ? (
                <span className="matchup-page__best-out">for {changes.out[index]}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
