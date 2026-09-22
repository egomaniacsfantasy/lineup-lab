import { NO_VALUE } from '../../utils/formatOdds';
import { playerShortName } from '../../utils/playerNames';

export interface WeekAheadSlot {
  slot: string;
  playerId: string | null;
  name: string;
  position: string | null;
  projection: number;
}

export interface WeekAheadFork {
  now: number;
  ifWin: number;
  ifLose: number;
}

/**
 * A week you have not played yet, on the Hub.
 *
 * The current week is the board: a line that moves, lineups people have set,
 * scores. A future week has none of that, and the honest difference is the
 * whole design. Nobody has set a week 11 lineup, so both sides are shown as the
 * best lineup each roster could field — which is also how the engine has always
 * priced future weeks for the Season tab and the futures sim. The page says so
 * rather than letting a projection pass for a decision somebody made.
 *
 * What it adds over a projection table is the fork: what the game is WORTH.
 * Playoff odds if you win against playoff odds if you lose is the number that
 * says which weeks decide your season, and it is the one thing a roster page
 * somewhere else structurally cannot tell you.
 *
 * The opponent is a name, a record and a price. Their best lineup eleven names
 * deep, five weeks out, would claim more than anybody knows about a manager who
 * has not opened the app yet.
 */
export function WeekAhead({
  week,
  opponentName,
  opponentRecord,
  priceLabel,
  winProbability,
  projection,
  opponentProjection,
  starters,
  fork,
  forkPending,
  changedIn,
}: {
  week: number;
  opponentName: string;
  opponentRecord: string | null;
  priceLabel: string;
  winProbability: number;
  projection: number;
  opponentProjection: number;
  starters: WeekAheadSlot[];
  fork: WeekAheadFork | null;
  forkPending: boolean;
  /** Player ids in this week's best lineup who are not in your lineup now. */
  changedIn: ReadonlySet<string>;
}) {
  const swing = fork ? Number((fork.ifWin - fork.ifLose).toFixed(1)) : null;

  return (
    <section className="matchup-page__module matchup-page__ahead">
      <div className="matchup-page__module-row">
        <span className="matchup-page__eyebrow">Week {week}</span>
        <span className="matchup-page__ahead-note">Best lineup vs best lineup</span>
      </div>

      <div className="matchup-page__ahead-head">
        <div className="matchup-page__ahead-line">
          <span className="matchup-page__hero-number">{priceLabel}</span>
          <span className="matchup-page__ahead-prob">{winProbability.toFixed(1)}% you</span>
        </div>
        <div className="matchup-page__ahead-opponent">
          <span className="matchup-page__ahead-vs">vs</span>
          <span className="matchup-page__ahead-name">{opponentName}</span>
          {opponentRecord ? (
            <span className="matchup-page__ahead-record">{opponentRecord}</span>
          ) : null}
          <span className="matchup-page__ahead-totals">
            Proj {projection.toFixed(1)} · them {opponentProjection.toFixed(1)}
          </span>
        </div>
      </div>

      {/* What the game is worth. A week whose two branches land in the same
          place is a week you can lose without it costing you, and that is worth
          knowing before you spend a waiver claim on it. */}
      <div className="matchup-page__ahead-fork">
        <span className="matchup-page__eyebrow">What this week is worth</span>
        {fork ? (
          <>
            <p className="matchup-page__ahead-fork-line">
              <span className="matchup-page__ahead-fork-leg">
                Win <strong>{fork.ifWin.toFixed(1)}%</strong>
              </span>
              <span className="matchup-page__ahead-fork-leg">
                Lose <strong>{fork.ifLose.toFixed(1)}%</strong>
              </span>
              <span className="matchup-page__ahead-fork-swing">{swing?.toFixed(1)}pp apart</span>
            </p>
            <p className="matchup-page__ahead-caption">
              Your playoff odds either way. They stand at {fork.now.toFixed(1)}% today.
            </p>
          </>
        ) : (
          <p className="matchup-page__ahead-caption">
            {forkPending
              ? 'Conditioning the season on both results...'
              : 'The conditioned run is not available for this week.'}
          </p>
        )}
      </div>

      <div className="matchup-page__ahead-lineup">
        <span className="matchup-page__eyebrow">Your best lineup that week</span>
        <ul className="matchup-page__ahead-list">
          {starters.map((slot, index) => (
            <li className="matchup-page__ahead-row" key={`${slot.slot}-${slot.playerId ?? index}`}>
              <span className="matchup-page__slot-tag">{slot.slot === 'FLEX' ? 'FLX' : slot.slot}</span>
              {slot.playerId ? (
                <>
                  <span className="matchup-page__ahead-player">
                    {/* The engine sends full names; every other lineup row in
                        the product is the short form. */}
                    {playerShortName(slot.name, slot.position)}
                    {changedIn.has(slot.playerId) ? (
                      /* He is not in your lineup today. A bye, a return, or a
                         bench player this week's schedule promotes: the point
                         of scrubbing forward is seeing it before it arrives. */
                      <span className="matchup-page__ahead-change">in</span>
                    ) : null}
                  </span>
                  <span className="matchup-page__ahead-projection">{slot.projection.toFixed(1)}</span>
                </>
              ) : (
                <>
                  <span className="matchup-page__ahead-player matchup-page__ahead-empty">
                    Nobody to start
                  </span>
                  <span className="matchup-page__ahead-projection">{NO_VALUE}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
