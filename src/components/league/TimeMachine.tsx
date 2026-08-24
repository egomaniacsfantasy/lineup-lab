import { useMemo, useState } from 'react';
import type { LineHistoryEntry } from '../../services/leagueApi';
import { formatAmericanOdds } from '../../utils/formatOdds';
import {
  availableWeeks,
  boardAsOf,
  compareToNow,
  receiptSentence,
} from '../../utils/timeMachine';
import './TimeMachine.css';

/**
 * Scrub the board back to any week we actually priced.
 *
 * The point is receipts, so the design is built around one sentence a person
 * could say out loud and be backed up on: "I was 8.3% a month ago." That line
 * leads, the table under it is the evidence, and the control that moves
 * between weeks is deliberately small — this is a thing you check, not a thing
 * you play with.
 *
 * Renders nothing at all with fewer than two priced weeks. A scrubber with one
 * stop is a control that cannot do anything, and early in a season that is the
 * honest state rather than something to fill.
 */
export function TimeMachine({
  history,
  userRosterId,
  teamName,
  nameFor,
}: {
  history: LineHistoryEntry[] | null | undefined;
  userRosterId: number | string | null | undefined;
  teamName: string;
  nameFor: (rosterId: string) => string | null;
}) {
  const weeks = useMemo(() => availableWeeks(history ?? []), [history]);
  const latestWeek = weeks.at(-1) ?? null;
  const [selected, setSelected] = useState<number | null>(null);

  /* Default to the earliest week we hold, because the further back it reaches
     the more the feature is worth. */
  const week = selected ?? weeks[0] ?? null;

  const deltas = useMemo(() => {
    if (week == null || latestWeek == null) return [];
    return compareToNow(boardAsOf(history ?? [], week), boardAsOf(history ?? [], latestWeek));
  }, [history, week, latestWeek]);

  if (weeks.length < 2 || week == null) return null;

  const yours = userRosterId == null
    ? null
    : deltas.find((delta) => delta.rosterId === String(userRosterId)) ?? null;
  const receipt = receiptSentence(yours, teamName, week);

  const ranked = [...deltas]
    .filter((delta) => delta.thenProb != null || delta.nowProb != null)
    .sort((a, b) => (b.nowProb ?? -1) - (a.nowProb ?? -1));

  return (
    <section aria-labelledby="time-machine-title" className="time-machine">
      <header className="time-machine__head">
        <div>
          <p className="time-machine__kicker">The time machine</p>
          <h2 className="time-machine__title" id="time-machine-title">
            The board after Week {week}
          </h2>
        </div>

        <label className="time-machine__control">
          <span className="time-machine__control-label">Rewind to</span>
          <select
            className="time-machine__select"
            onChange={(event) => setSelected(Number(event.target.value))}
            value={week}
          >
            {weeks.map((option) => (
              <option key={option} value={option}>
                Week {option}
              </option>
            ))}
          </select>
        </label>
      </header>

      {receipt ? <p className="time-machine__receipt">{receipt}</p> : null}

      <table className="time-machine__table">
        <thead>
          <tr>
            <th scope="col">Team</th>
            <th className="time-machine__num" scope="col">After Wk {week}</th>
            <th className="time-machine__num" scope="col">Now</th>
            <th className="time-machine__num" scope="col" title="Change in title probability between the two boards, in percentage points.">
              Move
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((delta) => {
            const name = nameFor(delta.rosterId);
            if (!name) return null;
            const isUser = userRosterId != null && delta.rosterId === String(userRosterId);
            const tone = (delta.movePp ?? 0) > 0.05 ? 'up' : (delta.movePp ?? 0) < -0.05 ? 'down' : 'flat';
            return (
              <tr
                className={['time-machine__row', isUser ? 'time-machine__row--you' : ''].filter(Boolean).join(' ')}
                key={delta.rosterId}
              >
                <th className="time-machine__team" scope="row">
                  {name}
                  {isUser ? <span className="time-machine__you">You</span> : null}
                </th>
                {/* Blank, not a dash, for a team that was not on that board.
                    A dash reads as a price of nothing rather than as absence. */}
                <td className="time-machine__num time-machine__then">
                  {delta.thenOdds != null ? formatAmericanOdds(delta.thenOdds) : ''}
                </td>
                <td className="time-machine__num time-machine__now">
                  {delta.nowOdds != null ? formatAmericanOdds(delta.nowOdds) : ''}
                </td>
                <td className={`time-machine__num time-machine__move time-machine__move--${tone}`}>
                  {delta.movePp == null || Math.abs(delta.movePp) < 0.05
                    ? ''
                    : `${delta.movePp > 0 ? '+' : '−'}${Math.abs(delta.movePp).toFixed(1)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
