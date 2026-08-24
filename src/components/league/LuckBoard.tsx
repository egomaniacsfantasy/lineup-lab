import { useMemo } from 'react';
import type { AllPlayRow } from '../../utils/allPlay';
import {
  formatAllPlayRecord,
  formatExpectedRecord,
  formatLuck,
  luckSentence,
} from '../../utils/allPlay';
import './LuckBoard.css';

export interface LuckBoardTeam extends AllPlayRow {
  teamName: string;
  ownerName: string | null;
  isUser: boolean;
  /** Real head-to-head record, for the "what you got" column. */
  record: { wins: number; losses: number; ties: number };
  /** "5-3" against our closing spreads, or null when nothing is graded yet.
   *  Required rather than optional so the row builder cannot quietly omit it. */
  vsBook: string | null;
}

/**
 * The schedule board.
 *
 * The convention in this category is three stacked bar charts — actual vs
 * expected, the difference, and strength of schedule — above a sortable table
 * where the most interesting number in the whole product sits in an unemphasised
 * column. I went and looked at ffwrapped's Expected Wins page before building
 * this, and the problem is not that it is ugly. It is that it asks you to read
 * a table and infer a story it never tells: nowhere does it say "the schedule
 * cost this team 1.4 wins", even though that is the only reason anybody opened
 * the page.
 *
 * So this is not a chart. It is a board, the same one the rest of the app
 * speaks: one row per team, the number that matters set in price type, sorted
 * by the thing being measured, and a sentence at the top that can be read out
 * loud in a group chat without anyone needing the axis labels explained.
 *
 * Two records sit side by side because the whole idea is the gap between them:
 * what you GOT, and what you SCORED FOR.
 */
export function LuckBoard({ teams }: { teams: LuckBoardTeam[] }) {
  /* Sorted by all-play, not by record — the point of the board is to rank the
     league by scoring with the schedule taken out, so ordering it by the
     schedule-contaminated record would undercut the whole thing. */
  const rows = useMemo(
    () => [...teams].sort((a, b) => b.allPlayWinPct - a.allPlayWinPct),
    [teams],
  );

  const you = rows.find((row) => row.isUser) ?? null;
  const weeks = rows[0]?.weeksCounted ?? 0;

  if (weeks === 0) {
    return (
      <section className="luck-board">
        <p className="luck-board__empty">
          No completed weeks yet. This fills in once the league has played.
        </p>
      </section>
    );
  }

  /* The extremes are the story, so they are named rather than left to be found
     by scanning a column. */
  /* The column appears only once at least one team has been graded. A week
     whose closing spreads were never stored cannot be graded at all, and a
     header over a column of blanks claims a metric we do not have. */
  const showVsBook = rows.some((row) => row.vsBook);

  const luckiest = rows.reduce((best, row) => (row.luck > best.luck ? row : best), rows[0]);
  const unluckiest = rows.reduce((worst, row) => (row.luck < worst.luck ? row : worst), rows[0]);

  return (
    <section aria-labelledby="luck-board-title" className="luck-board">
      {/* The finding leads. It used to sit as small grey type above two cards
          that rendered a secondary fact at display size, so the loudest thing
          on the page was not the thing the page is about. */}
      <header className="luck-board__head">
        <p className="luck-board__kicker">Through {weeks} {weeks === 1 ? 'week' : 'weeks'}</p>
        {you ? (
          <h2 className="luck-board__lede" id="luck-board-title">
            {luckSentence(you, you.teamName)}
          </h2>
        ) : (
          <h2 className="luck-board__lede" id="luck-board-title">
            If everyone played everyone
          </h2>
        )}

        {/* The extremes are context for that sentence, so they sit with it as
            chips rather than owning a band of their own. */}
        <p className="luck-board__extremes">
          <span className="luck-board__extreme">
            <span className="luck-board__extreme-label">Helped most</span>
            <span className="luck-board__extreme-team">{luckiest.teamName}</span>
            <span className="luck-board__extreme-value luck-board__extreme-value--up">
              {formatLuck(luckiest.luck)}
            </span>
          </span>
          <span className="luck-board__extreme">
            <span className="luck-board__extreme-label">Hurt most</span>
            <span className="luck-board__extreme-team">{unluckiest.teamName}</span>
            <span className="luck-board__extreme-value luck-board__extreme-value--down">
              {formatLuck(unluckiest.luck)}
            </span>
          </span>
        </p>
      </header>

      <table className="luck-board__table">
        <thead>
          <tr>
            <th scope="col">Team</th>
            <th scope="col" className="luck-board__num" title="The real head-to-head record: who you actually played, and who won.">
              Record
            </th>
            <th scope="col" className="luck-board__num" title="Your record if you had played every team, every week. Ranks the league on scoring alone, with the schedule taken out.">
              All-play
            </th>
            <th scope="col" className="luck-board__num" title="The record your scoring earned: all-play win rate applied to the games you have played. Your record with the schedule removed.">
              xW-L
            </th>
            <th scope="col" className="luck-board__num" title="Record minus xW-L. What the schedule gave you, or took away, in wins.">
              Schedule
            </th>
            {showVsBook ? (
              <th scope="col" className="luck-board__num" title="Your record against our own closing spread. Covering as a favourite and covering as an underdog count the same: it asks whether you beat the number, not whether you won.">
                vs Book
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = row.luck > 0.05 ? 'up' : row.luck < -0.05 ? 'down' : 'flat';
            return (
              <tr
                className={[
                  'luck-board__row',
                  row.isUser ? 'luck-board__row--you' : '',
                ].filter(Boolean).join(' ')}
                key={row.rosterId}
              >
                <th scope="row" className="luck-board__team">
                  <span className="luck-board__team-name">{row.teamName}</span>
                  {row.isUser ? <span className="luck-board__you">You</span> : null}
                </th>
                {/* What you got. */}
                <td className="luck-board__num luck-board__record">
                  {row.record.wins}-{row.record.losses}
                  {row.record.ties > 0 ? `-${row.record.ties}` : ''}
                </td>
                {/* What you scored for, against the whole league. */}
                <td className="luck-board__num luck-board__allplay">
                  {formatAllPlayRecord(row)}
                  <span className="luck-board__pct">
                    {(row.allPlayWinPct * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="luck-board__num luck-board__earned">
                  {formatExpectedRecord(row)}
                </td>
                {/* The number the page exists for, set like a price. */}
                <td className={`luck-board__num luck-board__luck luck-board__luck--${tone}`}>
                  {formatLuck(row.luck)}
                </td>
                {showVsBook ? (
                  <td className="luck-board__num luck-board__vsbook">{row.vsBook ?? ''}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="luck-board__foot">
        All-play is your record against every team, every week, so it ranks the
        league on scoring with the schedule taken out. <strong>xW-L</strong> is the
        record that scoring earned. <strong>Schedule</strong> is what you got minus
        what you earned.{showVsBook ? ' vs Book is your record against our own closing spread.' : ''}
      </p>
    </section>
  );
}
